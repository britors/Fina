package br.com.w3ti.fina.mobile.sync

import org.junit.Assert.assertThrows
import org.junit.Test

class PendingTransactionValidationTest {
    @Test fun acceptsValidExpense() {
        validatePendingTransaction("Mercado", 12.34, "expense", "2026-08-29")
    }

    @Test fun rejectsNonFiniteAndInvalidData() {
        assertThrows(IllegalArgumentException::class.java) {
            validatePendingTransaction("Mercado", Double.POSITIVE_INFINITY, "expense", "2026-08-29")
        }
        assertThrows(IllegalArgumentException::class.java) {
            validatePendingTransaction("Mercado", Double.NaN, "expense", "2026-08-29")
        }
        assertThrows(IllegalArgumentException::class.java) {
            validatePendingTransaction("", 10.0, "expense", "2026-08-29")
        }
        assertThrows(IllegalArgumentException::class.java) {
            validatePendingTransaction("Salário", 10.0, "income", "2026-08-29")
        }
    }
}
