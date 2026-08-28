package br.com.w3ti.fina.mobile.ui.pairing

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.w3ti.fina.mobile.pairing.QrParseResult
import br.com.w3ti.fina.mobile.pairing.parseQrPayload
import br.com.w3ti.fina.mobile.sync.SyncError
import br.com.w3ti.fina.mobile.sync.SyncOutcome
import br.com.w3ti.fina.mobile.sync.SyncRepository
import kotlinx.coroutines.CancellationException
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
        Log.d(TAG, "QR detectado: $raw")
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
        Log.d(TAG, "retry: voltando pra Scanning")
        handlingQr = false
        _state.value = PairingUiState.Scanning
    }

    private suspend fun runSync(ip: String, port: Int) {
        Log.d(TAG, "runSync: iniciando com $ip:$port")
        _state.value = PairingUiState.Connecting
        val session = try {
            syncRepository.connect(ip, port)
        } catch (e: SyncError) {
            Log.e(TAG, "runSync: connect falhou", e)
            fail(e.message ?: "Falha ao conectar ao desktop.")
            return
        } catch (e: CancellationException) {
            throw e // cancelamento estrutural (ViewModel limpo etc.) — nunca engolir
        } catch (e: Exception) {
            // loadIdentity() (IdentityKeyStore) roda dentro de SyncClient.connect
            // antes de qualquer I/O de rede e pode lançar (Keystore/prefs
            // corrompidos) sem virar SyncError — não deixa subir e derrubar o app.
            Log.e(TAG, "runSync: exceção inesperada ao conectar", e)
            fail(e.message ?: "Falha inesperada ao conectar ao desktop.")
            return
        }
        try {
            // A fonte de verdade e o desktop (session.alreadyPaired), nunca o
            // flag local: se o app foi fechado entre o desktop confirmar o
            // pareamento e o celular persistir isso (ex: processo morto pelo
            // Android no meio da espera), o desktop ja reconhece o device na
            // proxima conexao mesmo sem o celular saber disso.
            if (session.alreadyPaired) {
                Log.d(TAG, "runSync: desktop já reconhece este device, pulando confirmação")
                syncRepository.rememberPaired()
            } else {
                Log.d(TAG, "runSync: aguardando confirmação de pareamento, código=${session.pairingCode}")
                _state.value = PairingUiState.WaitingForConfirmation(session.pairingCode)
                val confirmed = syncRepository.confirmPairing(session)
                Log.d(TAG, "runSync: confirmação=$confirmed")
                if (!confirmed) {
                    fail("O pareamento não foi confirmado no desktop.")
                    return
                }
            }
            _state.value = PairingUiState.Syncing
            syncRepository.refreshAccountsAndCategories(session)
            val outcome = syncRepository.flushPendingTransactions(session)
            Log.d(TAG, "runSync: sucesso, outcome=$outcome")
            _state.value = PairingUiState.Success(outcome)
        } catch (e: SyncError) {
            Log.e(TAG, "runSync: SyncError", e)
            fail(e.message ?: "Falha na sincronização.")
        } catch (e: CancellationException) {
            throw e // cancelamento estrutural (ViewModel limpo etc.) — nunca engolir
        } catch (e: Exception) {
            // Rede caiu de um jeito que SyncClient nao converteu pra SyncError
            // (ou um bug em outro lugar do fluxo) — melhor mostrar um erro
            // generico do que deixar a excecao subir e derrubar o app: essa
            // corrotina roda em viewModelScope, que nao tem exception handler.
            Log.e(TAG, "runSync: exceção inesperada", e)
            fail(e.message ?: "Falha inesperada na sincronização.")
        } finally {
            session.close()
        }
    }

    private fun fail(message: String) {
        Log.w(TAG, "fail: $message")
        _state.value = PairingUiState.Error(message)
    }
}

private const val TAG = "FinaSync"
