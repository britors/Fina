package br.com.w3ti.fina.mobile.sync

import br.com.w3ti.fina.mobile.data.AccountEntity
import br.com.w3ti.fina.mobile.data.CategoryEntity
import br.com.w3ti.fina.mobile.data.PendingTransactionDao
import br.com.w3ti.fina.mobile.data.PendingTransactionEntity
import br.com.w3ti.fina.mobile.data.SyncStatus
import br.com.w3ti.fina.mobile.data.AccountDao
import br.com.w3ti.fina.mobile.data.CategoryDao
import br.com.w3ti.fina.mobile.pairing.IdentityKeyStore
import java.util.UUID
import kotlinx.coroutines.flow.Flow

data class SyncOutcome(val created: Int, val duplicate: Int, val rejected: Int)

/**
 * Ponto unico entre a UI e o protocolo de sincronizacao: abre a sessao TCP
 * (via [SyncClient]), decide se precisa parear primeiro, atualiza o cache
 * local de contas/categorias e esvazia a fila de lancamentos pendentes.
 *
 * Nao ha reconexao em segundo plano — assim como no desktop, a porta do
 * listener e efemera e so existe enquanto a tela "Sincronizar celular" esta
 * aberta la, entao toda sincronizacao (pareamento ou nao) parte de um QR
 * escaneado na hora.
 */
class SyncRepository(
    private val identityKeyStore: IdentityKeyStore,
    private val accountDao: AccountDao,
    private val categoryDao: CategoryDao,
    private val pendingTransactionDao: PendingTransactionDao,
) {
    private val syncClient = SyncClient(identityKeyStore::loadOrCreateKeyPair)

    val accounts: Flow<List<AccountEntity>> = accountDao.observeAll()
    val categories: Flow<List<CategoryEntity>> = categoryDao.observeAll()
    val outbox: Flow<List<PendingTransactionEntity>> = pendingTransactionDao.observeAll()

    suspend fun connect(ip: String, port: Int): SyncSession = syncClient.connect(ip, port)

    suspend fun confirmPairing(session: SyncSession): Boolean {
        val confirmed = session.awaitPairingConfirmation()
        if (confirmed) identityKeyStore.markPaired("Fina Desktop")
        return confirmed
    }

    /** Auto-cura o flag local quando o desktop diz que este device ja esta pareado (ver SyncSession.alreadyPaired). */
    fun rememberPaired() = identityKeyStore.markPaired("Fina Desktop")

    suspend fun refreshAccountsAndCategories(session: SyncSession) {
        val response = session.requestAccountsCategories()
        accountDao.replaceAll(response.accounts.map { AccountEntity(it.id, it.name, it.type) })
        categoryDao.replaceAll(response.categories.map { CategoryEntity(it.id, it.name, it.parentId, it.kind) })
    }

    suspend fun queueTransaction(
        accountId: String,
        categoryId: String,
        description: String,
        amount: Double,
        type: String,
        date: String,
        notes: String?,
    ) {
        pendingTransactionDao.insert(
            PendingTransactionEntity(
                clientId = UUID.randomUUID().toString(),
                accountId = accountId,
                categoryId = categoryId,
                description = description,
                amount = amount,
                type = type,
                date = date,
                notes = notes,
                createdAt = System.currentTimeMillis(),
                syncStatus = SyncStatus.PENDING,
            ),
        )
    }

    /** Descarta um lançamento rejeitado pelo desktop — sem isso ele ficaria preso na fila pra sempre. */
    suspend fun deleteTransaction(clientId: String) = pendingTransactionDao.delete(clientId)

    suspend fun flushPendingTransactions(session: SyncSession): SyncOutcome {
        val pending = pendingTransactionDao.getPending()
        if (pending.isEmpty()) return SyncOutcome(0, 0, 0)

        val results = session.pushTransactions(
            pending.map {
                TransactionInputDto(
                    clientId = it.clientId,
                    accountId = it.accountId,
                    categoryId = it.categoryId,
                    description = it.description,
                    amount = it.amount,
                    type = it.type,
                    date = it.date,
                    notes = it.notes,
                )
            },
        )

        var created = 0
        var duplicate = 0
        var rejected = 0
        val byClientId = pending.associateBy { it.clientId }
        for (result in results) {
            val original = byClientId[result.clientId] ?: continue
            when (result.status) {
                "created" -> { created++; pendingTransactionDao.delete(original.clientId) }
                "duplicate" -> { duplicate++; pendingTransactionDao.delete(original.clientId) }
                else -> {
                    rejected++
                    pendingTransactionDao.update(
                        original.copy(syncStatus = SyncStatus.REJECTED, rejectionReason = result.reason),
                    )
                }
            }
        }
        return SyncOutcome(created, duplicate, rejected)
    }
}
