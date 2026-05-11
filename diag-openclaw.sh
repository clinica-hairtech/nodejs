#!/bin/bash
# Diagnóstico rápido do OpenClaw + authbot
# Rodar no VPS: bash /home/user/nodejs/diag-openclaw.sh

HOST=localhost
PORT=18789
AUTHBOT_PORT=7700

echo ""
echo "═══════════════════════════════════════════"
echo "  DIAGNÓSTICO OPENCLAW — $(date '+%d/%m/%Y %H:%M')"
echo "═══════════════════════════════════════════"

# 1. Containers
echo ""
echo "[ CONTAINERS ]"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null

# 2. Token
echo ""
echo "[ TOKEN GATEWAY ]"
ENV_FILE=/opt/hairtech-openclaw/.env
if [ -f "$ENV_FILE" ]; then
  TOKEN=$(grep "^OPENCLAW_GATEWAY_TOKEN=" "$ENV_FILE" | cut -d= -f2-)
  echo "Token encontrado: ${TOKEN:0:12}..."
  HAS_TG=$(grep -c "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" 2>/dev/null || echo 0)
  [ "$HAS_TG" -gt 0 ] && echo "⚠️  TELEGRAM_BOT_TOKEN presente no OpenClaw (remover!)" || echo "✅ Sem TELEGRAM_BOT_TOKEN no OpenClaw"
else
  echo "❌ .env não encontrado em $ENV_FILE"
  TOKEN=""
fi

# 3. Health HTTP direto
echo ""
echo "[ SAÚDE HTTP localhost:$PORT ]"
HEALTH=$(curl -sf "http://$HOST:$PORT/healthz" 2>/dev/null || curl -sf "http://$HOST:$PORT/health" 2>/dev/null || echo "SEM_RESPOSTA")
echo "Resposta: $HEALTH"

# 4. Inferência
echo ""
echo "[ INFERÊNCIA ]"
if [ -n "$TOKEN" ]; then
  RESP=$(curl -sf \
    -H "x-api-key: $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"Responda apenas a palavra: vivo"}]}' \
    --max-time 30 \
    "http://$HOST:$PORT/v1/chat/completions" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'])" 2>/dev/null \
    || echo "TIMEOUT_OU_ERRO")
  echo "Resposta IA: $RESP"
  [[ "$RESP" == *"vivo"* ]] && echo "✅ Inferência OK" || echo "⚠️  Resposta inesperada: $RESP"
else
  echo "⚠️  Pulando — sem token"
fi

# 5. Authbot
echo ""
echo "[ AUTHBOT :$AUTHBOT_PORT ]"
AB=$(curl -sf "http://$HOST:$AUTHBOT_PORT/health" 2>/dev/null || echo "SEM_RESPOSTA")
echo "Resposta: $AB"

# 6. Logs recentes OpenClaw (últimas 5 linhas relevantes)
echo ""
echo "[ LOGS hairtech-openclaw (últimas 8 linhas) ]"
docker logs hairtech-openclaw --tail 8 2>/dev/null | grep -v "^$" || echo "(sem logs)"

# 7. Logs recentes authbot
echo ""
echo "[ LOGS hairtech-authbot (últimas 5 linhas) ]"
docker logs hairtech-authbot --tail 5 2>/dev/null | grep -v "^$" || echo "(sem logs)"

echo ""
echo "═══════════════════════════════════════════"
echo "  FIM DO DIAGNÓSTICO"
echo "═══════════════════════════════════════════"
echo ""
