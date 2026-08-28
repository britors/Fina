package br.com.w3ti.fina.mobile

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import br.com.w3ti.fina.mobile.ui.common.ViewModelFactory
import br.com.w3ti.fina.mobile.ui.navigation.FinaNavHost
import br.com.w3ti.fina.mobile.ui.theme.FinaMobileTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Dados financeiros na tela: bloqueia captura por screenshot/gravação
        // de tela e esconde o conteúdo na miniatura do seletor de apps recentes.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        val viewModelFactory = ViewModelFactory((application as FinaMobileApplication).syncRepository)

        setContent {
            FinaMobileTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    FinaNavHost(viewModelFactory = viewModelFactory)
                }
            }
        }
    }
}
