package br.com.w3ti.fina.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Mesma paleta de apps/electron/src/renderer/index.html (variaveis --bg,
// --surface, --accent etc. em :root para o escuro, body.theme-light para o
// claro) — o app mobile usa as cores da marca, nao Material You dinamico.

private val Accent = Color(0xFF1D9E75)
private val AccentHover = Color(0xFF19896A)
private val Danger = Color(0xFFD85A30)
private val Warning = Color(0xFFEF9F27)

private val DarkColors = darkColorScheme(
    primary = Accent,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF112625),
    onPrimaryContainer = Accent,
    secondary = Color(0xFF9CA3AF),
    onSecondary = Color(0xFF0F1117),
    secondaryContainer = Color(0xFF141720),
    onSecondaryContainer = Color.White,
    tertiary = Warning,
    onTertiary = Color(0xFF241900),
    tertiaryContainer = Color(0xFF312619),
    onTertiaryContainer = Warning,
    error = Danger,
    onError = Color.White,
    errorContainer = Color(0xFF2D1C1B),
    onErrorContainer = Danger,
    background = Color(0xFF0F1117),
    onBackground = Color.White,
    surface = Color(0xFF1A1D27),
    onSurface = Color.White,
    surfaceVariant = Color(0xFF141720),
    onSurfaceVariant = Color(0xFF9CA3AF),
    outline = Color(0xFF2A2D3A),
    outlineVariant = Color(0xFF141720),
    surfaceContainerLowest = Color(0xFF0F1117),
    surfaceContainerLow = Color(0xFF141720),
    surfaceContainer = Color(0xFF1A1D27),
    surfaceContainerHigh = Color(0xFF20232F),
    surfaceContainerHighest = Color(0xFF262A38),
    inverseSurface = Color(0xFFF0F2F5),
    inverseOnSurface = Color(0xFF111827),
    inversePrimary = AccentHover,
    scrim = Color.Black,
)

private val LightColors = lightColorScheme(
    primary = Accent,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDF0EA),
    onPrimaryContainer = Color(0xFF146B4F),
    secondary = Color(0xFF374151),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF5F7FA),
    onSecondaryContainer = Color(0xFF111827),
    tertiary = Warning,
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFDF1DF),
    onTertiaryContainer = Color(0xFF8A5A0F),
    error = Danger,
    onError = Color.White,
    errorContainer = Color(0xFFF9E6E0),
    onErrorContainer = Color(0xFF8C3A1D),
    background = Color(0xFFF0F2F5),
    onBackground = Color(0xFF111827),
    surface = Color.White,
    onSurface = Color(0xFF111827),
    surfaceVariant = Color(0xFFF5F7FA),
    onSurfaceVariant = Color(0xFF374151),
    outline = Color(0xFF6B7280),
    outlineVariant = Color(0xFFE5E7EB),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF5F7FA),
    surfaceContainer = Color(0xFFF5F7FA),
    surfaceContainerHigh = Color(0xFFEDEFF2),
    surfaceContainerHighest = Color(0xFFE5E7EB),
    inverseSurface = Color(0xFF1A1D27),
    inverseOnSurface = Color.White,
    inversePrimary = Color(0xFF6FD9B8),
    scrim = Color.Black,
)

@Composable
fun FinaMobileTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(colorScheme = if (darkTheme) DarkColors else LightColors, content = content)
}
