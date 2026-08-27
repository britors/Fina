package br.com.w3ti.fina.mobile.ui.common

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import br.com.w3ti.fina.mobile.sync.SyncRepository
import br.com.w3ti.fina.mobile.ui.pairing.PairingViewModel
import br.com.w3ti.fina.mobile.ui.transactions.TransactionsViewModel

class ViewModelFactory(private val syncRepository: SyncRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = when (modelClass) {
        PairingViewModel::class.java -> PairingViewModel(syncRepository) as T
        TransactionsViewModel::class.java -> TransactionsViewModel(syncRepository) as T
        else -> throw IllegalArgumentException("ViewModel desconhecido: $modelClass")
    }
}
