package br.com.w3ti.fina.mobile.ui.pairing

import android.Manifest
import android.content.pm.PackageManager
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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

    Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
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

    Box(Modifier.fillMaxSize()) {
        CameraPreview(onQrCodeDetected)

        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .fillMaxWidth(0.68f)
                    .aspectRatio(1f)
                    .border(2.dp, Color.White.copy(alpha = 0.9f), RoundedCornerShape(20.dp)),
            )
        }

        Surface(
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
            shape = RoundedCornerShape(0.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text(
                    "Abra \"Sincronizar celular\" no Fina desktop e aponte a câmera para o QR code.",
                    modifier = Modifier.padding(start = 12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
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
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        Text(text, Modifier.padding(top = 20.dp), style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
    }
}

@Composable
private fun PairingCodeMessage(code: String) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "Digite este código no desktop para confirmar",
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Surface(
            modifier = Modifier.padding(top = 24.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.primaryContainer,
        ) {
            Text(
                code,
                modifier = Modifier.padding(horizontal = 32.dp, vertical = 20.dp),
                fontSize = 40.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 8.sp,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
        CircularProgressIndicator(
            modifier = Modifier.padding(top = 32.dp).size(20.dp),
            strokeWidth = 2.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SuccessMessage(outcome: SyncOutcome, onDone: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        IconBadge(Icons.Default.CheckCircle, MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.primary)
        Text(
            "Sincronizado!",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = 20.dp),
        )
        Text(
            "${outcome.created} novo(s) lançamento(s) enviado(s).",
            modifier = Modifier.padding(top = 8.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (outcome.rejected > 0) {
            Text(
                "${outcome.rejected} não puderam ser enviados — confira a fila.",
                modifier = Modifier.padding(top = 4.dp),
                color = MaterialTheme.colorScheme.error,
            )
        }
        Button(
            onClick = onDone,
            shape = MaterialTheme.shapes.large,
            modifier = Modifier.padding(top = 28.dp).fillMaxWidth().height(52.dp),
        ) { Text("Concluir", style = MaterialTheme.typography.titleMedium) }
    }
}

@Composable
private fun ErrorMessage(message: String, onRetry: () -> Unit, onGiveUp: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        IconBadge(Icons.Default.ErrorOutline, MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.error)
        Text(
            message,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 20.dp),
        )
        Row(Modifier.fillMaxWidth().padding(top = 28.dp)) {
            OutlinedButton(onClick = onGiveUp, modifier = Modifier.weight(1f).height(48.dp)) { Text("Voltar") }
            Box(Modifier.size(12.dp))
            Button(onClick = onRetry, modifier = Modifier.weight(1f).height(48.dp)) { Text("Tentar de novo") }
        }
    }
}

@Composable
private fun IconBadge(icon: androidx.compose.ui.graphics.vector.ImageVector, container: Color, tint: Color) {
    Surface(shape = CircleShape, color = container) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.padding(20.dp).size(40.dp))
    }
}
