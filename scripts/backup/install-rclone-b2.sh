#!/bin/bash
# Instala rclone + cria config B2 placeholder.
# Roda 1x manualmente DEPOIS que Dr. tiver credenciais B2.
#
# Como obter credenciais B2 (Backblaze):
# 1. Cadastrar em https://www.backblaze.com/b2/sign-up.html (gratuito ate 10GB)
# 2. Criar bucket privado "hairtech-backups"
# 3. Generate App Key com permissao writeFiles no bucket
# 4. Anotar: applicationKeyId e applicationKey
# 5. Adicionar ao /home/user/nodejs/.env:
#    B2_ACCOUNT_ID=<applicationKeyId>
#    B2_APPLICATION_KEY=<applicationKey>
#    B2_BUCKET=hairtech-backups
# 6. Rodar este script

set +e
LOG=/var/log/hairtech-rclone-install.log
exec >> "$LOG" 2>&1

TS=$(date -Iseconds)
echo "[$TS] install-rclone-b2.sh START"

# 1) Instala rclone
if ! command -v rclone >/dev/null 2>&1; then
  echo "[rclone] instalando via script oficial"
  curl https://rclone.org/install.sh | bash >/dev/null 2>&1
fi
echo "[rclone] versao: $(rclone version 2>&1 | head -1)"

# 2) Le credenciais do .env
ENV_FILE=/home/user/nodejs/.env
B2_ID=$(grep "^B2_ACCOUNT_ID=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
B2_KEY=$(grep "^B2_APPLICATION_KEY=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
B2_BUCKET=$(grep "^B2_BUCKET=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)

if [ -z "$B2_ID" ] || [ -z "$B2_KEY" ]; then
  echo "[rclone] credenciais B2 ausentes no .env"
  echo "[rclone] Adicione B2_ACCOUNT_ID e B2_APPLICATION_KEY ao .env e rode novamente"
  exit 2
fi

# 3) Cria config rclone
RCLONE_CFG=/root/.config/rclone/rclone.conf
mkdir -p "$(dirname "$RCLONE_CFG")"
if ! grep -q "^\[b2hairtech\]" "$RCLONE_CFG" 2>/dev/null; then
  cat >> "$RCLONE_CFG" <<RCFGEOF

[b2hairtech]
type = b2
account = $B2_ID
key = $B2_KEY
hard_delete = false
RCFGEOF
  chmod 600 "$RCLONE_CFG"
  echo "[rclone] config b2hairtech criada"
else
  echo "[rclone] config b2hairtech ja existe"
fi

# 4) Testa conexao
echo "[rclone] testando conexao com bucket"
rclone lsd "b2hairtech:$B2_BUCKET" 2>&1 | head -3 | sed 's/^/[rclone] /'

echo "[$TS] install-rclone-b2.sh END"
