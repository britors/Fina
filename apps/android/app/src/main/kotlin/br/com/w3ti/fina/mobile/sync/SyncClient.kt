package br.com.w3ti.fina.mobile.sync

import br.com.w3ti.fina.mobile.crypto.FrameSocket
import br.com.w3ti.fina.mobile.crypto.SpkiCodec
import br.com.w3ti.fina.mobile.crypto.X25519
import br.com.w3ti.fina.mobile.crypto.X25519KeyPair
import br.com.w3ti.fina.mobile.crypto.decryptFrame
import br.com.w3ti.fina.mobile.crypto.deriveSessionKeys
import br.com.w3ti.fina.mobile.crypto.encryptFrame
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.Base64

private val protocolJson = Json { ignoreUnknownKeys = true }

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
        socket.soTimeout = PAIRING_READ_TIMEOUT_MS
        val response = try {
            frame.readFrame()
        } catch (e: SocketTimeoutException) {
            throw SyncError("O código não foi confirmado a tempo no desktop.", e)
        }
        val message = protocolJson.decodeFromString<PairedMessage>(decryptFrame(sessionKey, response))
        message.op == "paired" && message.success
    }

    suspend fun requestAccountsCategories(): AccountsCategoriesMessage = withContext(Dispatchers.IO) {
        socket.soTimeout = SYNC_READ_TIMEOUT_MS
        sendEncrypted(SyncRequestMessage())
        val response = readEncrypted()
        protocolJson.decodeFromString(response)
    }

    suspend fun pushTransactions(items: List<TransactionInputDto>): List<PushResultDto> = withContext(Dispatchers.IO) {
        if (items.isEmpty()) return@withContext emptyList()
        socket.soTimeout = SYNC_READ_TIMEOUT_MS
        sendEncrypted(PushTransactionsMessage(items = items))
        val response = readEncrypted()
        protocolJson.decodeFromString<PushResultMessage>(response).results
    }

    private inline fun <reified T> sendEncrypted(message: T) {
        val json = protocolJson.encodeToString(message)
        frame.writeFrame(encryptFrame(sessionKey, json))
    }

    private fun readEncrypted(): String = try {
        decryptFrame(sessionKey, frame.readFrame())
    } catch (e: SocketTimeoutException) {
        throw SyncError("O desktop não respondeu a tempo. Confira se a tela de sincronização ainda está aberta.", e)
    }
}

/**
 * Abre a conexao com o desktop e roda o handshake X25519 (ver mobileCrypto.ts
 * no desktop para a descricao completa). O QR so carrega {ip, port}; nenhuma
 * chave viaja nele.
 */
class SyncClient(private val loadIdentity: () -> X25519KeyPair) {
    suspend fun connect(ip: String, port: Int): SyncSession = withContext(Dispatchers.IO) {
        val identity = loadIdentity()
        val socket = Socket()
        try {
            socket.connect(InetSocketAddress(ip, port), CONNECT_TIMEOUT_MS)
        } catch (e: Exception) {
            throw SyncError("Não foi possível conectar ao desktop. Confira se os dois aparelhos estão na mesma rede.", e)
        }
        val frame = FrameSocket(socket.getInputStream(), socket.getOutputStream())

        // 1. celular -> desktop, texto claro: identityPublicKey (SPKI/DER, base64)
        val ownSpkiDer = SpkiCodec.encode(identity.publicKeyRaw)
        frame.writeFrame(
            protocolJson.encodeToString(
                HandshakeInit.serializer(),
                HandshakeInit(Base64.getEncoder().encodeToString(ownSpkiDer)),
            ).toByteArray(Charsets.UTF_8),
        )

        // 2. desktop -> celular, texto claro: ephemeralPublicKey
        socket.soTimeout = CONNECT_TIMEOUT_MS
        val handshakeResponse = try {
            frame.readFrame()
        } catch (e: Exception) {
            socket.close()
            throw SyncError("O desktop não respondeu ao pareamento.", e)
        }
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

        SyncSession(socket, frame, keys.sessionKey, keys.pairingCode)
    }
}
