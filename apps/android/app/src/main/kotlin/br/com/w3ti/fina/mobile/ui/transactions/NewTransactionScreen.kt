package br.com.w3ti.fina.mobile.ui.transactions

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import br.com.w3ti.fina.mobile.data.AccountEntity
import br.com.w3ti.fina.mobile.data.CategoryEntity
import java.time.LocalDate

// So despesa por enquanto: lancar receita continua exclusivo do desktop
// (decisao de produto — o celular e so pra registrar gastos do dia a dia).
private const val TRANSACTION_TYPE = "expense"

// O app e todo localizado em pt-BR (ver TransactionsScreen), entao o usuario
// naturalmente digita "1.500,00". Um replace(',', '.') ingenuo vira
// "1.500.00" (dois pontos), que toDoubleOrNull() rejeita — o botao SALVAR
// so ficava desabilitado, sem explicar o motivo. Só remove os pontos de
// milhar quando ha uma virgula decimal, pra nao quebrar "1500.00" digitado
// sem vírgula.
private fun parseAmountInput(raw: String): Double? {
    val clean = raw.trim()
    if (clean.isEmpty()) return null
    return if (clean.contains(',')) clean.replace(".", "").replace(',', '.').toDoubleOrNull()
    else clean.toDoubleOrNull()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewTransactionScreen(viewModel: TransactionsViewModel, onBack: () -> Unit) {
    val accounts by viewModel.accounts.collectAsState()
    val categories by viewModel.categories.collectAsState()

    var description by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var selectedAccount by remember { mutableStateOf<AccountEntity?>(null) }
    var selectedCategory by remember { mutableStateOf<CategoryEntity?>(null) }
    var notes by remember { mutableStateOf("") }

    // Arredonda pra centavos no ponto de entrada: evita que erro de ponto
    // flutuante binário (ex.: 0.1 + 0.2 != 0.3) se acumule ao longo da cadeia
    // sync -> Room -> desktop, já que o valor trafega como Double no protocolo.
    val amount = parseAmountInput(amountText)?.let { Math.round(it * 100) / 100.0 }
    val canSubmit = description.isNotBlank() && amount != null && amount > 0 &&
        selectedAccount != null && selectedCategory != null

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Novo lançamento", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            Modifier
                .fillMaxWidth()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Descrição") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = amountText,
                onValueChange = { amountText = it },
                label = { Text("Valor") },
                prefix = { Text("R$ ") },
                singleLine = true,
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
                shape = MaterialTheme.shapes.large,
                colors = ButtonDefaults.buttonColors(
                    disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                    disabledContentColor = MaterialTheme.colorScheme.onSurface,
                ),
                border = if (!canSubmit) BorderStroke(1.dp, MaterialTheme.colorScheme.outline) else null,
                modifier = Modifier.padding(top = 28.dp, bottom = 16.dp).fillMaxWidth().height(52.dp),
                onClick = {
                    viewModel.submitTransaction(
                        accountId = selectedAccount!!.id,
                        categoryId = selectedCategory!!.id,
                        description = description.trim(),
                        amount = amount!!,
                        type = TRANSACTION_TYPE,
                        date = LocalDate.now().toString(),
                        notes = notes.trim().ifBlank { null },
                        onSubmitted = onBack,
                    )
                },
            ) { Text("SALVAR", style = MaterialTheme.typography.titleMedium) }
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
