package br.com.w3ti.fina.mobile.ui.transactions

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AmountParsingTest {
    @Test fun parsesBrazilianAndPlainAmounts() {
        assertEquals(1500.0, parseAmountInput("1.500,00")!!, 0.0)
        assertEquals(1500.0, parseAmountInput("1500.00")!!, 0.0)
    }

    @Test fun nonFiniteAmountsAreRecognizedForRejectionByTheForm() {
        assertTrue(parseAmountInput("Infinity")!!.isInfinite())
        assertFalse(parseAmountInput("Infinity")!!.isFinite())
        assertFalse(parseAmountInput("NaN")!!.isFinite())
    }

    @Test fun currencyMaskFormatsDigitsAsBrazilianReais() {
        assertEquals("0,00", formatCurrencyDigits(""))
        assertEquals("0,01", formatCurrencyDigits("1"))
        assertEquals("12,34", formatCurrencyDigits("1234"))
        assertEquals("1.234,56", formatCurrencyDigits("123456"))
        assertEquals("123456", amountToCurrencyDigits(1234.56))
    }
}
