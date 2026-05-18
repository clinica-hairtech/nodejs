#!/bin/bash
# Instala Ollama em container + baixa qwen2.5:3b-instruct (1.9GB)
# Idempotente. Aborta se RAM livre < 3GB.

set +e
LOG=/var/log/hairtech-ollama-install.log
exec >> "$LOG" 2>&1

TS=$(date -Iseconds)
echo ""
echo "============================================================"
echo "[$TS] install-ollama.sh START"
echo "============================================================"

# 1) Verifica RAM livre (qwen2.5:7b precisa ~7-8GB inference -> exige >=6GB livre)
FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')
TOTAL_MB=$(free -m | awk '/^Mem:/ {print $2}')
echo "[install] RAM total: ${TOTAL_MB} MB, disponivel: ${FREE_MB} MB"

# Modelo padrao: 7B em VPS com >=8GB total, senao 3B
if [ -n "$TOTAL_MB" ] && [ "$TOTAL_MB" -ge 12000 ]; then
  DEFAULT_MODEL="qwen2.5:7b-instruct"
  MIN_FREE=6000
else
  DEFAULT_MODEL="qwen2.5:3b-instruct"
  MIN_FREE=3000
fi
MODEL="${OLLAMA_MODEL:-$DEFAULT_MODEL}"
echo "[install] modelo escolhido: $MODEL (min livre exigido: ${MIN_FREE}MB)"

if [ -z "$FREE_MB" ] || [ "$FREE_MB" -lt "$MIN_FREE" ]; then
  echo "[install] ABORTAR: RAM livre < ${MIN_FREE} MB."
  TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
  TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
  curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" \
    --data-urlencode "text=HairTech: Ollama install abortado - RAM livre ${FREE_MB}MB (min ${MIN_FREE}). Aguarde liberar memoria ou suba VPS." \
    > /dev/null 2>&1
  exit 2
fi

# 2) Cria rede se nao existir
docker network inspect hairtech-network > /dev/null 2>&1 || docker network create hairtech-network > /dev/null 2>&1

# 3) Sobe container Ollama
cd /home/user/nodejs
if docker inspect ollama > /dev/null 2>&1; then
  echo "[install] container ollama ja existe, garantindo running"
  docker start ollama > /dev/null 2>&1
else
  echo "[install] subindo container via docker compose"
  docker compose -f docker-compose.ollama.yml up -d 2>&1 | tail -5 | sed 's/^/[install] /'
fi

# 4) Aguarda healthy
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec ollama ollama list > /dev/null 2>&1; then
    echo "[install] ollama API responde (tentativa $i)"
    break
  fi
  sleep 3
done

# 5) Baixa modelo se faltar
if docker exec ollama ollama list 2>/dev/null | grep -q "$MODEL"; then
  echo "[install] modelo $MODEL ja presente"
else
  SIZE=$([ "$MODEL" = "qwen2.5:7b-instruct" ] && echo "4.7GB" || echo "1.9GB")
  echo "[install] baixando modelo $MODEL ($SIZE)..."
  docker exec ollama ollama pull "$MODEL" 2>&1 | tail -3 | sed 's/^/[install] /'
fi

# 6) Adiciona OLLAMA_ENABLED ao .env do AV se faltar
ENV_FILE=/home/user/nodejs/.env
if [ -f "$ENV_FILE" ]; then
  if ! grep -q "^OLLAMA_ENABLED=" "$ENV_FILE"; then
    echo "" >> "$ENV_FILE"
    echo "# IA local via Ollama (qwen2.5:3b-instruct)" >> "$ENV_FILE"
    echo "OLLAMA_ENABLED=1" >> "$ENV_FILE"
    echo "OLLAMA_BASE_URL=http://ollama:11434" >> "$ENV_FILE"
    echo "OLLAMA_MODEL=$MODEL" >> "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "[install] OLLAMA_* adicionado ao .env"
  fi
fi

# 7) Teste rapido
RESPOSTA=$(docker exec ollama curl -s --max-time 30 http://localhost:11434/api/generate \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"Diga oi em portugues em uma palavra\",\"stream\":false}" 2>/dev/null \
  | head -c 300)
echo "[install] teste rapido: $RESPOSTA"

# 8) Marker + Telegram
touch /opt/.ollama-installed
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
MSG="HairTech: IA local instalada. Modelo: $MODEL. Container ollama running. ENV OLLAMA_ENABLED=1 setado. Custo API: zero a partir de agora (se app.js usar Ollama primeiro)."
curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TG_CHAT}" --data-urlencode "text=${MSG}" > /dev/null 2>&1

echo "[$TS] install-ollama.sh END"
