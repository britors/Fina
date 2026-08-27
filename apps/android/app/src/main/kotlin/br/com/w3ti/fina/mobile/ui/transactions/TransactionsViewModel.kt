package br.com.w3ti.fina.mobile.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.w3ti.fina.mobile.data.AccountEntity
import br.com.w3ti.fina.mobile.data.CategoryEntity
import br.com.w3ti.fina.mobile.data.PendingTransactionEntity
import br.com.w3ti.fina.mobile.sync.SyncRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class TransactionsViewModel(private val syncRepository: SyncRepository) : ViewModel() {
    val accounts: StateFlow<List<AccountEntity>> =
        syncRepository.accounts.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val categories: StateFlow<List<CategoryEntity>> =
        syncRepository.categories.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val outbox: StateFlow<List<PendingTransactionEntity>> =
        syncRepository.outbox.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun submitTransaction(
        accountId: String,
        categoryId: String,
        description: String,
        amount: Double,
        type: String,
        date: String,
        notes: String?,
        onSubmitted: () -> Unit,
    ) {
        viewModelScope.launch {
            syncRepository.queueTransaction(accountId, categoryId, description, amount, type, date, notes)
            onSubmitted()
        }
    }

    fun deleteTransaction(clientId: String) {
        viewModelScope.launch { syncRepository.deleteTransaction(clientId) }
    }
}
