#!/bin/bash
# /opt/healthcheck/check.sh — instalado pelo auto-apply.sh T16
# Cron */5min com flock. Alerta Telegram via @HairTechBot em falha.

set +e
LOG=/var/log/hairtech-healthcheck.log
exec >> "$LOG" 2>&1

TS=$(date -Iseconds)
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"

alert() {
  local MSG="$1"
  local TRIMMED="${MSG:0:3500}"
  curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" \
    --data-urlencode "text=HairTech alert ${TS}
${TRIMMED}" > /dev/null 2>&1
  echo "[$TS] ALERT: $MSG"
}

PROBLEMS=""

# Check 1: Postgres
if ! docker exec hairtech-postgres pg_isready -U hairtech > /dev/null 2>&1; then
  PROBLEMS="${PROBLEMS}- Postgres nao responde
"
fi

# Check 2: AV (so monitora se ALLOW_RESTART.flag presente)
if [ -f /home/user/nodejs/ALLOW_RESTART.flag ]; then
  AV_STATE=$(docker inspect assistente-virtual --format '{{.State.Status}}' 2>/dev/null)
  if [ "$AV_STATE" != "running" ]; then
    LOG_SNIPPET=$(docker logs assistente-virtual --tail 30 2>&1 | tail -8)
    HEALTH=$(curl -s --max-time 4 "http://localhost:3001/health" 2>&1 | head -c 200)
    PROBLEMS="${PROBLEMS}- AV state=$AV_STATE (esperado running). Logs: ${LOG_SNIPPET}. Curl health: ${HEALTH}
"
  fi
fi

# Check 3: Traefik
T_STATE=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null)
if [ "$T_STATE" != "running" ]; then
  PROBLEMS="${PROBLEMS}- Traefik state=$T_STATE
"
fi

# Check 4: OpenClaw (com self-heal 1x/hora)
OC_STATE=$(docker inspect hairtech-openclaw --format '{{.State.Status}}' 2>/dev/null)
if [ "$OC_STATE" != "running" ] && [ -n "$OC_STATE" ]; then
  HEAL_MARK=/tmp/hairtech-oc-selfheal-$(date +%Y%m%d%H)
  if [ ! -f "$HEAL_MARK" ]; then
    touch "$HEAL_MARK"
    docker start hairtech-openclaw > /dev/null 2>&1
    sleep 5
    OC_STATE=$(docker inspect hairtech-openclaw --format '{{.State.Status}}' 2>/dev/null)
    echo "[$TS] OpenClaw self-heal tentado, new_state=$OC_STATE"
  fi
  if [ "$OC_STATE" != "running" ]; then
    LOG_SNIPPET=$(docker logs hairtech-openclaw --tail 20 2>&1 | tail -6)
    PROBLEMS="${PROBLEMS}- OpenClaw state=$OC_STATE (self-heal falhou). Logs: ${LOG_SNIPPET}
"
  fi
fi

# Check 5: WAHA ANA (preserva pareamento - SO docker start, NUNCA restart)
WA_STATE=$(docker inspect whatsapp-ana --format '{{.State.Status}}' 2>/dev/null)
if [ "$WA_STATE" != "running" ] && [ -n "$WA_STATE" ]; then
  HEAL_MARK=/tmp/hairtech-wa-selfheal-$(date +%Y%m%d%H)
  if [ ! -f "$HEAL_MARK" ] && [ "$WA_STATE" = "exited" ]; then
    touch "$HEAL_MARK"
    docker start whatsapp-ana > /dev/null 2>&1
    sleep 8
    WA_STATE=$(docker inspect whatsapp-ana --format '{{.State.Status}}' 2>/dev/null)
    echo "[$TS] WAHA ANA self-heal (docker start) tentado, new_state=$WA_STATE"
  fi
  if [ "$WA_STATE" != "running" ]; then
    PROBLEMS="${PROBLEMS}- WAHA ANA state=$WA_STATE (pareamento pode ter perdido)
"
  fi
fi

# Check 6: Webhook Meta publico (so se ALLOW_RESTART)
if [ -f /home/user/nodejs/ALLOW_RESTART.flag ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 \
    "https://hairtech.org/webhook?hub.mode=subscribe&hub.verify_token=hairtech_token_2026&hub.challenge=hc_$(date +%s)" 2>/dev/null)
  if [ "$CODE" != "200" ]; then
    PROBLEMS="${PROBLEMS}- Webhook Meta retornou HTTP=$CODE
"
  fi
fi

if [ -n "$PROBLEMS" ]; then
  alert "$PROBLEMS"
else
  echo "[$TS] healthcheck OK"
fi
