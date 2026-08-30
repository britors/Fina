package br.com.w3ti.fina.mobile.ui.transactions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import br.com.w3ti.fina.mobile.data.PendingTransactionEntity
import br.com.w3ti.fina.mobile.data.SyncStatus
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val ptBr: Locale = Locale.forLanguageTag("pt-BR")
private val currencyFormat: NumberFormat = NumberFormat.getCurrencyInstance(ptBr)
private val dateFormatter = DateTimeFormatter.ofPattern("d 'de' MMM", ptBr)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionsScreen(
    viewModel: TransactionsViewModel,
    onNewTransaction: () -> Unit,
    onSync: () -> Unit,
    onEditTransaction: (String) -> Unit,
) {
    val outbox by viewModel.outbox.collectAsState()
    val accounts by viewModel.accounts.collectAsState()
    val categories by viewModel.categories.collectAsState()
    val canLaunch = accounts.isNotEmpty() && categories.isNotEmpty()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Fina Mobile", fontWeight = FontWeight.SemiBold) },
                actions = {
                    IconButton(onClick = onSync) { Icon(Icons.Default.Sync, contentDescription = "Sincronizar") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            // So da pra lancar depois que Conta/Categoria vieram do desktop
            // num sync — antes disso o formulario nao tem o que oferecer.
            if (canLaunch) {
                FloatingActionButton(onClick = onNewTransaction) { Icon(Icons.Default.Add, contentDescription = "Novo lançamento") }
            }
        },
    ) { padding ->
        if (outbox.isEmpty()) {
            EmptyState(canLaunch, Modifier.padding(padding))
            return@Scaffold
        }

        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp),
        ) {
            items(outbox, key = { it.clientId }) { transaction ->
                TransactionRow(
                    transaction,
                    onDelete = { viewModel.deleteTransaction(transaction.clientId) },
                    onEdit = { onEditTransaction(transaction.clientId) },
                )
            }
        }
    }
}

@Composable
private fun EmptyState(canLaunch: Boolean, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
        ) {
            Icon(
                if (canLaunch) Icons.AutoMirrored.Filled.ReceiptLong else Icons.Default.Sync,
                contentDescription = null,
                modifier = Modifier.padding(20.dp).size(36.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            if (canLaunch) "Nenhum lançamento ainda" else "Sincronize com o desktop primeiro",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 20.dp),
        )
        Text(
            if (canLaunch) {
                "Toque em + para lançar algo, ou no ícone de sincronizar para parear com o desktop."
            } else {
                "Toque no ícone de sincronizar para parear com o desktop e trazer suas contas e categorias — só depois disso dá pra lançar algo aqui."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun TransactionRow(transaction: PendingTransactionEntity, onDelete: () -> Unit, onEdit: () -> Unit) {
    val isExpense = transaction.type == "expense"
    val amountColor = if (isExpense) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    val iconContainer = if (isExpense) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer
    val iconTint = if (isExpense) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer

    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = iconContainer) {
                Icon(
                    if (isExpense) Icons.AutoMirrored.Filled.TrendingDown else Icons.AutoMirrored.Filled.TrendingUp,
                    contentDescription = null,
                    modifier = Modifier.padding(10.dp).size(20.dp),
                    tint = iconTint,
                )
            }

            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(transaction.description, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                    Text(
                        formatDate(transaction.date),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    StatusBadge(transaction.syncStatus, Modifier.padding(start = 8.dp))
                }
                transaction.rejectionReason?.let {
                    Text(
                        friendlyRejectionReason(it),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }

            Text(
                "${if (isExpense) "-" else "+"}${currencyFormat.format(transaction.amount)}",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = amountColor,
            )

            // Rejeitado nunca mais vai ser reenviado sozinho — sem isso ficaria
            // preso na fila pra sempre, sem nenhuma acao possivel.
            if (transaction.syncStatus == SyncStatus.REJECTED) {
                IconButton(onClick = onEdit, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Default.Edit,
                        contentDescription = "Corrigir lançamento",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
                IconButton(onClick = onDelete, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Descartar lançamento",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private fun friendlyRejectionReason(reason: String): String = when (reason) {
    "account_not_found" -> "A conta usada não existe mais no desktop."
    "category_not_found" -> "A categoria usada não existe mais no desktop."
    else -> reason
}

@Composable
private fun StatusBadge(status: SyncStatus, modifier: Modifier = Modifier) {
    val (label, container, content) = when (status) {
        SyncStatus.PENDING -> Triple("aguardando", MaterialTheme.colorScheme.tertiaryContainer, MaterialTheme.colorScheme.onTertiaryContainer)
        SyncStatus.SENT -> Triple("enviado", MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer)
        SyncStatus.REJECTED -> Triple("rejeitado", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
    }
    Surface(shape = RoundedCornerShape(6.dp), color = container, modifier = modifier) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = content,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

private fun formatDate(iso: String): String = try {
    LocalDate.parse(iso).format(dateFormatter).replaceFirstChar { it.titlecase(ptBr) }
} catch (_: Exception) {
    iso
}
