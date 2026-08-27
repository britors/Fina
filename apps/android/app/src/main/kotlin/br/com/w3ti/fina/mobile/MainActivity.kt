package br.com.w3ti.fina.mobile

import android.os.Bundle
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
