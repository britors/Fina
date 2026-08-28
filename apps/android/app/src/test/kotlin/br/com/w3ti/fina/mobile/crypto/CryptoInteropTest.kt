package br.com.w3ti.fina.mobile.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

/**
 * Vetor de teste gerado rodando as MESMAS chamadas de node:crypto que
 * apps/electron/src/main/mobileCrypto.ts usa (script descartavel, nao
 * commitado — gera um par de chaves X25519 de verdade, deriva o segredo
 * ECDH, a chave de sessao e um frame cifrado real). Isso valida a
 * implementacao BouncyCastle do celular contra a saida literal do desktop,
 * nao uma reimplementacao que "deveria" bater.
 */
private const val DESKTOP_PUBLIC_RAW_HEX = "b2b03a8bc61d364cc9da1ff6a2924842cca1a317010375d6159085e2a6bbee3b"
private const val DESKTOP_PUBLIC_SPKI_B64 = "MCowBQYDK2VuAyEAsrA6i8YdNkzJ2h/2opJIQsyhoxcBA3XWFZCF4qa77js="
private const val PHONE_PRIVATE_RAW_HEX = "289c3ea63c2fb2f7c7ade5057439a9f4b08d4e3222fdb0319f3422b344dfb36f"
private const val PHONE_PUBLIC_RAW_HEX = "282719da51486b7e9b010dcc21b20dcca5eb97f4a78f770396575afbd54a3c1f"
private const val PHONE_PUBLIC_SPKI_B64 = "MCowBQYDK2VuAyEAKCcZ2lFIa36bAQ3MIbINzKXrl/Snj3cDllda+9VKPB8="
private const val SHARED_SECRET_HEX = "62bf3609a53694cddb0cd04ff42d2fcd2da5494a9a68f3fbb143d4ce16934177"
private const val SALT_B64 = "MCowBQYDK2VuAyEAsrA6i8YdNkzJ2h/2opJIQsyhoxcBA3XWFZCF4qa77jswKjAFBgMrZW4DIQAoJxnaUUhrfpsBDcwhsg3MpeuX9KePdwOWV1r71Uo8Hw=="
private const val SESSION_KEY_HEX = "18c7dce0f46d97f0fe2569a660de013a44d8f2237013fd7a5894ac17a05e67ae"
private const val PAIRING_CODE = "262071"
private const val ENCRYPTED_SYNC_REQUEST_FRAME_HEX = "c99c2909b8743ae26712d113ebed68c6e650223e43cee013ad70cb671e41b632228dda52d9850e5693495f4c9ab8d45f69"

// Vetor de teste pra computeIdentityProof()/identityProofValid(), gerado do
// mesmo jeito que o bloco acima: rodando computeIdentityProof() de verdade
// em apps/electron/src/main/mobileCrypto.ts (script descartável, não
// commitado) com um par de identidades X25519 reais.
private const val ID_DESKTOP_PRIVATE_RAW_HEX = "505eeeb521c0371acab8f1f22f1cb301f64638dcaa2765a594dfcdf4dd6af55c"
private const val ID_DESKTOP_PUBLIC_RAW_HEX = "cfbc5a5d602fe8c37aea1373784715424c063e3a2f628f7dff38c0a6d594ca62"
private const val ID_PHONE_PRIVATE_RAW_HEX = "c81b0f75697cd19a8b3d1ad26270c092b32ac95ec949c621475d82f2c9b57457"
private const val ID_PHONE_PUBLIC_RAW_HEX = "7ce403f27bb3cf62ff56316f2c8da840b461bb897a3c9a5b959d22ad6ccc7f66"
private const val ID_PHONE_PUBLIC_SPKI_B64 = "MCowBQYDK2VuAyEAfOQD8nuzz2L/VjFvLI2oQLRhu4l6PJpblZ0irWzMf2Y="
private const val ID_DESKTOP_PUBLIC_SPKI_B64 = "MCowBQYDK2VuAyEAz7xaXWAv6MN66hNzeEcVQkwGPjovYo99/zjAptWUymI="
private const val ID_MESSAGE = "ephemeral-pub-der-bytes-here"
private const val ID_EXPECTED_PROOF_HEX = "3f9cb486ba96dafec620335eabe7d2ee36f72d97b8acabbe9044b8412b222b22"

private fun hex(s: String): ByteArray = ByteArray(s.length / 2) { i -> s.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

class CryptoInteropTest {
    @Test
    fun `spki encode matches node export`() {
        assertEquals(DESKTOP_PUBLIC_SPKI_B64, SpkiCodec.encodeBase64(hex(DESKTOP_PUBLIC_RAW_HEX)))
    }

    @Test
    fun `spki decode extracts the same raw key node started from`() {
        assertEquals(PHONE_PUBLIC_RAW_HEX, SpkiCodec.decodeBase64(PHONE_PUBLIC_SPKI_B64).toHex())
    }

    @Test
    fun `X25519 agreement matches node diffieHellman`() {
        val shared = X25519.agree(hex(PHONE_PRIVATE_RAW_HEX), hex(DESKTOP_PUBLIC_RAW_HEX))
        assertEquals(SHARED_SECRET_HEX, shared.toHex())
    }

    @Test
    fun `session key and pairing code match node hkdfSync derivation`() {
        val salt = Base64.getDecoder().decode(SALT_B64)
        val keys = deriveSessionKeys(hex(SHARED_SECRET_HEX), salt)
        assertEquals(SESSION_KEY_HEX, keys.sessionKey.toHex())
        assertEquals(PAIRING_CODE, keys.pairingCode)
    }

    @Test
    fun `decryptFrame reads a real frame produced by node encryptFrame`() {
        val plaintext = decryptFrame(hex(SESSION_KEY_HEX), hex(ENCRYPTED_SYNC_REQUEST_FRAME_HEX))
        assertEquals("{\"op\":\"sync_request\"}", plaintext)
    }

    @Test
    fun `encryptFrame output round-trips through decryptFrame`() {
        val sessionKey = hex(SESSION_KEY_HEX)
        val frame = encryptFrame(sessionKey, "{\"op\":\"push_transactions\",\"items\":[]}")
        assertEquals("{\"op\":\"push_transactions\",\"items\":[]}", decryptFrame(sessionKey, frame))
    }

    @Test
    fun `computeIdentityProof matches node's computeIdentityProof (static-static ECDH + HKDF + HMAC)`() {
        // Do lado do celular: ECDH(chave privada do celular, chave pública de
        // identidade do desktop) — mesma ordem que SyncClient.connect() usa.
        val staticShared = X25519.agree(hex(ID_PHONE_PRIVATE_RAW_HEX), hex(ID_DESKTOP_PUBLIC_RAW_HEX))
        val salt = Base64.getDecoder().decode(ID_PHONE_PUBLIC_SPKI_B64) + Base64.getDecoder().decode(ID_DESKTOP_PUBLIC_SPKI_B64)
        val message = ID_MESSAGE.toByteArray(Charsets.UTF_8)

        val proof = computeIdentityProof(staticShared, salt, message)

        assertEquals(ID_EXPECTED_PROOF_HEX, proof.toHex())
        assertTrue(identityProofValid(hex(ID_EXPECTED_PROOF_HEX), proof))
    }

    @Test
    fun `static-static ECDH is commutative, same as the session ECDH`() {
        val fromPhoneSide = X25519.agree(hex(ID_PHONE_PRIVATE_RAW_HEX), hex(ID_DESKTOP_PUBLIC_RAW_HEX))
        val fromDesktopSide = X25519.agree(hex(ID_DESKTOP_PRIVATE_RAW_HEX), hex(ID_PHONE_PUBLIC_RAW_HEX))
        assertEquals(fromPhoneSide.toHex(), fromDesktopSide.toHex())
    }
}
