#!/usr/bin/env bash
# Desinstalador de conveniência: remove o pacote do Fina usando o gerenciador
# de pacotes da distro (contraparte do scripts/install.sh). Cobre Arch/Manjaro
# (pacman/AUR), openSUSE Leap, Fedora (RPM) e Ubuntu/Debian (.deb).
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/britors/Fina/main/scripts/uninstall.sh | sudo bash
#
# Por padrão só remove o pacote/app, preservando seus dados (banco de dados,
# segredos de IA/Open Finance etc.) em ~/.config/Fina. Pra apagar esses dados
# também, passe --purge:
#
#   sudo bash uninstall.sh --purge
set -euo pipefail

purge_data=0
for arg in "$@"; do
  case "$arg" in
    --purge)
      purge_data=1
      ;;
    *)
      echo "Uso: uninstall.sh [--purge]" >&2
      exit 1
      ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (sudo bash uninstall.sh, ou via curl ... | sudo bash)." >&2
  exit 1
fi

distro_id=""
distro_id_like=""
if [ -r /etc/os-release ]; then
  . /etc/os-release
  distro_id="${ID:-}"
  distro_id_like="${ID_LIKE:-}"
fi

case "$distro_id $distro_id_like" in
  *arch*)
    if ! command -v pacman >/dev/null 2>&1; then
      echo "Erro: 'pacman' não encontrado — isso não parece ser Arch." >&2
      exit 1
    fi

    if ! pacman -Qi fina >/dev/null 2>&1; then
      echo "Pacote 'fina' não está instalado via pacman." >&2
      exit 1
    fi

    echo "==> Removendo via pacman (funciona independente de ter sido"
    echo "    instalado com yay, paru ou pacman -U direto)"
    pacman -Rns --noconfirm fina
    ;;
  *opensuse*|*suse*)
    if ! command -v zypper >/dev/null 2>&1; then
      echo "Erro: 'zypper' não encontrado — isso não parece ser openSUSE." >&2
      exit 1
    fi

    echo "==> Removendo via zypper"
    zypper --non-interactive remove -y fina
    ;;
  *fedora*)
    if ! command -v dnf >/dev/null 2>&1; then
      echo "Erro: 'dnf' não encontrado — isso não parece ser Fedora." >&2
      exit 1
    fi

    echo "==> Removendo via dnf"
    dnf remove -y fina
    ;;
  *debian*|*ubuntu*)
    if ! command -v apt-get >/dev/null 2>&1; then
      echo "Erro: 'apt-get' não encontrado — isso não parece ser Debian/Ubuntu." >&2
      exit 1
    fi

    echo "==> Removendo via apt"
    apt-get remove -y fina
    ;;
  *)
    echo "Distro não reconhecida (ID=$distro_id, ID_LIKE=$distro_id_like)." >&2
    echo "Este desinstalador cobre Arch/Manjaro, openSUSE Leap, Fedora e" >&2
    echo "Ubuntu/Debian por enquanto. Remova o pacote 'fina' manualmente com" >&2
    echo "o gerenciador de pacotes da sua distro." >&2
    exit 1
    ;;
esac

target_user="${SUDO_USER:-}"
if [ -z "$target_user" ]; then
  echo "" >&2
  echo "Aviso: não foi possível identificar o usuário invocador (rode com" >&2
  echo "'sudo', não como root direto) — pule a limpeza do timer systemd" >&2
  echo "--user e, se usou --purge, apague manualmente ~/.config/Fina de" >&2
  echo "cada usuário que rodou o Fina." >&2
else
  target_home="$(getent passwd "$target_user" | cut -d: -f6)"

  # O recurso "executar em segundo plano" cria um timer systemd --user
  # (fina-background.timer/.service) que sobrevive à remoção do pacote e
  # ficaria tentando rodar um binário inexistente — desativa e remove
  # sempre, mesmo sem --purge.
  unit_dir="$target_home/.config/systemd/user"
  if [ -f "$unit_dir/fina-background.timer" ] || [ -f "$unit_dir/fina-background.service" ]; then
    echo "==> Desativando o timer de segundo plano (systemd --user) de $target_user"
    sudo -u "$target_user" systemctl --user disable --now fina-background.timer 2>/dev/null || true
    rm -f "$unit_dir/fina-background.timer" "$unit_dir/fina-background.service"
    sudo -u "$target_user" systemctl --user daemon-reload 2>/dev/null || true
  fi

  if [ "$purge_data" -eq 1 ]; then
    # Dados do usuário ficam em ~/.config/Fina (app.getPath('userData') do
    # Electron, baseado no productName "Fina"), fora do prefixo do pacote —
    # por isso precisam ser apagados à parte.
    config_dir="$target_home/.config/Fina"
    if [ -d "$config_dir" ]; then
      echo "==> Apagando dados do usuário $target_user em $config_dir"
      rm -rf "$config_dir"
    else
      echo "==> Nenhum dado encontrado em $config_dir"
    fi
  fi
fi

cat <<EOF

Desinstalação concluída.
EOF

if [ "$purge_data" -eq 0 ]; then
  cat <<'EOF'
Seus dados (banco de dados, segredos de IA/Open Finance etc.) foram
mantidos em ~/.config/Fina. Rode novamente com --purge para apagá-los.
EOF
fi
