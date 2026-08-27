package br.com.w3ti.fina.mobile.crypto

import java.io.EOFException
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer

private const val MAX_FRAME_BYTES = 1024 * 1024

/**
 * Enquadramento de tamanho fixo (4 bytes big-endian + payload) por cima de um
 * socket TCP — equivalente a `packFrame()`/`FrameParser` do desktop, so que
 * lendo direto do stream em vez de acumular chunks manualmente (o desktop
 * precisa disso porque `socket.on('data', ...)` entrega pedaços arbitrarios;
 * aqui a leitura ja e bloqueante byte-a-byte via `InputStream`).
 */
class FrameSocket(private val input: InputStream, private val output: OutputStream) {
    fun writeFrame(payload: ByteArray) {
        val length = ByteBuffer.allocate(4).putInt(payload.size).array()
        output.write(length)
        output.write(payload)
        output.flush()
    }

    fun readFrame(): ByteArray {
        val lengthBytes = readExactly(4)
        val length = ByteBuffer.wrap(lengthBytes).int
        if (length < 0 || length > MAX_FRAME_BYTES) {
            throw IllegalStateException("Frame recebido excede o tamanho maximo permitido.")
        }
        return readExactly(length)
    }

    private fun readExactly(count: Int): ByteArray {
        val buffer = ByteArray(count)
        var offset = 0
        while (offset < count) {
            val read = input.read(buffer, offset, count - offset)
            if (read == -1) throw EOFException("Conexao encerrada pelo desktop antes do esperado.")
            offset += read
        }
        return buffer
    }
}
