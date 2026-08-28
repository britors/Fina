package br.com.w3ti.fina.mobile.crypto

import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.generators.HKDFBytesGenerator
import org.bouncycastle.crypto.params.HKDFParameters
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class SessionKeys(val sessionKey: ByteArray, val pairingCode: String)

/**
 * Espelha `deriveSessionKeys()` de apps/electron/src/main/mobileCrypto.ts:
 * a mesma HKDF-SHA256, sobre o mesmo segredo ECDH e o mesmo salt, produz
 * tanto a chave de sessao (AES-256-GCM) quanto o codigo de pareamento de 6
 * digitos — os dois lados chegam ao mesmo valor de forma independente.
 *
 * `salt` deve ser [chave publica efemera do desktop] + [chave publica de
 * identidade do celular], nessa ordem, nos dois lados (ver SyncClient) — e o
 * que amarra a derivacao aquela conexao especifica.
 */
fun deriveSessionKeys(sharedSecret: ByteArray, salt: ByteArray): SessionKeys {
    val sessionKey = hkdf(sharedSecret, salt, "fina-mobile-session-v1", 32)
    val codeBytes = hkdf(sharedSecret, salt, "fina-pairing-code-v1", 4)
    val unsigned = ByteBuffer.wrap(codeBytes).order(ByteOrder.BIG_ENDIAN).int.toLong() and 0xFFFFFFFFL
    val code = (unsigned % 1_000_000L).toString().padStart(6, '0')
    return SessionKeys(sessionKey, code)
}

private fun hkdf(ikm: ByteArray, salt: ByteArray, info: String, length: Int): ByteArray {
    val generator = HKDFBytesGenerator(SHA256Digest())
    generator.init(HKDFParameters(ikm, salt, info.toByteArray(Charsets.UTF_8)))
    val out = ByteArray(length)
    generator.generateBytes(out, 0, length)
    return out
}

/**
 * Espelha `computeIdentityProof()` de apps/electron/src/main/mobileCrypto.ts:
 * HMAC-SHA256 sobre `message` com uma chave derivada (HKDF) de um segredo
 * ECDH estático-estático (as identidades de longo prazo, não as efêmeras da
 * sessão) + `salt`. Usado tanto para calcular a prova (SyncClient não faz
 * isso, só o desktop) quanto para verificá-la aqui — ver [identityProofValid].
 */
fun computeIdentityProof(sharedSecret: ByteArray, salt: ByteArray, message: ByteArray): ByteArray {
    val key = hkdf(sharedSecret, salt, "fina-mobile-identity-proof-v1", 32)
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(key, "HmacSHA256"))
    return mac.doFinal(message)
}

/** Comparação em tempo constante — a prova viaja em texto claro, não faz sentido vazar timing nela. */
fun identityProofValid(expected: ByteArray, received: ByteArray): Boolean = MessageDigest.isEqual(expected, received)

private const val GCM_IV_BYTES = 12
private const val GCM_TAG_BITS = 128
private const val GCM_TAG_BYTES = GCM_TAG_BITS / 8
private val secureRandom = SecureRandom()

/**
 * Enquadramento de um frame cifrado: [12 bytes iv][16 bytes auth tag][ciphertext],
 * igual ao `encryptFrame()`/`decryptFrame()` do desktop. O `Cipher` do JCA
 * devolve/espera [ciphertext][tag] grudados (ordem diferente do node:crypto,
 * que separa via `getAuthTag()`) — por isso a reordenacao manual abaixo.
 */
fun encryptFrame(sessionKey: ByteArray, messageJson: String): ByteArray {
    val iv = ByteArray(GCM_IV_BYTES).also { secureRandom.nextBytes(it) }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(sessionKey, "AES"), GCMParameterSpec(GCM_TAG_BITS, iv))
    val ciphertextAndTag = cipher.doFinal(messageJson.toByteArray(Charsets.UTF_8))
    val ciphertext = ciphertextAndTag.copyOfRange(0, ciphertextAndTag.size - GCM_TAG_BYTES)
    val tag = ciphertextAndTag.copyOfRange(ciphertextAndTag.size - GCM_TAG_BYTES, ciphertextAndTag.size)
    return iv + tag + ciphertext
}

fun decryptFrame(sessionKey: ByteArray, frame: ByteArray): String {
    val iv = frame.copyOfRange(0, GCM_IV_BYTES)
    val tag = frame.copyOfRange(GCM_IV_BYTES, GCM_IV_BYTES + GCM_TAG_BYTES)
    val ciphertext = frame.copyOfRange(GCM_IV_BYTES + GCM_TAG_BYTES, frame.size)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(sessionKey, "AES"), GCMParameterSpec(GCM_TAG_BITS, iv))
    val plaintext = cipher.doFinal(ciphertext + tag)
    return plaintext.toString(Charsets.UTF_8)
}
