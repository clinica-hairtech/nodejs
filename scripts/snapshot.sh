#!/usr/bin/env bash
# snapshot.sh — backup noturno da VPS HairTech
#
# O que faz:
#   1. pg_dumpall (cluster postgres inteiro) do container hairtech-postgres
#   2. tar do /home/user/nodejs (excluindo node_modules, .git, *-data)
#   3. tar do workspace e config do OpenClaw (/opt/hairtech-openclaw)
#   4. Grava em /root/backups_av/snapshot-YYYYMMDD-HHMMSS/
#   5. Remove snapshots com mais de RETENTION_DAYS dias (default 14)
#
# Instalar no cron como root:
#   0 3 * * * /home/user/nodejs/scripts/snapshot.sh >> /var/log/hairtech-snapshot.log 2>&1
#
# Variáveis de ambiente (com defaults):
#   BACKUP_ROOT=/root/backups_av
#   RETENTION_DAYS=14
#   PG_CONTAINER=hairtech-postgres
#   PG_USER=hairtech
#   NODEJS_DIR=/home/user/nodejs
#   OPENCLAW_DIR=/opt/hairtech-openclaw

set -Eeuo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/root/backups_av}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_CONTAINER="${PG_CONTAINER:-hairtech-postgres}"
PG_USER="${PG_USER:-hairtech}"
NODEJS_DIR="${NODEJS_DIR:-/home/user/nodejs}"
OPENCLAW_DIR="${OPENCLAW_DIR:-/opt/hairtech-openclaw}"

TS="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_ROOT}/snapshot-${TS}"

log() { printf '[snapshot %s] %s\n' "$(date -Iseconds)" "$*"; }
fail() { log "ERRO: $*"; exit 1; }

mkdir -p "${DEST}"
log "iniciando snapshot em ${DEST}"

# 1) Postgres — pg_dumpall ----------------------------------------------------
if docker ps --format '{{.Names}}' | grep -qx "${PG_CONTAINER}"; then
  log "dumping postgres (${PG_CONTAINER}, user=${PG_USER})"
  docker exec -i "${PG_CONTAINER}" pg_dumpall -U "${PG_USER}" \
    | gzip -9 > "${DEST}/postgres-dumpall.sql.gz" \
    || fail "pg_dumpall falhou"
else
  log "WARN: container ${PG_CONTAINER} não está rodando — pulando pg_dumpall"
fi

# 2) Repositório nodejs -------------------------------------------------------
if [ -d "${NODEJS_DIR}" ]; then
  log "tar do ${NODEJS_DIR}"
  tar --warning=no-file-changed \
      --exclude='node_modules' \
      --exclude='.git' \
      --exclude='whatsapp-ana-data' \
      --exclude='whatsapp-inbox-data' \
      --exclude='*.log' \
      -czf "${DEST}/nodejs.tar.gz" \
      -C "$(dirname "${NODEJS_DIR}")" "$(basename "${NODEJS_DIR}")" \
      || fail "tar nodejs falhou"
else
  log "WARN: ${NODEJS_DIR} não existe — pulando"
fi

# 3) OpenClaw workspace + config ---------------------------------------------
if [ -d "${OPENCLAW_DIR}" ]; then
  log "tar do ${OPENCLAW_DIR} (workspace, config, profiles)"
  tar --warning=no-file-changed \
      --exclude='data/playwright' \
      --exclude='*.log' \
      -czf "${DEST}/openclaw.tar.gz" \
      -C "$(dirname "${OPENCLAW_DIR}")" "$(basename "${OPENCLAW_DIR}")" \
      || fail "tar openclaw falhou"
else
  log "WARN: ${OPENCLAW_DIR} não existe — pulando"
fi

# 4) Checksums ----------------------------------------------------------------
( cd "${DEST}" && sha256sum ./* > SHA256SUMS )
log "snapshot completo: $(du -sh "${DEST}" | awk '{print $1}')"

# 5) Retenção -----------------------------------------------------------------
log "removendo snapshots com mais de ${RETENTION_DAYS} dias"
find "${BACKUP_ROOT}" -maxdepth 1 -type d -name 'snapshot-*' \
  -mtime "+${RETENTION_DAYS}" -print -exec rm -rf {} + || true

log "ok"
