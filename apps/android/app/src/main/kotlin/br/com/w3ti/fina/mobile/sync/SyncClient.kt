package br.com.w3ti.fina.mobile.sync

import android.util.Log
import br.com.w3ti.fina.mobile.crypto.FrameSocket
import br.com.w3ti.fina.mobile.crypto.SpkiCodec
import br.com.w3ti.fina.mobile.crypto.X25519
import br.com.w3ti.fina.mobile.crypto.computeIdentityProof
import br.com.w3ti.fina.mobile.crypto.decryptFrame
import br.com.w3ti.fina.mobile.crypto.deriveSessionKeys
import br.com.w3ti.fina.mobile.crypto.encryptFrame
import br.com.w3ti.fina.mobile.crypto.identityProofValid
import br.com.w3ti.fina.mobile.pairing.IdentityKeyStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.security.SecureRandom
import java.util.Base64

private const val TAG = "FinaSync"

// encodeDefaults=true é essencial: SyncRequestMessage/PushTransactionsMessage
// tem `op` com valor padrao, e o kotlinx.serialization por padrao OMITE
// campos que estao no valor padrao ao gerar o JSON — sem isso, essas
// mensagens saiam como `{}` (sem "op"), o desktop recebia op=undefined e
// nao respondia nada (nao bate com nenhum handler), travando o celular
// esperando uma resposta que nunca viria.
internal val protocolJson = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

const val CONNECT_TIMEOUT_MS = 8_000
const val SYNC_READ_TIMEOUT_MS = 15_000

// Mesmo prazo que PAIRING_TIMEOUT_MS em apps/electron/src/main/mobileSync.ts
// — depois disso o desktop derruba a conexao pendente e o QR precisa ser
// escaneado de novo.
const val PAIRING_READ_TIMEOUT_MS = 120_000

class SyncError(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Uma conexao TCP ja autenticada (chave de sessao derivada) com o desktop
 * pareado. Espelha o protocolo de apps/electron/src/main/mobileSync.ts:
 * depois do handshake, todo frame e JSON cifrado com AES-256-GCM.
 */
class SyncSession internal constructor(
    private val socket: Socket,
    private val frame: FrameSocket,
    private val sessionKey: ByteArray,
    val pairingCode: String,
    /**
     * Decidido aqui no celular (não é só o que o desktop mandou em
     * `alreadyPaired`): só é true quando o desktop reconhece este celular *e*
     * a identidade de longo prazo recebida bate com a fixada numa confirmação
     * manual anterior, com prova de posse verificada (ver connect() abaixo).
     * Um peer malicioso pode mandar `alreadyPaired: true` livremente — por
     * isso o valor bruto do desktop nunca é usado sozinho pra pular a tela
     * de código.
     */
    val alreadyPaired: Boolean,
    /** Identidade de longo prazo do desktop recebida nesta conexão — ver IdentityKeyStore.pinDesktopIdentity(). */
    val desktopIdentityPublicKey: String,
    /** v1 envia `amount`; v2 envia `amount_cents`. */
    val protocolVersion: Int,
) {
    fun close() {
        runCatching { socket.close() }
    }

    /**
     * So usado logo apos o handshake quando o celular ainda nao esta em
     * `paired_devices` no desktop: o desktop nao manda nada ate o operador
     * digitar [pairingCode] na tela "Sincronizar celular" e confirmar — essa
     * chamada apenas espera esse frame (ou estoura o timeout).
     */
    suspend fun awaitPairingConfirmation(): Boolean = withContext(Dispatchers.IO) {
        Log.d(TAG, "awaitPairingConfirmation: esperando frame 'paired' (timeout ${PAIRING_READ_TIMEOUT_MS}ms)")
        socket.soTimeout = PAIRING_READ_TIMEOUT_MS
        val response = try {
            frame.readFrame()
        } catch (e: SocketTimeoutException) {
            Log.e(TAG, "awaitPairingConfirmation: timeout esperando confirmação", e)
            throw SyncError("O código não foi confirmado a tempo no desktop.", e)
        } catch (e: IOException) {
            Log.e(TAG, "awaitPairingConfirmation: conexão caiu esperando confirmação", e)
            throw SyncError("A conexão com o desktop caiu antes da confirmação. Tente parear de novo.", e)
        }
        val message = protocolJson.decodeFromString<PairedMessage>(decryptFrame(sessionKey, response))
        Log.d(TAG, "awaitPairingConfirmation: recebido op=${message.op} success=${message.success}")
        message.op == "paired" && message.success
    }

    suspend fun requestAccountsCategories(): AccountsCategoriesMessage = withContext(Dispatchers.IO) {
        Log.d(TAG, "requestAccountsCategories: enviando sync_request")
        socket.soTimeout = SYNC_READ_TIMEOUT_MS
        sendEncrypted(SyncRequestMessage())
        val response = readEncrypted()
        protocolJson.decodeFromString<AccountsCategoriesMessage>(response).also {
            Log.d(TAG, "requestAccountsCategories: recebidas ${it.accounts.size} contas, ${it.categories.size} categorias")
        }
    }

    suspend fun pushTransactions(items: List<TransactionInputDto>): List<PushResultDto> = withContext(Dispatchers.IO) {
        if (items.isEmpty()) return@withContext emptyList()
        Log.d(TAG, "pushTransactions: enviando ${items.size} lançamento(s)")
        socket.soTimeout = SYNC_READ_TIMEOUT_MS
        sendEncrypted(PushTransactionsMessage(items = items))
        val response = readEncrypted()
        protocolJson.decodeFromString<PushResultMessage>(response).results.also {
            Log.d(TAG, "pushTransactions: resultado ${it.map { r -> r.status }}")
        }
    }

    // Qualquer coisa de rede aqui (timeout, socket fechado do lado do
    // desktop, "connection reset") vira SyncError — nunca deixa uma
    // IOException crua escapar pro viewModelScope.launch em PairingViewModel,
    // que nao tem exception handler e derrubaria o app inteiro.
    private inline fun <reified T> sendEncrypted(message: T) {
        val json = protocolJson.encodeToString(message)
        try {
            frame.writeFrame(encryptFrame(sessionKey, json))
        } catch (e: IOException) {
            Log.e(TAG, "sendEncrypted: falha ao escrever no socket", e)
            throw SyncError("Não foi possível enviar dados para o desktop. Confira a conexão.", e)
        }
    }

    private fun readEncrypted(): String = try {
        decryptFrame(sessionKey, frame.readFrame())
    } catch (e: SocketTimeoutException) {
        Log.e(TAG, "readEncrypted: timeout esperando resposta do desktop", e)
        throw SyncError("O desktop não respondeu a tempo. Confira se a tela de sincronização ainda está aberta.", e)
    } catch (e: IOException) {
        Log.e(TAG, "readEncrypted: conexão caiu esperando resposta do desktop", e)
        throw SyncError("A conexão com o desktop caiu durante a sincronização.", e)
    }
}

/**
 * Abre a conexao com o desktop e roda o handshake X25519 (ver mobileCrypto.ts
 * no desktop para a descricao completa). O QR so carrega {ip, port}; nenhuma
 * chave viaja nele.
 */
class SyncClient(private val identityStore: IdentityKeyStore) {
    private val secureRandom = SecureRandom()

    suspend fun connect(ip: String, port: Int): SyncSession = withContext(Dispatchers.IO) {
        Log.d(TAG, "connect: conectando a $ip:$port")
        val identity = identityStore.loadOrCreateKeyPair()
        val socket = Socket()
        try {
            socket.connect(InetSocketAddress(ip, port), CONNECT_TIMEOUT_MS)
        } catch (e: Exception) {
            Log.e(TAG, "connect: falha ao conectar a $ip:$port", e)
            throw SyncError("Não foi possível conectar ao desktop. Confira se os dois aparelhos estão na mesma rede.", e)
        }
        Log.d(TAG, "connect: TCP conectado, iniciando handshake")
        val frame = FrameSocket(socket.getInputStream(), socket.getOutputStream())

        // 1. celular -> desktop, texto claro: identityPublicKey (SPKI/DER, base64) +
        // nonce (freshness da prova de identidade do desktop) + a identidade do
        // desktop que este celular já tem fixada, se houver (ver IdentityKeyStore).
        val ownSpkiDer = SpkiCodec.encode(identity.publicKeyRaw)
        val nonce = ByteArray(16).also { secureRandom.nextBytes(it) }
        val knownDesktopIdentity = identityStore.pinnedDesktopIdentity()
        try {
            frame.writeFrame(
                protocolJson.encodeToString(
                    HandshakeInit.serializer(),
                    HandshakeInit(
                        identityPublicKey = Base64.getEncoder().encodeToString(ownSpkiDer),
                        nonce = Base64.getEncoder().encodeToString(nonce),
                        knownDesktopIdentity = knownDesktopIdentity,
                    ),
                ).toByteArray(Charsets.UTF_8),
            )
        } catch (e: IOException) {
            Log.e(TAG, "connect: falha ao enviar identityPublicKey", e)
            socket.close()
            throw SyncError("Não foi possível iniciar o pareamento com o desktop.", e)
        }

        // 2. desktop -> celular, texto claro: ephemeralPublicKey + identityPublicKey + identityProof
        socket.soTimeout = CONNECT_TIMEOUT_MS
        val handshakeResponse = try {
            frame.readFrame()
        } catch (e: Exception) {
            Log.e(TAG, "connect: desktop não respondeu ao handshake", e)
            socket.close()
            throw SyncError("O desktop não respondeu ao pareamento.", e)
        }
        // Qualquer coisa fora do formato esperado aqui (JSON invalido, base64
        // invalido, chave com tamanho errado) vem de um peer que respondeu no
        // IP:porta do QR mas nao fala o protocolo esperado — nunca deve
        // derrubar o app (viewModelScope.launch nao tem exception handler).
        val session = try {
            val response = protocolJson.decodeFromString(
                HandshakeResponse.serializer(),
                handshakeResponse.toString(Charsets.UTF_8),
            )
            val peerSpkiDer = Base64.getDecoder().decode(response.ephemeralPublicKey)
            val peerPublicRaw = SpkiCodec.decode(peerSpkiDer)

            // 3. os dois lados derivam a mesma chave de sessao + codigo de pareamento.
            // Salt = [chave efemera do desktop] + [chave de identidade do celular],
            // nessa ordem nos dois lados — igual ao Buffer.concat em mobileCrypto.ts.
            val shared = X25519.agree(identity.privateKeyRaw, peerPublicRaw)
            val salt = peerSpkiDer + ownSpkiDer
            val keys = deriveSessionKeys(shared, salt)

            // Verifica a prova de posse da identidade de longo prazo do desktop
            // (ver computeIdentityProof em mobileCrypto.ts) ANTES de decidir se
            // confia em `response.alreadyPaired` — sem isso um MITM ativo podia
            // simplesmente mandar `alreadyPaired: true` e pular a confirmação
            // manual em toda reconexão, já que o desktop não tinha identidade
            // própria pra provar. proofSalt/proofMessage têm que usar exatamente
            // a mesma ordem de bytes calculada em mobileSync.ts do outro lado.
            val desktopIdentityDer = Base64.getDecoder().decode(response.identityPublicKey)
            val desktopIdentityRaw = SpkiCodec.decode(desktopIdentityDer)
            val staticShared = X25519.agree(identity.privateKeyRaw, desktopIdentityRaw)
            val proofSalt = ownSpkiDer + desktopIdentityDer
            val proofMessage = peerSpkiDer + nonce
            val expectedProof = computeIdentityProof(staticShared, proofSalt, proofMessage)
            val proofValid = identityProofValid(expectedProof, Base64.getDecoder().decode(response.identityProof))
            if (!proofValid) {
                Log.e(TAG, "connect: prova de identidade do desktop inválida")
                throw SyncError("O desktop não conseguiu provar sua identidade. Tente novamente ou pareie de novo.")
            }

            // Confiança local: exige a prova válida acima, que o desktop
            // reconheça este celular (response.alreadyPaired) *e* que a
            // identidade recebida bata com a que este celular já tinha
            // fixado — as três coisas ao mesmo tempo, nunca só a palavra do
            // peer. Se algum celular antigo (pareado antes desta correção)
            // ainda não tem nada fixado, isso cai em `false` e volta pro
            // fluxo normal de confirmação por código, que fixa a identidade
            // ao final — sem precisar de nenhuma ação manual de "esquecer
            // pareamento".
            val trusted = response.alreadyPaired && proofValid && knownDesktopIdentity == response.identityPublicKey
            Log.d(TAG, "connect: handshake ok, trusted=$trusted")

            SyncSession(
                socket, frame, keys.sessionKey, keys.pairingCode, trusted,
                response.identityPublicKey, response.protocolVersion.coerceIn(1, 2),
            )
        } catch (e: SyncError) {
            socket.close()
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "connect: resposta de handshake inválida", e)
            socket.close()
            throw SyncError("O desktop respondeu de forma inesperada ao pareamento. Tente novamente.", e)
        }

        session
    }
}
