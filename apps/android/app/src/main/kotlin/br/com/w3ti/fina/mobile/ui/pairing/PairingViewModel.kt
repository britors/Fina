package br.com.w3ti.fina.mobile.ui.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.w3ti.fina.mobile.pairing.QrParseResult
import br.com.w3ti.fina.mobile.pairing.parseQrPayload
import br.com.w3ti.fina.mobile.sync.SyncError
import br.com.w3ti.fina.mobile.sync.SyncOutcome
import br.com.w3ti.fina.mobile.sync.SyncRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface PairingUiState {
    data object Scanning : PairingUiState
    data object Connecting : PairingUiState
    data class WaitingForConfirmation(val pairingCode: String) : PairingUiState
    data object Syncing : PairingUiState
    data class Success(val outcome: SyncOutcome) : PairingUiState
    data class Error(val message: String) : PairingUiState
}

class PairingViewModel(private val syncRepository: SyncRepository) : ViewModel() {
    private val _state = MutableStateFlow<PairingUiState>(PairingUiState.Scanning)
    val state: StateFlow<PairingUiState> = _state.asStateFlow()

    // Trava o scanner assim que o primeiro QR valido chega — a camera continua
    // entregando frames enquanto a corrotina de sync roda.
    private var handlingQr = false

    fun onQrDetected(raw: String) {
        if (handlingQr) return
        handlingQr = true
        viewModelScope.launch {
            when (val parsed = parseQrPayload(raw)) {
                is QrParseResult.Success -> runSync(parsed.payload.ip, parsed.payload.port)
                QrParseResult.UnsupportedVersion ->
                    fail("Este QR code foi gerado por uma versão mais nova do Fina desktop. Atualize o Fina Mobile.")
                QrParseResult.Invalid -> fail("QR code inválido. Abra a tela \"Sincronizar celular\" no desktop e tente de novo.")
            }
        }
    }

    fun retry() {
        handlingQr = false
        _state.value = PairingUiState.Scanning
    }

    private suspend fun runSync(ip: String, port: Int) {
        _state.value = PairingUiState.Connecting
        val session = try {
            syncRepository.connect(ip, port)
        } catch (e: SyncError) {
            fail(e.message ?: "Falha ao conectar ao desktop.")
            return
        }
        try {
            if (!syncRepository.isPaired()) {
                _state.value = PairingUiState.WaitingForConfirmation(session.pairingCode)
                val confirmed = syncRepository.confirmPairing(session)
                if (!confirmed) {
                    fail("O pareamento não foi confirmado no desktop.")
                    return
                }
            }
            _state.value = PairingUiState.Syncing
            syncRepository.refreshAccountsAndCategories(session)
            val outcome = syncRepository.flushPendingTransactions(session)
            _state.value = PairingUiState.Success(outcome)
        } catch (e: SyncError) {
            fail(e.message ?: "Falha na sincronização.")
        } finally {
            session.close()
        }
    }

    private fun fail(message: String) {
        _state.value = PairingUiState.Error(message)
    }
}
