#!/usr/bin/env bash
# Prepara a máquina para desenvolver o Fina Mobile (app Android complementar
# ao desktop — só lançamentos, pareado por QR code na rede local). Instala o
# Android Studio (que já traz SDK, Gradle e o plugin Kotlin) via Flatpak, que
# é o caminho mais confiável em openSUSE/Lyra OS — não há pacote oficial nos
# repositórios zypper padrão.
#
# O que este script NÃO faz (etapas interativas, ficam pra você):
#   - assistente de primeira execução do Android Studio (baixa SDK/licenças);
#   - criar um AVD com Google Play (necessário pro ML Kit, se for usar
#     emulador em vez de celular físico);
#   - ativar "Depuração USB" no celular físico e autorizar este computador.
#
# Uso:
#   bash scripts/setup-android-dev.sh
set -euo pipefail

echo "== Fina Mobile — preparando ambiente de desenvolvimento Android =="

if ! command -v flatpak >/dev/null 2>&1; then
  echo "Flatpak não encontrado. Instale-o primeiro (no Lyra OS/openSUSE: sudo zypper install flatpak) e rode este script de novo." >&2
  exit 1
fi

if ! flatpak remote-list 2>/dev/null | grep -q '^flathub'; then
  echo "Adicionando o repositório Flathub..."
  flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
fi

if flatpak info com.google.AndroidStudio >/dev/null 2>&1; then
  echo "Android Studio já instalado (flatpak com.google.AndroidStudio) — pulando."
else
  echo "Instalando Android Studio via Flatpak (pode demorar, é um download grande)..."
  flatpak install -y flathub com.google.AndroidStudio
fi

echo
echo "== JDK =="
if command -v java >/dev/null 2>&1; then
  echo "JDK do sistema encontrado: $(java -version 2>&1 | head -1)"
  echo "(O Android Studio usa seu próprio JDK embutido pra builds Gradle; o do sistema não é obrigatório, mas não atrapalha.)"
else
  echo "Nenhum JDK do sistema encontrado — sem problema, o Android Studio traz o dele."
fi

cat <<'EOF'

== Feito. Próximos passos (manuais) ==

1. Abrir o Android Studio pela primeira vez:
     flatpak run com.google.AndroidStudio
   O assistente inicial baixa o Android SDK, o emulador e pede pra aceitar
   as licenças — isso não dá pra automatizar com segurança aqui.

2. Se for testar com um CELULAR FÍSICO (recomendado — o pareamento depende
   da mesma rede local, e emuladores costumam ter rede isolada por padrão):
     - ative "Opções do desenvolvedor" no celular (tocar 7x em "Número da
       versão" em Configurações > Sobre o telefone);
     - ative "Depuração USB" nas Opções do desenvolvedor;
     - conecte o cabo USB e autorize este computador quando o celular pedir;
     - confirme com `adb devices` (adb vem com o SDK, em
       ~/Android/Sdk/platform-tools/adb depois do passo 1) que o celular
       aparece listado.

3. Se preferir emulador mesmo assim: no AVD Manager do Android Studio, crie
   um dispositivo virtual usando uma imagem de sistema "Google Play" (ícone
   do Play Store ao lado do nome) — sem isso o ML Kit (leitura de QR) não
   funciona no emulador. Vai precisar configurar a rede do emulador pra
   alcançar o desktop na LAN (não é o padrão).

4. Garanta que o celular (físico ou emulador) esteja na MESMA rede Wi-Fi do
   computador rodando o Fina desktop antes de testar o pareamento.
EOF
