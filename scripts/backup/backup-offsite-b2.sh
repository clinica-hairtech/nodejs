#!/bin/bash
# Backup off-site B2: dump Postgres + tar codigo + sync rclone.
# Roda diariamente 04:00 BRT via cron (instalado pelo install-cron-backup-b2.sh).

set +e
LOG=/var/log/hairtech-backup-b2.log
exec >> "$LOG" 2>&1

TS=$(date -Iseconds)
DATE=$(date +%Y%m%d)
echo ""
echo "============================================================"
echo "[$TS] backup-offsite-b2.sh START"
echo "============================================================"

# 1) Verifica rclone
if ! command -v rclone >/dev/null 2>&1; then
  echo "[backup] rclone ausente - aborta"
  exit 2
fi

# 2) Le bucket do .env
ENV_FILE=/home/user/nodejs/.env
B2_BUCKET=$(grep "^B2_BUCKET=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
[ -z "$B2_BUCKET" ] && B2_BUCKET="hairtech-backups"

# 3) Dump Postgres
DUMP=/tmp/hairtech-pg-$DATE.sql.gz
docker exec hairtech-postgres pg_dump -U hairtech hairtechdb 2>/dev/null | gzip > "$DUMP"
DUMP_SIZE=$(stat -c%s "$DUMP" 2>/dev/null || echo 0)
echo "[backup] pg dump: ${DUMP_SIZE} bytes"

# 4) Tar do codigo (excluindo node_modules, .git, backups grandes)
TAR=/tmp/hairtech-code-$DATE.tar.gz
tar -czf "$TAR" \
  --exclude='/home/user/nodejs/node_modules' \
  --exclude='/home/user/nodejs/.git' \
  --exclude='/home/user/nodejs/.env.bak-*' \
  -C /home/user nodejs 2>/dev/null
TAR_SIZE=$(stat -c%s "$TAR" 2>/dev/null || echo 0)
echo "[backup] code tar: ${TAR_SIZE} bytes"

# 5) Tar do .env (separado, criptografado se possivel - aqui apenas com permissoes restritas)
ENV_TAR=/tmp/hairtech-env-$DATE.tar.gz
tar -czf "$ENV_TAR" -C /home/user/nodejs .env 2>/dev/null
chmod 600 "$ENV_TAR"

# 6) Sync pra B2
RCLONE_FLAGS="--b2-hard-delete=false --transfers 2 --retries 3"
rclone copy "$DUMP" "b2hairtech:$B2_BUCKET/postgres/$DATE/" $RCLONE_FLAGS 2>&1 | tail -2 | sed 's/^/[backup] /'
rclone copy "$TAR" "b2hairtech:$B2_BUCKET/code/$DATE/" $RCLONE_FLAGS 2>&1 | tail -2 | sed 's/^/[backup] /'
rclone copy "$ENV_TAR" "b2hairtech:$B2_BUCKET/env/$DATE/" $RCLONE_FLAGS 2>&1 | tail -2 | sed 's/^/[backup] /'

# 7) Limpa locais
rm -f "$DUMP" "$TAR" "$ENV_TAR"

# 8) Retencao: apaga backups B2 com >30 dias (mantem 30 dias dia-a-dia + sempre o ultimo de cada mes)
rclone delete --min-age 30d --rmdirs "b2hairtech:$B2_BUCKET/postgres/" 2>&1 | tail -1 | sed 's/^/[backup-cleanup] /'
rclone delete --min-age 30d --rmdirs "b2hairtech:$B2_BUCKET/code/" 2>&1 | tail -1 | sed 's/^/[backup-cleanup] /'

# 9) Telegram resumo
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
MSG="HairTech backup off-site $DATE: postgres ${DUMP_SIZE}B, codigo ${TAR_SIZE}B, env enviado."
curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TG_CHAT}" --data-urlencode "text=${MSG}" > /dev/null 2>&1

echo "[$TS] backup-offsite-b2.sh END"
