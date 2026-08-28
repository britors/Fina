package br.com.w3ti.fina.mobile.sync

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Espelha as mensagens trocadas com apps/electron/src/main/ipc/mobileSync.ts
// e mobileSync.ts (protocolo descrito no topo daquele arquivo). Nomes de
// campo em snake_case onde o desktop usa snake_case (colunas de banco
// refletidas direto no JSON) — @SerialName mantem as propriedades Kotlin em
// camelCase sem mudar o que trafega na rede.

@Serializable
data class HandshakeInit(
    val identityPublicKey: String,
    /** 16 bytes aleatórios (base64) — amarra a prova de identidade do desktop a esta conexão específica. */
    val nonce: String,
    /** Identidade do desktop fixada numa confirmação manual anterior, se houver — ver IdentityKeyStore.pinnedDesktopIdentity(). */
    val knownDesktopIdentity: String? = null,
)

@Serializable
data class HandshakeResponse(
    val ephemeralPublicKey: String,
    /** Identidade X25519 de longo prazo do desktop (SPKI/DER, base64) — ver mobileSync.ts. */
    val identityPublicKey: String,
    /** Prova de posse da chave privada de `identityPublicKey` — ver computeIdentityProof. */
    val identityProof: String,
    val alreadyPaired: Boolean = false,
)

@Serializable
data class AccountDto(val id: String, val name: String, val type: String)

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    @SerialName("parent_id") val parentId: String? = null,
    val kind: String,
)

@Serializable
data class TransactionInputDto(
    @SerialName("client_id") val clientId: String,
    @SerialName("account_id") val accountId: String,
    @SerialName("category_id") val categoryId: String,
    val description: String,
    val amount: Double,
    /** "income" ou "expense". */
    val type: String,
    /** ISO 8601 (yyyy-MM-dd). */
    val date: String,
    val notes: String? = null,
)

@Serializable
data class PushResultDto(
    @SerialName("client_id") val clientId: String,
    /** "created" | "duplicate" | "rejected". */
    val status: String,
    val reason: String? = null,
)

@Serializable
data class SyncRequestMessage(val op: String = "sync_request")

@Serializable
data class PushTransactionsMessage(val op: String = "push_transactions", val items: List<TransactionInputDto>)

@Serializable
data class AccountsCategoriesMessage(
    val op: String,
    val accounts: List<AccountDto>,
    val categories: List<CategoryDto>,
)

@Serializable
data class PushResultMessage(val op: String, val results: List<PushResultDto>)

@Serializable
data class PairedMessage(val op: String, val success: Boolean)

@Serializable
data class OpEnvelope(val op: String)
