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
private const val KEY_DESKTOP_IDENTITY = "desktop_identity_public_key"

private fun createEncryptedPrefs(context: Context) = EncryptedSharedPreferences.create(
    context,
    PREFS_FILE,
    MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
)

// A chave mestra do MasterKey.Builder mora num alias fixo no AndroidKeyStore
// (MasterKey.DEFAULT_MASTER_KEY_ALIAS). Se ela foi invalidada (atualização de
// OS, bug de OEM), só apagar o arquivo de prefs não resolve nada: o retry
// chama MasterKey.Builder de novo, que encontra a mesma entrada inválida no
// Keystore e lança de novo. Apagar a entrada primeiro é o que de fato deixa
// o Keystore gerar uma chave nova no retry.
private fun deleteMasterKeystoreEntry() {
    runCatching {
        val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        keyStore.deleteEntry(MasterKey.DEFAULT_MASTER_KEY_ALIAS)
    }
}

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
    // MasterKey.Builder/EncryptedSharedPreferences.create podem lançar (chave
    // do Keystore invalidada por atualização de OS, bug de OEM, arquivo de
    // prefs corrompido) — sem tratar isso, o app trava em TODO lançamento,
    // sem tela nenhuma e sem caminho de recuperação. Se falhar, apaga tanto o
    // arquivo de prefs quanto a entrada da chave mestra no Keystore (perde a
    // identidade, exige parear de novo — bem menos grave que o app nunca
    // mais abrir) e tenta criar uma vez do zero.
    private val prefs = try {
        createEncryptedPrefs(context)
    } catch (e: Exception) {
        context.deleteSharedPreferences(PREFS_FILE)
        deleteMasterKeystoreEntry()
        createEncryptedPrefs(context)
    }

    fun loadOrCreateKeyPair(): X25519KeyPair {
        val stored = try {
            val storedPrivate = prefs.getString(KEY_PRIVATE, null)
            val storedPublic = prefs.getString(KEY_PUBLIC, null)
            if (storedPrivate != null && storedPublic != null) {
                X25519KeyPair(
                    privateKeyRaw = Base64.getDecoder().decode(storedPrivate),
                    publicKeyRaw = Base64.getDecoder().decode(storedPublic),
                )
            } else null
        } catch (e: IllegalArgumentException) {
            // Base64 salvo corrompido: trata como se não houvesse chave e gera outra.
            null
        }
        if (stored != null) return stored
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

    /** Identidade de longo prazo do desktop fixada na última confirmação manual de código, se houver. */
    fun pinnedDesktopIdentity(): String? = prefs.getString(KEY_DESKTOP_IDENTITY, null)

    /** Chamado só depois que o operador confirma o código de pareamento — ver SyncRepository.confirmPairing. */
    fun pinDesktopIdentity(publicKey: String) {
        prefs.edit().putString(KEY_DESKTOP_IDENTITY, publicKey).apply()
    }
}
