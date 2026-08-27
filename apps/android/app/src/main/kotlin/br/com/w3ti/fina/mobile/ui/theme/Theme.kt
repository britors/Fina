package br.com.w3ti.fina.mobile.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// Mesmo verde de --accent no CSS do desktop (apps/electron/src/renderer/index.html).
private val FinaGreen = Color(0xFF1D9E75)
private val FinaGreenDark = Color(0xFF8FD9BC)

private val LightColors = lightColorScheme(
    primary = FinaGreen,
    onPrimary = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = FinaGreenDark,
    onPrimary = Color(0xFF00382A),
)

@Composable
fun FinaMobileTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colorScheme, content = content)
}
