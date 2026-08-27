package br.com.w3ti.fina.mobile

import android.app.Application
import br.com.w3ti.fina.mobile.data.AppDatabase
import br.com.w3ti.fina.mobile.pairing.IdentityKeyStore
import br.com.w3ti.fina.mobile.sync.SyncRepository

/**
 * Composicao manual de dependencias — o app e pequeno o suficiente (uma
 * tela de pareamento, uma de lancamento) pra nao justificar um framework de
 * injecao.
 */
class FinaMobileApplication : Application() {
    lateinit var syncRepository: SyncRepository
        private set

    override fun onCreate() {
        super.onCreate()
        val database = AppDatabase.get(this)
        val identityKeyStore = IdentityKeyStore(this)
        syncRepository = SyncRepository(
            identityKeyStore = identityKeyStore,
            accountDao = database.accountDao(),
            categoryDao = database.categoryDao(),
            pendingTransactionDao = database.pendingTransactionDao(),
        )
    }
}
