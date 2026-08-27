package br.com.w3ti.fina.mobile.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Cache local de `SELECT id, name, type FROM accounts` do desktop — so pra alimentar os seletores do formulario. */
@Entity(tableName = "cached_accounts")
data class AccountEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
)

/** Cache local de `SELECT id, name, parent_id, kind FROM categories` do desktop. */
@Entity(tableName = "cached_categories")
data class CategoryEntity(
    @PrimaryKey val id: String,
    val name: String,
    val parentId: String?,
    val kind: String,
)

/**
 * Fila de saida: todo lancamento criado no celular entra aqui primeiro
 * (o app funciona offline) e so sai da fila quando o desktop confirma
 * `status == "created"` ou `"duplicate"` num push_transactions. `clientId` e
 * o identificador estavel que garante idempotencia entre reenvios (mesmo
 * client_id nunca duplica no desktop, ver idx_transactions_mobile_origin).
 */
@Entity(tableName = "pending_transactions")
data class PendingTransactionEntity(
    @PrimaryKey val clientId: String,
    val accountId: String,
    val categoryId: String,
    val description: String,
    val amount: Double,
    val type: String,
    val date: String,
    val notes: String?,
    val createdAt: Long,
    val syncStatus: SyncStatus,
    val rejectionReason: String? = null,
)

enum class SyncStatus { PENDING, SENT, REJECTED }
