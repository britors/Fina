# Add project specific ProGuard rules here.
# https://developer.android.com/build/shrink-code

# BouncyCastle (X25519/HKDF/AES-GCM do handshake de sync, ver crypto/).
# A API "light-weight" usada aqui evita reflection, mas parte do jar faz
# lookup de algoritmo por nome/reflection em outros pontos — sem keep, um
# shrink agressivo pode remover classe referenciada só em runtime e quebrar
# a criptografia de forma silenciosa (só se manifesta ao parear, não builda).
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# Modelos @Serializable do protocolo de sync/pareamento com o desktop
# (ver sync/SyncModels.kt e pairing/QrPayload.kt). kotlinx.serialization
# gera um $serializer por classe que é resolvido por reflection a partir do
# nome — minify/shrink sem keep pode remover ou renomear esses companions e
# quebrar a serialização só no build de release, nunca em debug.
-keep,includedescriptorclasses class br.com.w3ti.fina.mobile.sync.**$$serializer { *; }
-keepclassmembers class br.com.w3ti.fina.mobile.sync.** {
    *** Companion;
}
-keepclasseswithmembers class br.com.w3ti.fina.mobile.sync.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class br.com.w3ti.fina.mobile.pairing.**$$serializer { *; }
-keepclassmembers class br.com.w3ti.fina.mobile.pairing.** {
    *** Companion;
}
-keepclasseswithmembers class br.com.w3ti.fina.mobile.pairing.** {
    kotlinx.serialization.KSerializer serializer(...);
}
