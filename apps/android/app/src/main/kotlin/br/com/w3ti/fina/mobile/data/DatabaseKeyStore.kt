package br.com.w3ti.fina.mobile.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.SecureRandom
import java.util.Base64

private const val PREFS_FILE = "fina_mobile_database_key"
private const val MASTER_KEY_ALIAS = "fina_mobile_database_master_key"
private const val KEY_PASSPHRASE = "database_passphrase"

/** Chave aleatória do SQLCipher, protegida por uma chave não exportável do Android Keystore. */
class DatabaseKeyStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_FILE,
        MasterKey.Builder(context, MASTER_KEY_ALIAS).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun getOrCreatePassphrase(): ByteArray {
        val existing = prefs.getString(KEY_PASSPHRASE, null)
        if (existing != null) return existing.toByteArray(Charsets.UTF_8)

        val generated = ByteArray(32).also(SecureRandom()::nextBytes)
        val encoded = Base64.getEncoder().encodeToString(generated)
        check(prefs.edit().putString(KEY_PASSPHRASE, encoded).commit()) {
            "Não foi possível persistir a chave do banco de dados."
        }
        generated.fill(0)
        return encoded.toByteArray(Charsets.UTF_8)
    }
}
