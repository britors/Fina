package br.com.w3ti.fina.mobile.crypto

import org.bouncycastle.crypto.agreement.X25519Agreement
import org.bouncycastle.crypto.generators.X25519KeyPairGenerator
import org.bouncycastle.crypto.params.X25519KeyGenerationParameters
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters
import java.security.SecureRandom
import java.util.Base64

/**
 * Chaves X25519 em bytes crus (32 bytes cada), o formato que o app guarda e
 * troca em cima da rede — ver [SpkiCodec] para o envelope SPKI/DER que viaja
 * no protocolo (precisa bater com `publicKey.export({type:'spki',format:'der'})`
 * do node:crypto no desktop, em src/main/mobileCrypto.ts).
 */
data class X25519KeyPair(val privateKeyRaw: ByteArray, val publicKeyRaw: ByteArray)

object X25519 {
    private val secureRandom = SecureRandom()

    fun generateKeyPair(): X25519KeyPair {
        val generator = X25519KeyPairGenerator()
        generator.init(X25519KeyGenerationParameters(secureRandom))
        val pair = generator.generateKeyPair()
        val privateKey = pair.private as X25519PrivateKeyParameters
        val publicKey = pair.public as X25519PublicKeyParameters
        return X25519KeyPair(privateKey.encoded, publicKey.encoded)
    }

    /** ECDH cru (X25519(privateKey, peerPublicKey)) — mesmo valor que `diffieHellman()` produz no desktop. */
    fun agree(privateKeyRaw: ByteArray, peerPublicKeyRaw: ByteArray): ByteArray {
        val agreement = X25519Agreement()
        agreement.init(X25519PrivateKeyParameters(privateKeyRaw, 0))
        val shared = ByteArray(agreement.agreementSize)
        agreement.calculateAgreement(X25519PublicKeyParameters(peerPublicKeyRaw, 0), shared, 0)
        return shared
    }
}

/**
 * Envelope SPKI/DER (RFC 8410) usado para trocar chaves publicas X25519 no
 * handshake. Uma chave publica X25519 sempre tem 32 bytes e nenhum parametro
 * de algoritmo, entao o prefixo SPKI e uma constante fixa — nao precisamos de
 * um encoder ASN.1 completo, só concatenar prefixo + chave crua.
 *
 * Prefixo (12 bytes): SEQUENCE { SEQUENCE { OID 1.3.101.110 }, BIT STRING(0) }
 */
object SpkiCodec {
    private val X25519_SPKI_PREFIX = byteArrayOf(
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
    )

    fun encode(publicKeyRaw: ByteArray): ByteArray {
        require(publicKeyRaw.size == 32) { "Chave publica X25519 deve ter 32 bytes" }
        return X25519_SPKI_PREFIX + publicKeyRaw
    }

    fun encodeBase64(publicKeyRaw: ByteArray): String =
        Base64.getEncoder().encodeToString(encode(publicKeyRaw))

    fun decode(der: ByteArray): ByteArray {
        require(der.size == 44 && der.copyOfRange(0, 12).contentEquals(X25519_SPKI_PREFIX)) {
            "SPKI/DER invalido para chave publica X25519"
        }
        return der.copyOfRange(12, 44)
    }

    fun decodeBase64(base64: String): ByteArray = decode(Base64.getDecoder().decode(base64))
}
