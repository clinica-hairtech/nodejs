#!/bin/bash
# fix-waha-session.sh
# Recria sessao WAHA default e gera QR pro Dr. Ricardo escanear.
# Resolve IP do container dinamicamente (nao depende de IP hardcoded).
# Sem if/elif que quebra quando colado em consoles web.
#
# Uso:
#   bash /home/user/nodejs/fix-waha-session.sh

set +e

cd /home/user/nodejs

KEY=$(grep "^WHATSAPP_ANA_KEY=" .env | cut -d= -f2-)
if [ -z "$KEY" ]; then
  echo "ERRO: WHATSAPP_ANA_KEY nao achado no .env"
  exit 1
fi

echo "================================================"
echo " [1/6] Container whatsapp-ana"
echo "================================================"
docker ps -a --filter name=whatsapp-ana --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
echo ""

CONTAINER_STATUS=$(docker inspect whatsapp-ana --format '{{.State.Status}}' 2>/dev/null)
if [ "$CONTAINER_STATUS" != "running" ]; then
  echo "Container nao esta running (status=$CONTAINER_STATUS). Tentando subir..."
  docker compose -f docker-compose.whatsapp-ana.yml up -d
  sleep 20
fi

echo "================================================"
echo " [2/6] Resolvendo IP do whatsapp-ana"
echo "================================================"
WAHA_IP=$(docker inspect whatsapp-ana --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' | awk '{print $1}')
echo "WAHA_IP=$WAHA_IP"
WAHA="http://$WAHA_IP:3000"
echo "WAHA=$WAHA"
echo ""

if [ -z "$WAHA_IP" ]; then
  echo "ERRO: nao consegui resolver IP."
  exit 1
fi

echo "================================================"
echo " [3/6] Verificando WAHA responde"
echo "================================================"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WAHA/health" --connect-timeout 5)
echo "HTTP /health -> $HTTP_CODE"
if [ "$HTTP_CODE" = "000" ]; then
  echo "WAHA nao responde. Logs:"
  docker logs whatsapp-ana --tail 30
  exit 1
fi
echo ""

echo "================================================"
echo " [4/6] DELETE sessao default antiga"
echo "================================================"
curl -s -X DELETE -H "X-Api-Key: $KEY" "$WAHA/api/sessions/default"
echo ""
sleep 3

echo "================================================"
echo " [5/6] POST nova sessao default (WEBJS + webhook)"
echo "================================================"
curl -s -X POST -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name":"default","start":true,"config":{"engine":"WEBJS","webhooks":[{"url":"http://assistente-virtual:3001/webhook/ana","events":["message","message.any","session.status"]}]}}' \
  "$WAHA/api/sessions"
echo ""
echo ""

echo "================================================"
echo " [6/6] Aguardando SCAN_QR_CODE ou WORKING (ate 2 min)"
echo "================================================"
LAST_STATUS=""
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24; do
  LAST_STATUS=$(curl -s -H "X-Api-Key: $KEY" "$WAHA/api/sessions/default" 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get('status',''))
except:
  print('')
" 2>/dev/null)
  echo "[$i/24] status=$LAST_STATUS"
  [ "$LAST_STATUS" = "SCAN_QR_CODE" ] && break
  [ "$LAST_STATUS" = "WORKING" ] && break
  sleep 5
done
echo ""

if [ "$LAST_STATUS" = "WORKING" ]; then
  echo "================================================"
  echo " SESSAO JA EM WORKING — sem precisar de QR!"
  echo " Manda 'teste' do celular pessoal pro +5521967813366"
  echo " Depois roda: docker logs assistente-virtual --since 2m | grep -i ANA"
  echo "================================================"
  exit 0
fi

if [ "$LAST_STATUS" != "SCAN_QR_CODE" ]; then
  echo "================================================"
  echo " Status nao chegou em SCAN_QR_CODE em 2min."
  echo " Ultimo status: $LAST_STATUS"
  echo " Logs do WAHA:"
  echo "================================================"
  docker logs whatsapp-ana --tail 40
  exit 1
fi

command -v qrencode >/dev/null 2>&1 || apt-get install -y -qq qrencode

echo "================================================"
echo " QR CODE — ESCANEAR COM CELULAR +5521967813366"
echo "================================================"
echo " WhatsApp -> 3 pontinhos -> Aparelhos conectados"
echo "          -> Conectar um aparelho -> camera no QR"
echo "================================================"
echo ""

curl -s -H "X-Api-Key: $KEY" "$WAHA/api/sessions/default/auth/qr?format=raw" 2>/dev/null \
  | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  v=d.get('value') or d.get('data') or ''
  print(v)
except:
  pass
" \
  | qrencode -t ANSI -m 0 -s 1

echo ""
echo "================================================"
echo " DEPOIS DE ESCANEAR (espera bipe no celular):"
echo " 1. Volta aqui e roda: docker logs whatsapp-ana --tail 30"
echo "    -> tem que aparecer 'session.status WORKING' ou similar"
echo " 2. Manda 'teste' do celular pessoal pro +5521967813366"
echo " 3. Roda: docker logs assistente-virtual --since 2m | grep -i ANA"
echo "    -> tem que aparecer [ANA] webhook event= ..."
echo "================================================"
