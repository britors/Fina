package br.com.w3ti.fina.mobile.ui.transactions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import br.com.w3ti.fina.mobile.data.PendingTransactionEntity
import br.com.w3ti.fina.mobile.data.SyncStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionsScreen(
    viewModel: TransactionsViewModel,
    onNewTransaction: () -> Unit,
    onSync: () -> Unit,
) {
    val outbox by viewModel.outbox.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Fina Mobile") },
                actions = {
                    IconButton(onClick = onSync) { Icon(Icons.Default.Refresh, contentDescription = "Sincronizar") }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onNewTransaction) { Icon(Icons.Default.Add, contentDescription = "Novo lançamento") }
        },
    ) { padding ->
        if (outbox.isEmpty()) {
            Column(
                Modifier.fillMaxSize().padding(padding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text("Nenhum lançamento ainda.", style = MaterialTheme.typography.bodyLarge)
                Text(
                    "Toque em + para lançar algo, ou no ícone de sincronizar para parear com o desktop.",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp, start = 32.dp, end = 32.dp),
                )
            }
            return@Scaffold
        }

        LazyColumn(Modifier.fillMaxSize().padding(padding)) {
            items(outbox, key = { it.clientId }) { transaction ->
                TransactionRow(transaction)
            }
        }
    }
}

@Composable
private fun TransactionRow(transaction: PendingTransactionEntity) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text(transaction.description, style = MaterialTheme.typography.bodyLarge)
            Text(
                "%s • %.2f • %s".format(transaction.date, transaction.amount, statusLabel(transaction.syncStatus)),
                style = MaterialTheme.typography.bodySmall,
                color = if (transaction.syncStatus == SyncStatus.REJECTED) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            transaction.rejectionReason?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

private fun statusLabel(status: SyncStatus): String = when (status) {
    SyncStatus.PENDING -> "aguardando sincronização"
    SyncStatus.SENT -> "enviado"
    SyncStatus.REJECTED -> "rejeitado pelo desktop"
}
