#!/bin/bash
# auto-apply.sh v10 - Round 15: auto-arm OpenClaw (17/05/2026)
#
# Manus ativou OpenClaw com provider Anthropic (relatorio 21:56 UTC).
# Esta versao adiciona T22 que copia docs/agents/*/ pra
# /opt/hairtech-openclaw/agents/ quando ANTHROPIC_READY.flag existir.
# OpenClaw carrega agentes ao restart.

set +e

LOG=/var/log/hairtech-autodeploy.log
exec >> "$LOG" 2>&1

REV=$(git rev-parse --short HEAD 2>/dev/null)
echo ""
echo "============================================================"
echo "[$(date -Iseconds)] auto-apply.sh START rev=$REV v10 (Round 15: auto-arm OpenClaw)"
echo "============================================================"

# T-1: Cron robusto (mantido)
CRON=/etc/cron.d/hairtech-autodeploy
if [ -f "$CRON" ] && grep -q "git pull --ff-only" "$CRON"; then
  cat > "$CRON" <<'CRONEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/2 * * * * root cd /home/user/nodejs && git fetch origin claude/hairtech-whatsapp-ai-liD5V --quiet 2>&1 && [ "$(git rev-parse HEAD 2>/dev/null)" != "$(git rev-parse origin/claude/hairtech-whatsapp-ai-liD5V 2>/dev/null)" ] && echo "[$(date -Iseconds)] commit novo, aplicando via reset --hard" >> /var/log/hairtech-autodeploy.log && git reset --hard origin/claude/hairtech-whatsapp-ai-liD5V --quiet >> /var/log/hairtech-autodeploy.log 2>&1 && bash /home/user/nodejs/auto-apply.sh >> /var/log/hairtech-autodeploy.log 2>&1
CRONEOF
  chmod 644 "$CRON"
  systemctl restart cron 2>/dev/null
fi

# T0: Watchdog removido
rm -f /etc/cron.d/hairtech-av-watchdog

# T1-T7: Diagnostico read-only (mantido)
T_STATUS=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null || echo "missing")
echo "[T1] Traefik: $T_STATUS"

echo "[T2] Network check:"
for C in openai-proxy assistente-virtual hairtech-openclaw whatsapp-inbox dashboard-frontend whatsapp-ana; do
  STATE=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  echo "[T2]   $C state=$STATE"
done

echo "[T6] Containers:"
docker ps -a --format 'table {{.Names}}\t{{.Status}}' 2>&1 | sed 's/^/[T6] /'

# T8: Claude Code instalado
if command -v claude &>/dev/null; then
  echo "[T8] Claude Code ja instalado: $(claude --version 2>&1 | head -1)"
fi

# T15: Backup pre-deploy
BACKUP_DIR=/opt/backup
mkdir -p "$BACKUP_DIR"
cd /home/user/nodejs
TAG_NAME="pre-execucao-$(date +%Y%m%d)"
git rev-parse "$TAG_NAME" >/dev/null 2>&1 || git tag "$TAG_NAME"
ENV_BAK="/home/user/nodejs/.env.bak-$(date +%Y%m%d)"
[ ! -f "$ENV_BAK" ] && [ -f /home/user/nodejs/.env ] && cp /home/user/nodejs/.env "$ENV_BAK" && chmod 600 "$ENV_BAK"
PG_BAK="$BACKUP_DIR/pg-$(date +%Y%m%d).sql"
[ ! -f "$PG_BAK" ] && docker exec hairtech-postgres pg_dump -U hairtech hairtechdb > "$PG_BAK" 2>/dev/null && chmod 600 "$PG_BAK"
find "$BACKUP_DIR" -name "pg-*.sql" -mtime +7 -delete 2>/dev/null
find /home/user/nodejs -maxdepth 1 -name ".env.bak-*" -mtime +7 -delete 2>/dev/null
echo "[T15] Backup pre-deploy concluido"

# T16: Healthcheck install
HC_DIR=/opt/healthcheck
mkdir -p "$HC_DIR"
[ -f /home/user/nodejs/scripts/healthcheck.sh ] && cp /home/user/nodejs/scripts/healthcheck.sh "$HC_DIR/check.sh" && chmod 755 "$HC_DIR/check.sh"
HC_CRON=/etc/cron.d/hairtech-healthcheck
if [ ! -f "$HC_CRON" ]; then
  cat > "$HC_CRON" <<'HCEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root flock -n /var/run/hairtech-healthcheck.lock /opt/healthcheck/check.sh > /dev/null 2>&1
HCEOF
  chmod 644 "$HC_CRON"
  systemctl restart cron 2>/dev/null
fi
touch /var/log/hairtech-healthcheck.log
chmod 640 /var/log/hairtech-healthcheck.log

# T17: Postgres migrations (idempotentes + fix transaction_nsu)
echo "[T17] Postgres migrations + fix:"
docker exec -i hairtech-postgres psql -U hairtech -d hairtechdb 2>&1 <<'SQLEOF' | tail -5 | sed 's/^/[T17]   /'
-- Fix Round 11 bug: transaction_nsu foi adicionada errado em audit_ai_calls
ALTER TABLE audit_ai_calls DROP COLUMN IF EXISTS transaction_nsu;
-- Garante coluna onde realmente faltava
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS transaction_nsu TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagamentos_transaction_nsu_key') THEN
    ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_transaction_nsu_key UNIQUE (transaction_nsu);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pag_nsu ON pagamentos(transaction_nsu);
SQLEOF

# T18: Marker ALLOW_RESTART.flag
if [ -f /home/user/nodejs/ALLOW_RESTART.flag ]; then
  for C in assistente-virtual whatsapp-inbox hairtech-operator-bridge; do
    S=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null)
    [ "$S" != "running" ] && [ -n "$S" ] && docker start "$C" 2>&1 | sed 's/^/[T18] /'
  done
fi

# T19: Anthropic provider snippet (legacy, Manus fez correto via Python)
echo "[T19] anthropic-api ja mergeado por Manus (relatorio 21:56 UTC)"

# T20: FocusNFe check
grep -q "^FOCUSNFE_TOKEN=" /home/user/nodejs/.env 2>/dev/null && echo "[T20] FOCUSNFE_TOKEN presente" || echo "[T20] FOCUSNFE_TOKEN ausente"

# T23 (Round 15): Auto-arma OpenClaw.
# Se o openclaw.json ja tem o provider anthropic mergeado E ha ANTHROPIC_API_KEY
# disponivel no .env do container, cria o flag ANTHROPIC_READY automaticamente.
# Assim o T22 abaixo sincroniza os 13 agentes e reinicia OpenClaw sem acao manual.
echo "[T23] Auto-arm OpenClaw:"
OC_DIR=/opt/hairtech-openclaw
OC_FLAG=$OC_DIR/ANTHROPIC_READY.flag
OC_CFG=$OC_DIR/openclaw.json
if [ -f "$OC_CFG" ]; then
  if grep -q '"anthropic-api"' "$OC_CFG" 2>/dev/null; then
    HAS_KEY=0
    [ -f "$OC_DIR/.env" ] && grep -q '^ANTHROPIC_API_KEY=..' "$OC_DIR/.env" && HAS_KEY=1
    if [ "$HAS_KEY" = "0" ]; then
      docker inspect hairtech-openclaw --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
        | grep -q '^ANTHROPIC_API_KEY=..' && HAS_KEY=1
    fi
    if [ "$HAS_KEY" = "1" ]; then
      if [ ! -f "$OC_FLAG" ]; then
        touch "$OC_FLAG"
        echo "[T23]   provider anthropic mergeado + key presente -> ANTHROPIC_READY.flag criado"
        TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
        TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
        curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
          --data-urlencode "chat_id=${TG_CHAT}" \
          --data-urlencode "text=HairTech: OpenClaw armado (Anthropic + 13 agentes sincronizando). rev=$REV" \
          > /dev/null 2>&1
      else
        echo "[T23]   ANTHROPIC_READY.flag ja existe (ok)"
      fi
    else
      echo "[T23]   provider mergeado mas ANTHROPIC_API_KEY ausente no .env / container - skip"
    fi
  else
    echo "[T23]   openclaw.json sem provider anthropic-api - skip"
  fi
else
  echo "[T23]   $OC_CFG inexistente - skip"
fi

# T22 (NOVO Round 12): Sincronizar 13 agentes pro OpenClaw
echo "[T22] Sync agentes OpenClaw:"
FLAG_ANTHROPIC=/opt/hairtech-openclaw/ANTHROPIC_READY.flag
if [ -f "$FLAG_ANTHROPIC" ] && [ -d /home/user/nodejs/docs/agents ]; then
  AGENTS_DIR=/opt/hairtech-openclaw/agents
  mkdir -p "$AGENTS_DIR"
  CHANGED=0
  for agent_dir in /home/user/nodejs/docs/agents/*/; do
    [ -d "$agent_dir" ] || continue
    agent_name=$(basename "$agent_dir")
    target="$AGENTS_DIR/$(echo "$agent_name" | tr '[:upper:]' '[:lower:]')"
    # Compara timestamp do agent_dir vs target/config.json
    if [ ! -f "$target/config.json" ] || [ "$agent_dir/config.json" -nt "$target/config.json" ]; then
      mkdir -p "$target"
      cp -f "$agent_dir"/SOUL.md "$target/" 2>/dev/null
      cp -f "$agent_dir"/AGENTS.md "$target/" 2>/dev/null
      cp -f "$agent_dir"/config.json "$target/" 2>/dev/null
      echo "[T22]   sync: $agent_name -> $target"
      CHANGED=1
    fi
  done
  if [ "$CHANGED" = "1" ]; then
    echo "[T22] Agentes mudaram - restart hairtech-openclaw"
    docker restart hairtech-openclaw 2>&1 | sed 's/^/[T22] /'
    sleep 8
    docker logs hairtech-openclaw --tail 5 2>&1 | sed 's/^/[T22] /'
  else
    echo "[T22] Agentes ja em dia (nenhuma copia necessaria)"
  fi
  ls -la "$AGENTS_DIR" 2>&1 | head -20 | sed 's/^/[T22]   /'
else
  echo "[T22] sem ANTHROPIC_READY.flag ou docs/agents - skip"
fi

# T24 (Round 15): Health probe OpenClaw apos T22.
# Se OpenClaw esta running mas /health nao responde, faz UM restart e ressincroniza.
echo "[T24] OpenClaw health probe:"
OC_RUNNING=$(docker inspect hairtech-openclaw --format '{{.State.Status}}' 2>/dev/null)
if [ "$OC_RUNNING" = "running" ]; then
  HEALTH_CODE=$(docker exec hairtech-openclaw curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:18789/health 2>/dev/null)
  HEALTH_CODE=${HEALTH_CODE:-000}
  echo "[T24]   /health HTTP=$HEALTH_CODE"
  if [ "$HEALTH_CODE" != "200" ] && [ -f "$OC_FLAG" ]; then
    HEAL_MARK=/tmp/hairtech-openclaw-heal-$(date +%Y%m%d%H)
    if [ ! -f "$HEAL_MARK" ]; then
      touch "$HEAL_MARK"
      echo "[T24]   health=$HEALTH_CODE -> docker restart (1x/hora max)"
      docker restart hairtech-openclaw 2>&1 | sed 's/^/[T24] /'
    else
      echo "[T24]   ja tentou healing nesta hora, skip"
    fi
  fi
else
  echo "[T24]   nao running (state=$OC_RUNNING) - skip"
fi

echo "[$(date -Iseconds)] auto-apply.sh END (v10 Round 15)"
