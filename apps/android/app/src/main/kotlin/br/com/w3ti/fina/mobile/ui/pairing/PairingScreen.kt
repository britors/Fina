package br.com.w3ti.fina.mobile.ui.pairing

import android.Manifest
import android.content.pm.PackageManager
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import br.com.w3ti.fina.mobile.sync.SyncOutcome
import java.util.concurrent.Executors

@Composable
fun PairingScreen(viewModel: PairingViewModel, onDone: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (val current = state) {
                PairingUiState.Scanning -> QrScannerView(onQrCodeDetected = viewModel::onQrDetected)
                PairingUiState.Connecting -> StatusMessage("Conectando ao desktop…")
                is PairingUiState.WaitingForConfirmation -> PairingCodeMessage(current.pairingCode)
                PairingUiState.Syncing -> StatusMessage("Sincronizando…")
                is PairingUiState.Success -> SuccessMessage(current.outcome, onDone)
                is PairingUiState.Error -> ErrorMessage(current.message, onRetry = viewModel::retry, onGiveUp = onDone)
            }
        }
    }
}

@Composable
private fun QrScannerView(onQrCodeDetected: (String) -> Unit) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
    }
    if (!hasCameraPermission) {
        LaunchedEffect(Unit) { permissionLauncher.launch(Manifest.permission.CAMERA) }
        StatusMessage("Permissão de câmera necessária para escanear o QR code.")
        return
    }

    Column(Modifier.fillMaxSize()) {
        Text(
            "Abra \"Sincronizar celular\" no Fina desktop e aponte a câmera para o QR code.",
            modifier = Modifier.padding(16.dp),
            style = MaterialTheme.typography.bodyMedium,
        )
        CameraPreview(onQrCodeDetected)
    }
}

@OptIn(ExperimentalGetImage::class)
@Composable
private fun CameraPreview(onQrCodeDetected: (String) -> Unit) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().apply {
                    setSurfaceProvider(previewView.surfaceProvider)
                }
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .apply { setAnalyzer(cameraExecutor, QrCodeAnalyzer(onQrCodeDetected)) }
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            }, ContextCompat.getMainExecutor(ctx))
            previewView
        },
    )
}

@Composable
private fun StatusMessage(text: String) {
    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Text(text, Modifier.padding(top = 16.dp))
    }
}

@Composable
private fun PairingCodeMessage(code: String) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Digite este código no desktop para confirmar:", style = MaterialTheme.typography.bodyLarge)
        Surface(
            modifier = Modifier.padding(top = 24.dp),
            color = MaterialTheme.colorScheme.primaryContainer,
        ) {
            Text(
                code,
                modifier = Modifier.padding(horizontal = 32.dp, vertical = 16.dp),
                fontSize = 40.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 8.sp,
            )
        }
    }
}

@Composable
private fun SuccessMessage(outcome: SyncOutcome, onDone: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Sincronizado!", style = MaterialTheme.typography.headlineSmall)
        Text(
            "${outcome.created} novo(s) lançamento(s) enviado(s).",
            modifier = Modifier.padding(top = 8.dp),
        )
        if (outcome.rejected > 0) {
            Text(
                "${outcome.rejected} não puderam ser enviados — confira a fila.",
                modifier = Modifier.padding(top = 4.dp),
                color = MaterialTheme.colorScheme.error,
            )
        }
        Button(onClick = onDone, modifier = Modifier.padding(top = 24.dp)) { Text("Concluir") }
    }
}

@Composable
private fun ErrorMessage(message: String, onRetry: () -> Unit, onGiveUp: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(message, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.error)
        Row(Modifier.padding(top = 24.dp)) {
            Button(onClick = onGiveUp) { Text("Voltar") }
            Spacer(Modifier.size(16.dp))
            Button(onClick = onRetry) { Text("Tentar de novo") }
        }
    }
}
