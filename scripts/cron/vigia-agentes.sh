#!/bin/bash
# vigia-agentes.sh — roda a cada 30min na VPS via cron
# Avisa Dr. via Telegram se algum agente parou de produzir
#
# Critério "parado": sem commit/push do branch ativo nas últimas N horas
# (configurável por agente). Detecta também: AV/ANA/OpenClaw down,
# crons que deveriam ter rodado e não rodaram, vasculhamento.json velho.

set +e
cd /home/user/nodejs 2>/dev/null || exit 0

# Telegram
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
STATE_FILE=/var/log/hairtech-vigia.state
LOG=/var/log/hairtech-vigia.log
COOLDOWN_SEC=$((3*3600))   # 1 aviso a cada 3h por categoria

now() { date -Iseconds; }
log() { echo "[$(now)] $*" >> "$LOG"; }

# carrega estado (últimos timestamps de aviso por categoria)
declare -A LAST_ALERT
if [ -f "$STATE_FILE" ]; then
  while IFS='=' read -r k v; do LAST_ALERT[$k]=$v; done < "$STATE_FILE"
fi
save_state() {
  : > "$STATE_FILE"
  for k in "${!LAST_ALERT[@]}"; do echo "$k=${LAST_ALERT[$k]}" >> "$STATE_FILE"; done
}

deve_alertar() {
  local cat="$1"; local agora_ts last_ts
  agora_ts=$(date +%s)
  last_ts=${LAST_ALERT[$cat]:-0}
  if [ $((agora_ts - last_ts)) -ge "$COOLDOWN_SEC" ]; then
    LAST_ALERT[$cat]=$agora_ts
    return 0
  fi
  return 1
}

alertar() {
  local cat="$1"; local msg="$2"
  if deve_alertar "$cat"; then
    curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
      -d "chat_id=${TG_CHAT}" \
      -d "text=[VIGIA] ${msg}" \
      -d "parse_mode=Markdown" > /dev/null
    log "ALERTA[$cat]: $msg"
  else
    log "SUPRIMIDO[$cat] (cooldown): $msg"
  fi
}

# 1) Containers críticos
for C in assistente-virtual whatsapp-ana hairtech-openclaw hairtech-postgres traefik-traefik-1; do
  ST=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null)
  if [ "$ST" != "running" ]; then
    alertar "container-$C" "Container *$C* não está running (status=$ST)."
  fi
done

# 2) Atividade no Git (cada agente humano/AI deveria commitar)
#    Esperado:
#    - autor genérico de Claude Code Web (qualquer)        -> last commit < 24h
#    - Codex via mensagens com "[Codex]"                   -> last commit < 48h
#    - cron auto-apply.sh roda 2/2min e produz status.json -> mtime < 5min
LAST_COMMIT_TS=$(git log -1 --format=%ct 2>/dev/null)
NOW=$(date +%s)
if [ -n "$LAST_COMMIT_TS" ]; then
  IDLE=$((NOW - LAST_COMMIT_TS))
  if [ "$IDLE" -gt 86400 ]; then
    H=$((IDLE/3600))
    alertar "git-idle" "Nenhum commit no repo há ${H}h. Algum agente travou?"
  fi
fi

# 3) status.json (auto-apply.sh escreve a cada execução do cron de 2min)
if [ -f /home/user/nodejs/status.json ]; then
  S_MTIME=$(stat -c %Y /home/user/nodejs/status.json 2>/dev/null || echo 0)
  S_IDLE=$((NOW - S_MTIME))
  if [ "$S_IDLE" -gt 900 ]; then
    M=$((S_IDLE/60))
    alertar "auto-apply" "status.json não atualiza há ${M}min. Cron auto-apply parou?"
  fi
fi

# 4) Vasculhamento Ollama (deveria rodar 02h)
if [ -f /home/user/nodejs/data/vasculhamento.json ]; then
  V_MTIME=$(stat -c %Y /home/user/nodejs/data/vasculhamento.json 2>/dev/null || echo 0)
  V_IDLE=$((NOW - V_MTIME))
  if [ "$V_IDLE" -gt 100000 ]; then    # > 27h
    H=$((V_IDLE/3600))
    alertar "vasculhar" "vasculhamento.json com ${H}h. Cron noturno falhou?"
  fi
fi

# 5) AV /health interno
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3001/health 2>/dev/null)
if [ "$HEALTH" != "200" ]; then
  alertar "av-health" "AV /health retornou *$HEALTH* (esperado 200)."
fi

# 6) Ponte multi-agente (agents-api.js) — só checa se o token já existe
if grep -q "^AGENTS_API_TOKEN=" /home/user/nodejs/.env 2>/dev/null; then
  ASTAT=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3001/api/agent/status 2>/dev/null)
  if [ "$ASTAT" != "200" ]; then
    alertar "agents-api" "Ponte multi-agente /api/agent/status = *$ASTAT*."
  fi
fi

# 7) BLITZ deveria rodar 9h — se passou de 10h e não há flag-resumo, avisar
HORA=$(date +%H)
if [ "$HORA" = "10" ] && [ ! -f /home/user/nodejs/data/blitz-resumo-$(date +%Y%m%d).json ]; then
  alertar "blitz" "BLITZ 9h não gerou resumo hoje ($(date +%Y-%m-%d))."
fi

# 8) Heartbeat positivo: 1x por dia, manda OK
HB_FILE=/var/log/hairtech-vigia-hb-$(date +%Y%m%d)
if [ ! -f "$HB_FILE" ]; then
  touch "$HB_FILE"
  curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d "chat_id=${TG_CHAT}" \
    -d "text=[VIGIA] Sistema HairTech sob vigilância. Próximo check em 30min." > /dev/null
fi

save_state
exit 0
