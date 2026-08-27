package br.com.w3ti.fina.mobile.ui.transactions

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.dp
import br.com.w3ti.fina.mobile.data.AccountEntity
import br.com.w3ti.fina.mobile.data.CategoryEntity
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewTransactionScreen(viewModel: TransactionsViewModel, onBack: () -> Unit) {
    val accounts by viewModel.accounts.collectAsState()
    val categories by viewModel.categories.collectAsState()

    var description by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("expense") }
    var selectedAccount by remember { mutableStateOf<AccountEntity?>(null) }
    var selectedCategory by remember { mutableStateOf<CategoryEntity?>(null) }
    var notes by remember { mutableStateOf("") }

    val amount = amountText.replace(',', '.').toDoubleOrNull()
    val canSubmit = description.isNotBlank() && amount != null && amount > 0 &&
        selectedAccount != null && selectedCategory != null

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Novo lançamento") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "Voltar") }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxWidth().padding(padding).padding(16.dp)) {
            Row {
                FilterChip(
                    selected = type == "expense",
                    onClick = { type = "expense" },
                    label = { Text("Despesa") },
                )
                Spacer(Modifier.size(8.dp))
                FilterChip(
                    selected = type == "income",
                    onClick = { type = "income" },
                    label = { Text("Receita") },
                )
            }

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Descrição") },
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            )

            OutlinedTextField(
                value = amountText,
                onValueChange = { amountText = it },
                label = { Text("Valor") },
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            )

            EntityDropdown(
                label = "Conta",
                items = accounts,
                itemLabel = { it.name },
                selected = selectedAccount,
                onSelected = { selectedAccount = it },
                modifier = Modifier.padding(top = 16.dp),
            )

            EntityDropdown(
                label = "Categoria",
                items = categories,
                itemLabel = { it.name },
                selected = selectedCategory,
                onSelected = { selectedCategory = it },
                modifier = Modifier.padding(top = 16.dp),
            )

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Notas (opcional)") },
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            )

            Button(
                enabled = canSubmit,
                modifier = Modifier.padding(top = 24.dp),
                onClick = {
                    viewModel.submitTransaction(
                        accountId = selectedAccount!!.id,
                        categoryId = selectedCategory!!.id,
                        description = description.trim(),
                        amount = amount!!,
                        type = type,
                        date = LocalDate.now().toString(),
                        notes = notes.trim().ifBlank { null },
                        onSubmitted = onBack,
                    )
                },
            ) { Text("Salvar") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T> EntityDropdown(
    label: String,
    items: List<T>,
    itemLabel: (T) -> String,
    selected: T?,
    onSelected: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = modifier) {
        OutlinedTextField(
            value = selected?.let(itemLabel) ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            items.forEach { item ->
                DropdownMenuItem(
                    text = { Text(itemLabel(item)) },
                    onClick = { onSelected(item); expanded = false },
                )
            }
        }
    }
}
