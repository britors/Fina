package br.com.w3ti.fina.mobile.pairing

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Conteudo do QR mostrado na tela "Sincronizar celular" do desktop — so o
 * suficiente pra abrir a conexao TCP; nenhuma chave viaja no QR (ver
 * apps/electron/src/renderer/pages/mobileSync.ts, `QRCode.toDataURL`).
 */
@Serializable
data class QrPayload(val v: Int, val ip: String, val port: Int)

private val json = Json { ignoreUnknownKeys = true }

sealed interface QrParseResult {
    data class Success(val payload: QrPayload) : QrParseResult
    data object UnsupportedVersion : QrParseResult
    data object Invalid : QrParseResult
}

fun parseQrPayload(raw: String): QrParseResult {
    val payload = try {
        json.decodeFromString<QrPayload>(raw)
    } catch (_: Exception) {
        return QrParseResult.Invalid
    }
    if (payload.v != 1) return QrParseResult.UnsupportedVersion
    if (payload.ip.isBlank() || payload.port !in 1..65535) return QrParseResult.Invalid
    return QrParseResult.Success(payload)
}
