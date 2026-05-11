#!/bin/bash
set -euo pipefail
set +H
APP="/home/user/nodejs/app.js"
COMPOSE="/home/user/nodejs/docker-compose.yml"
CTR="assistente-virtual"
BK="/root/backups_av/av_model_fix_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BK"

echo "== PRECHECK =="
[ -f "$APP" ] || { echo "ERRO: $APP nao encontrado"; exit 1; }
[ -f "$COMPOSE" ] || { echo "ERRO: $COMPOSE nao encontrado"; exit 1; }

echo "== BACKUP app.js =="
cp -a "$APP" "$BK/app.js.bak"

echo "== TESTE GEMINI 2.0 =="
GKEY="$(grep -E "^GEMINI_API_KEY=" /home/user/nodejs/.env | cut -d= -f2- || true)"
if [ -n "${GKEY:-}" ]; then
  curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
    -H "Authorization: Bearer ${GKEY}" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"gemini-2.0-flash\",\"messages\":[{\"role\":\"user\",\"content\":\"Responda apenas JSON: {\\\"test\\\":\\\"ok\\\"}\"}],\"max_tokens\":50}" \
    | head -c 400; echo
else
  echo "AVISO: GEMINI_API_KEY nao encontrada"
fi

echo "== PATCH AI_MODEL: 2.5-flash -> 2.0-flash =="
python3 <<'PY'
from pathlib import Path
f=Path("/home/user/nodejs/app.js")
c=f.read_text()
old='const AI_MODEL         = "gemini-2.5-flash";'
new='const AI_MODEL         = "gemini-2.0-flash";'
if old in c:
    c=c.replace(old,new,1)
    f.write_text(c)
    print("OK: AI_MODEL trocado para gemini-2.0-flash")
else:
    print("INFO: linha nao encontrada - verificar manualmente")
    # tentar variante sem espacos extras
    old2='const AI_MODEL = "gemini-2.5-flash";'
    new2='const AI_MODEL = "gemini-2.0-flash";'
    if old2 in c:
        c=c.replace(old2,new2,1)
        f.write_text(c)
        print("OK: AI_MODEL trocado (variante sem espacos)")
PY

echo "== SANITY CHECK NODE =="
node --check "$APP" && echo "syntax_ok"

echo "== VALIDAR COMPOSE =="
docker compose -f "$COMPOSE" config >/dev/null && echo "compose_ok"

echo "== RESTART assistente-virtual =="
docker compose -f "$COMPOSE" restart "$CTR"
sleep 15

echo "== LOGS BOOT =="
docker logs "$CTR" --tail 30 2>&1

echo "== TESTE WEBHOOK SINTETICO (from=OWNER_PHONE) =="
docker exec "$CTR" sh -c 'wget -qO- --timeout=10 --post-data="{\"object\":\"whatsapp_business_account\",\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"5521982006372\",\"type\":\"text\",\"text\":{\"body\":\"status\"},\"id\":\"test999\",\"timestamp\":\"1234567890\"}],\"metadata\":{\"phone_number_id\":\"983992428140920\"}},\"field\":\"messages\"}]}]}" --header="Content-Type: application/json" http://127.0.0.1:3001/webhook 2>&1' || true

sleep 5
echo "== LOGS POS TESTE =="
docker logs "$CTR" --tail 20 2>&1

echo "== WABA PHONE NUMBERS =="
WA_TOKEN="$(grep -E "^WHATSAPP_TOKEN=" /home/user/nodejs/.env | cut -d= -f2- || true)"
if [ -n "${WA_TOKEN:-}" ]; then
  curl -s -H "Authorization: Bearer $WA_TOKEN" \
    "https://graph.facebook.com/v23.0/1480059533694084/phone_numbers?fields=id,display_phone_number,code_verification_status" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); [print(n.get('display_phone_number'), n.get('id'), n.get('code_verification_status')) for n in d.get('data',[])]"
fi

echo "== STATUS CONTAINERS =="
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "NAME|assistente|hairtech|traefik|whatsapp" || true
echo "== FIM == backup: $BK/app.js.bak"
