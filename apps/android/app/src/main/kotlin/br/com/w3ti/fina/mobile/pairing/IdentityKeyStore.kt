package br.com.w3ti.fina.mobile.pairing

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import br.com.w3ti.fina.mobile.crypto.X25519
import br.com.w3ti.fina.mobile.crypto.X25519KeyPair
import java.util.Base64

private const val PREFS_FILE = "fina_mobile_identity"
private const val KEY_PRIVATE = "identity_private_key"
private const val KEY_PUBLIC = "identity_public_key"
private const val KEY_PAIRED = "is_paired"
private const val KEY_DEVICE_LABEL = "paired_device_label"

/**
 * Guarda a chave de identidade X25519 de longo prazo do celular (gerada uma
 * unica vez, ver comentario em mobileCrypto.ts sobre a simplificacao de nao
 * ter um ratchet por sessao do lado mobile) e o flag local "ja pareei
 * alguma vez com esse desktop". Criptografado com uma chave do Android
 * Keystore — se o dispositivo for trocado ou os dados do app apagados, a
 * identidade se perde e o celular precisa ser pareado de novo (esperado:
 * allowBackup="false" no manifest ja garante que isso nao sobrevive a um
 * restore).
 */
class IdentityKeyStore(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_FILE,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun loadOrCreateKeyPair(): X25519KeyPair {
        val storedPrivate = prefs.getString(KEY_PRIVATE, null)
        val storedPublic = prefs.getString(KEY_PUBLIC, null)
        if (storedPrivate != null && storedPublic != null) {
            return X25519KeyPair(
                privateKeyRaw = Base64.getDecoder().decode(storedPrivate),
                publicKeyRaw = Base64.getDecoder().decode(storedPublic),
            )
        }
        val generated = X25519.generateKeyPair()
        prefs.edit()
            .putString(KEY_PRIVATE, Base64.getEncoder().encodeToString(generated.privateKeyRaw))
            .putString(KEY_PUBLIC, Base64.getEncoder().encodeToString(generated.publicKeyRaw))
            .apply()
        return generated
    }

    fun isPaired(): Boolean = prefs.getBoolean(KEY_PAIRED, false)

    fun pairedDeviceLabel(): String? = prefs.getString(KEY_DEVICE_LABEL, null)

    fun markPaired(desktopLabel: String) {
        prefs.edit()
            .putBoolean(KEY_PAIRED, true)
            .putString(KEY_DEVICE_LABEL, desktopLabel)
            .apply()
    }

    /** Usado quando o desktop rejeita o handshake de um device que achava que estava pareado (revogado). */
    fun clearPairing() {
        prefs.edit().putBoolean(KEY_PAIRED, false).remove(KEY_DEVICE_LABEL).apply()
    }
}
