package br.com.w3ti.fina.mobile.data

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppDatabaseHeaderTest {
    @Test fun distinguishesPlaintextSqliteFromEncryptedBytes() {
        val file = File.createTempFile("fina-mobile-header", ".db")
        try {
            file.writeBytes("SQLite format 3\u0000rest".toByteArray(Charsets.US_ASCII))
            assertTrue(AppDatabase.hasPlaintextHeader(file))
            file.writeBytes(ByteArray(32) { (it * 17).toByte() })
            assertFalse(AppDatabase.hasPlaintextHeader(file))
        } finally {
            file.delete()
        }
    }
}
