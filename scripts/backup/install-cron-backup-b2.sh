#!/bin/bash
# Instala cron diario do backup B2.
# Pre-requisitos: rclone instalado (install-rclone-b2.sh) e .env com B2_*.

set +e
CRON_FILE=/etc/cron.d/hairtech-backup-b2

if [ ! -f /home/user/nodejs/scripts/backup/backup-offsite-b2.sh ]; then
  echo "[install-cron] backup-offsite-b2.sh ausente"
  exit 2
fi
chmod +x /home/user/nodejs/scripts/backup/backup-offsite-b2.sh

cat > "$CRON_FILE" <<'CRONEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Backup off-site B2 diario as 04:00 BRT (= 07:00 UTC)
0 7 * * * root bash /home/user/nodejs/scripts/backup/backup-offsite-b2.sh > /dev/null 2>&1
CRONEOF

chmod 644 "$CRON_FILE"
systemctl restart cron 2>/dev/null

echo "[install-cron] cron de backup B2 instalado: $CRON_FILE"
echo "[install-cron] proximo run: $(date -d 'tomorrow 04:00' -Iseconds)"
