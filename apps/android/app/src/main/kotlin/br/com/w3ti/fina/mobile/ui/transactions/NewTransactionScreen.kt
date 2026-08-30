package br.com.w3ti.fina.mobile.ui.transactions

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import br.com.w3ti.fina.mobile.data.AccountEntity
import br.com.w3ti.fina.mobile.data.CategoryEntity
import java.math.BigDecimal
import java.math.RoundingMode
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
internal fun parseAmountInput(raw: String): Double? {
    val clean = raw.trim()
    if (clean.isEmpty()) return null
    return if (clean.contains(',')) clean.replace(".", "").replace(',', '.').toDoubleOrNull()
    else clean.toDoubleOrNull()
}

internal fun formatCurrencyDigits(rawDigits: String): String {
    val digits = rawDigits.filter(Char::isDigit).takeLast(15)
    if (digits.isEmpty()) return "0,00"
    val padded = digits.padStart(3, '0')
    val cents = padded.takeLast(2)
    val whole = padded.dropLast(2).trimStart('0').ifEmpty { "0" }
    val grouped = whole.reversed().chunked(3).joinToString(".").reversed()
    return "$grouped,$cents"
}

internal fun amountToCurrencyDigits(amount: Double?): String = amount
    ?.takeIf { it.isFinite() && it > 0 }
    ?.let { BigDecimal.valueOf(it).movePointRight(2).setScale(0, RoundingMode.HALF_UP).toPlainString() }
    .orEmpty()

private object CurrencyVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val formatted = formatCurrencyDigits(text.text)
        val originalLength = text.text.length
        val mapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int =
                (formatted.length - (originalLength - offset.coerceIn(0, originalLength))).coerceIn(0, formatted.length)

            override fun transformedToOriginal(offset: Int): Int =
                (originalLength - (formatted.length - offset.coerceIn(0, formatted.length))).coerceIn(0, originalLength)
        }
        return TransformedText(AnnotatedString(formatted), mapping)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewTransactionScreen(
    viewModel: TransactionsViewModel,
    onBack: () -> Unit,
    editing: br.com.w3ti.fina.mobile.data.PendingTransactionEntity? = null,
) {
    val accounts by viewModel.accounts.collectAsState()
    val categories by viewModel.categories.collectAsState()

    var description by remember(editing?.clientId) { mutableStateOf(editing?.description.orEmpty()) }
    var amountDigits by remember(editing?.clientId) { mutableStateOf(amountToCurrencyDigits(editing?.amount)) }
    var selectedAccount by remember(editing?.clientId, accounts) {
        mutableStateOf(accounts.firstOrNull { it.id == editing?.accountId })
    }
    var selectedCategory by remember(editing?.clientId, categories) {
        mutableStateOf(categories.firstOrNull { it.id == editing?.categoryId })
    }
    var notes by remember(editing?.clientId) { mutableStateOf(editing?.notes.orEmpty()) }

    // Arredonda pra centavos no ponto de entrada: evita que erro de ponto
    // flutuante binário (ex.: 0.1 + 0.2 != 0.3) se acumule ao longo da cadeia
    // sync -> Room -> desktop, já que o valor trafega como Double no protocolo.
    val amount = amountDigits.toLongOrNull()?.div(100.0)
    val canSubmit = description.isNotBlank() && amount != null && amount.isFinite() && amount > 0 &&
        selectedAccount != null && selectedCategory != null

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (editing == null) "Novo lançamento" else "Corrigir lançamento", fontWeight = FontWeight.SemiBold) },
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
                value = amountDigits,
                onValueChange = { value -> amountDigits = value.filter(Char::isDigit).take(15) },
                label = { Text("Valor") },
                prefix = { Text("R$ ") },
                visualTransformation = CurrencyVisualTransformation,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
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
                    viewModel.saveTransaction(
                        clientId = editing?.clientId,
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
            ) { Text(if (editing == null) "SALVAR" else "SALVAR E REENVIAR", style = MaterialTheme.typography.titleMedium) }
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
