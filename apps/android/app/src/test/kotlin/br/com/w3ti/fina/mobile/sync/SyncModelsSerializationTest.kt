package br.com.w3ti.fina.mobile.sync

import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Trava a regressão que derrubou a sincronização de verdade: `op` tem valor
 * padrão em SyncRequestMessage/PushTransactionsMessage, e o
 * kotlinx.serialization por padrão omite campos no valor padrão ao gerar
 * JSON — sem `encodeDefaults = true` em [protocolJson], essas mensagens
 * saíam como `{}` (sem "op"), o desktop recebia `op: undefined`, não batia
 * com nenhum handler e nunca respondia — o celular ficava esperando uma
 * resposta que nunca chegaria até estourar o timeout.
 */
class SyncModelsSerializationTest {
    @Test
    fun `sync_request sempre inclui o campo op`() {
        assertEquals("""{"op":"sync_request"}""", protocolJson.encodeToString(SyncRequestMessage()))
    }

    @Test
    fun `push_transactions sempre inclui o campo op`() {
        val json = protocolJson.encodeToString(PushTransactionsMessage(items = emptyList()))
        assertEquals("""{"op":"push_transactions","items":[]}""", json)
    }

    @Test
    fun `protocolo v2 envia somente centavos e v1 preserva decimal`() {
        val common = arrayOf("id", "account", "category", "Mercado")
        val v2 = transactionInputForProtocol(
            common[0], common[1], common[2], common[3], 10.01, "expense", "2026-09-01", null, 2,
        )
        val v2Json = protocolJson.encodeToString(v2)
        assertTrue(v2Json.contains("\"amount_cents\":1001"))
        assertFalse(v2Json.contains("\"amount\":"))

        val v1 = transactionInputForProtocol(
            common[0], common[1], common[2], common[3], 10.01, "expense", "2026-09-01", null, 1,
        )
        val v1Json = protocolJson.encodeToString(v1)
        assertTrue(v1Json.contains("\"amount\":10.01"))
        assertFalse(v1Json.contains("\"amount_cents\":"))
    }

    @Test
    fun `conversao v2 recusa precisao maior que centavos`() {
        assertThrows(ArithmeticException::class.java) {
            transactionInputForProtocol(
                "id", "account", "category", "Mercado", 1.005, "expense", "2026-09-01", null, 2,
            )
        }
    }
}
