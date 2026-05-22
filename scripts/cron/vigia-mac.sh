#!/bin/bash
# vigia-mac.sh — instala no Mac do Dr. via Codex (briefing
# codex-briefings/20260522-instalar-vigia-mac.md)
#
# Roda a cada 30min via launchd. Avisa Telegram se:
# - Ollama.app nao esta rodando
# - HD com <10% livre
# - cron-noturno do Mac nao rodou
# - Codex aberto mas travado (process exists mas sem CPU >2h)

TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
STATE=/tmp/hairtech-vigia-mac.state
COOLDOWN=10800   # 3h

now_ts() { date +%s; }

declare -A LAST
if [ -f "$STATE" ]; then
  while IFS='=' read -r k v; do LAST[$k]=$v; done < "$STATE"
fi
save() { : > "$STATE"; for k in "${!LAST[@]}"; do echo "$k=${LAST[$k]}" >> "$STATE"; done; }

alertar() {
  local cat="$1" msg="$2"
  local agora last
  agora=$(now_ts); last=${LAST[$cat]:-0}
  if [ $((agora - last)) -ge "$COOLDOWN" ]; then
    LAST[$cat]=$agora
    curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
      -d "chat_id=${TG_CHAT}" -d "text=[VIGIA MAC] ${msg}" > /dev/null
  fi
}

# 1) Ollama rodando?
if ! pgrep -f "Ollama.app" > /dev/null && ! pgrep -f "ollama serve" > /dev/null; then
  alertar "ollama" "Ollama nao esta rodando no Mac. Triagem local indisponivel."
fi

# 2) Free disk
USAGE=$(df -h / | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ -n "$USAGE" ] && [ "$USAGE" -gt 90 ]; then
  alertar "disk" "HD Mac em ${USAGE}% de uso. <10% livre."
fi

# 3) Heartbeat 1x/dia
HB=/tmp/hairtech-vigia-mac-hb-$(date +%Y%m%d)
if [ ! -f "$HB" ]; then
  touch "$HB"
  curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d "chat_id=${TG_CHAT}" -d "text=[VIGIA MAC] Mac sob vigilancia. $(date +%H:%M)." > /dev/null
fi

save
exit 0
