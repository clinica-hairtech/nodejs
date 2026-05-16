#!/usr/bin/env bash
# install-cron.sh
# Instala backup noturno via snapshot.sh no cron do root.
# Pendencia 12.9 do Mestre v6.0.
#
# Idempotente — se a entrada ja existe, nao duplica.
#
# Uso:
#   sudo bash /home/user/nodejs/scripts/install-cron.sh

set -Eeuo pipefail

SNAPSHOT_SCRIPT="/home/user/nodejs/scripts/snapshot.sh"
LOG_FILE="/var/log/hairtech-snapshot.log"
CRON_LINE="15 3 * * * ${SNAPSHOT_SCRIPT} >> ${LOG_FILE} 2>&1"
CRON_MARKER="# hairtech-snapshot-nightly"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: precisa rodar como root (sudo)."
  exit 1
fi

if [ ! -x "${SNAPSHOT_SCRIPT}" ]; then
  echo "Tornando ${SNAPSHOT_SCRIPT} executavel..."
  chmod +x "${SNAPSHOT_SCRIPT}"
fi

# Cria diretorio de log se nao existir
touch "${LOG_FILE}"
chmod 640 "${LOG_FILE}"

# Verifica se ja existe entrada no crontab
CURRENT_CRON="$(crontab -l 2>/dev/null || true)"
if echo "${CURRENT_CRON}" | grep -Fq "${CRON_MARKER}"; then
  echo "Cron ja instalado:"
  echo "${CURRENT_CRON}" | grep -A1 -F "${CRON_MARKER}"
  exit 0
fi

echo "Adicionando entrada ao crontab do root..."
( echo "${CURRENT_CRON}"; \
  echo ""; \
  echo "${CRON_MARKER}"; \
  echo "${CRON_LINE}" ) | crontab -

echo "Crontab apos instalacao:"
crontab -l

# Configura logrotate pra log nao crescer indefinidamente
cat > /etc/logrotate.d/hairtech-snapshot <<'EOF'
/var/log/hairtech-snapshot.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    create 640 root root
}
EOF
echo "logrotate configurado: /etc/logrotate.d/hairtech-snapshot"

echo ""
echo "================================================"
echo " Instalacao concluida"
echo "================================================"
echo " Proxima execucao: 03:15 da madrugada"
echo " Log: ${LOG_FILE}"
echo " Destino default: /root/backups_av/"
echo " Retencao default: 14 dias"
echo ""
echo " Pra testar manualmente agora:"
echo "   ${SNAPSHOT_SCRIPT}"
echo "================================================"
