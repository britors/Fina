package br.com.w3ti.fina.mobile.sync

import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
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
}
