#!/bin/bash
# Diagnóstico correto: testa via docker exec (portas não expostas ao host)
# Rodar no VPS: bash /home/user/nodejs/diag-openclaw.sh

echo ""
echo "═══════════════════════════════════════════"
echo "  DIAGNÓSTICO OPENCLAW — $(date '+%d/%m/%Y %H:%M')"
echo "═══════════════════════════════════════════"

# 1. Containers
echo ""
echo "[ CONTAINERS ]"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null

# 2. Token e .env OpenClaw
echo ""
echo "[ TOKEN OPENCLAW ]"
ENV_FILE=/opt/hairtech-openclaw/.env
TOKEN=""
if [ -f "$ENV_FILE" ]; then
  TOKEN=$(grep "^OPENCLAW_GATEWAY_TOKEN=" "$ENV_FILE" | cut -d= -f2-)
  echo "Token: ${TOKEN:0:12}..."
  grep -q "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" \
    && echo "AVISO: TELEGRAM_BOT_TOKEN ainda presente — remover!" \
    || echo "OK: sem TELEGRAM_BOT_TOKEN no OpenClaw"
else
  echo "ERRO: .env nao encontrado em $ENV_FILE"
fi

# 3. Teste dentro do container openclaw (porta interna 18789)
echo ""
echo "[ SAUDE INTERNA hairtech-openclaw ]"
docker exec hairtech-openclaw \
  wget -qO- http://127.0.0.1:18789/healthz 2>/dev/null \
  && echo "OK: /healthz respondeu" \
  || docker exec hairtech-openclaw \
     wget -qO- http://127.0.0.1:18789/health 2>/dev/null \
     && echo "OK: /health respondeu" \
     || echo "NENHUM health endpoint respondeu (normal se o gateway nao expoe /health)"

# 4. Inferência via docker exec (correto — sem passar pelo host)
echo ""
echo "[ INFERENCIA via docker exec ]"
if [ -n "$TOKEN" ]; then
  RESP=$(docker exec hairtech-openclaw sh -c \
    "wget -qO- --header='x-api-key: ${TOKEN}' \
     --header='Content-Type: application/json' \
     --post-data='{\"messages\":[{\"role\":\"user\",\"content\":\"Responda apenas: vivo\"}]}' \
     http://127.0.0.1:18789/v1/chat/completions 2>/dev/null" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'])" 2>/dev/null \
    || echo "ERRO_OU_TIMEOUT")
  echo "Resposta IA: $RESP"
  [[ "$RESP" == *"vivo"* ]] && echo "OK: Inferencia funcionando" || echo "AVISO: Resposta inesperada"
else
  echo "Pulando — token nao encontrado"
fi

# 5. Traefik: rota openclaw configurada?
echo ""
echo "[ TRAEFIK — rotas openclaw ]"
docker exec traefik-traefik-1 \
  wget -qO- http://127.0.0.1:8080/api/http/routers 2>/dev/null \
  | python3 -c "
import sys, json
try:
  routers = json.load(sys.stdin)
  for r in routers:
    if 'openclaw' in r.get('name','').lower() or 'claw' in r.get('rule','').lower():
      print(f'  Router: {r[\"name\"]} | Rule: {r.get(\"rule\",\"?\")} | Status: {r.get(\"status\",\"?\")}')
except:
  print('  (erro ao parsear resposta do Traefik)')
" 2>/dev/null || echo "  (Traefik API nao respondeu)"

# 6. HTTPS externo — claw.hairtech.org
echo ""
echo "[ HTTPS claw.hairtech.org ]"
HTTPS_RESP=$(wget -qO- --timeout=10 https://claw.hairtech.org/healthz 2>/dev/null \
  || wget -qO- --timeout=10 https://claw.hairtech.org/ 2>/dev/null \
  || echo "SEM_RESPOSTA")
echo "Resposta: ${HTTPS_RESP:0:120}"

# 7. Authbot via docker exec
echo ""
echo "[ AUTHBOT via docker exec ]"
AB=$(docker exec hairtech-authbot \
  wget -qO- http://127.0.0.1:7700/health 2>/dev/null \
  || echo "SEM_RESPOSTA")
echo "Resposta: $AB"

# 8. AV: pode chegar ao OpenClaw na rede Docker?
echo ""
echo "[ AV -> OpenClaw rede Docker ]"
docker exec assistente-virtual \
  wget -qO- --timeout=5 http://hairtech-openclaw:18789/healthz 2>/dev/null \
  && echo "OK: AV alcanca OpenClaw na rede Docker" \
  || echo "FALHOU: AV nao alcanca hairtech-openclaw:18789"

# 9. Logs recentes
echo ""
echo "[ LOGS hairtech-openclaw (ultimas 6 linhas) ]"
docker logs hairtech-openclaw --tail 6 2>/dev/null

echo ""
echo "[ LOGS hairtech-authbot (ultimas 3 linhas) ]"
docker logs hairtech-authbot --tail 3 2>/dev/null

echo ""
echo "═══════════════════════════════════════════"
echo "  FIM DO DIAGNOSTICO"
echo "═══════════════════════════════════════════"
echo ""
