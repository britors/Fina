#!/usr/bin/env bash
# Prepara a máquina para desenvolver o Fina Desktop (Electron + esbuild +
# better-sqlite3-multiple-ciphers). Assume openSUSE/Lyra OS (zypper), como o
# resto dos scripts em scripts/. Em outra distro, instale manualmente os
# pacotes equivalentes listados abaixo.
#
# O que este script faz:
#   - instala o Node.js (pacote nodejs24, se nenhum node já estiver disponível);
#   - instala as ferramentas de compilação (gcc-c++, make, python3) exigidas
#     pelo node-gyp para compilar o módulo nativo better-sqlite3-multiple-ciphers;
#   - instala as bibliotecas de runtime que o binário do Electron precisa pra
#     sequer abrir em Linux (gtk3, libnotify4, mozilla-nss, libXtst6,
#     libsecret-1-0 — os mesmos nomes usados em electron-builder.json5 pro
#     pacote .rpm);
#   - roda `npm install` na raiz do repo (workspace único: apps/electron).
#
# O que este script NÃO faz:
#   - gerar os instaladores finais (.deb/.rpm/.exe) — isso é `npm run dist`,
#     que já baixa suas próprias ferramentas de empacotamento;
#   - resolver um eventual mismatch de ABI nativo entre o Node do sistema e o
#     Node embutido no Electron (acontece às vezes após `npm install` puro).
#     Se `npm start` falhar com erro de NODE_MODULE_VERSION, rode:
#       npx electron-rebuild --force --build-from-source \
#         --module-dir . --which-module better-sqlite3-multiple-ciphers
#
# Uso:
#   bash scripts/setup-desktop-dev.sh
set -euo pipefail

echo "== Fina Desktop — preparando ambiente de desenvolvimento =="

if ! command -v zypper >/dev/null 2>&1; then
  echo "zypper não encontrado — este script assume openSUSE/Lyra OS." >&2
  echo "Em outra distro, instale manualmente: Node.js 24+, gcc-c++/make/python3," >&2
  echo "e as libs de runtime do Electron (gtk3, libnotify, nss, libXtst, libsecret)." >&2
  exit 1
fi

echo
echo "== Node.js =="
if command -v node >/dev/null 2>&1; then
  echo "Node.js já disponível: $(node -v)"
else
  echo "Instalando Node.js (pacote nodejs24)..."
  sudo zypper install -y nodejs24
fi

echo
echo "== Ferramentas de compilação (node-gyp / better-sqlite3-multiple-ciphers) =="
build_pkgs=()
command -v gcc >/dev/null 2>&1 || build_pkgs+=(gcc-c++)
command -v g++ >/dev/null 2>&1 || build_pkgs+=(gcc-c++)
command -v make >/dev/null 2>&1 || build_pkgs+=(make)
command -v python3 >/dev/null 2>&1 || build_pkgs+=(python3)
if [ ${#build_pkgs[@]} -eq 0 ]; then
  echo "gcc-c++, make e python3 já instalados."
else
  echo "Instalando: ${build_pkgs[*]}..."
  sudo zypper install -y "${build_pkgs[@]}"
fi

echo
echo "== Bibliotecas de runtime do Electron =="
echo "Verificando gtk3, libnotify4, mozilla-nss, libXtst6, libsecret-1-0..."
sudo zypper install -y --no-recommends \
  gtk3 libnotify4 mozilla-nss libXtst6 libsecret-1-0

echo
echo "== Dependências do projeto (npm install) =="
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
(cd "$repo_root" && npm install)

cat <<'EOF'

== Feito. Próximos passos ==

1. Rodar o app em modo dev:
     npm start
   (equivale a `npm --workspace fina run start`, que executa `electron .`)

2. Se `npm start` falhar com erro de NODE_MODULE_VERSION (mismatch de ABI
   do módulo nativo better-sqlite3-multiple-ciphers), rode:
     npx electron-rebuild --force --build-from-source \
       --module-dir . --which-module better-sqlite3-multiple-ciphers

3. Rodar os testes / typecheck:
     npm test
     npm run typecheck

4. Gerar os instaladores locais (opcional, baixa ferramentas extras na
   primeira vez):
     npm run dist:linux
EOF
