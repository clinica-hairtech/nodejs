#!/bin/bash
echo "====== HAIRTECH AV FIX $(date) ======"

echo "--- 1. CONTAINERS ---"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "NAME|assistente|whatsapp|traefik|openclaw"

echo "--- 2. LABELS AV ---"
docker inspect assistente-virtual 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)[0]
for k,v in sorted(d['Config']['Labels'].items()):
    if 'traefik' in k: print(' ',k,'=',v)
"

echo "--- 3. LABELS WHATSAPP-INBOX ---"
docker inspect whatsapp-inbox 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)[0]
for k,v in sorted(d['Config']['Labels'].items()):
    if 'traefik' in k: print(' ',k,'=',v)
" 2>/dev/null || echo "nao encontrado"

echo "--- 4. TRAEFIK ROUTERS (timeout 5s) ---"
TK=$(docker ps --format "{{.Names}}" | grep -i traefik | head -1)
echo "Traefik container: $TK"
if [ -n "$TK" ]; then
  docker exec "$TK" wget -qO- --timeout=5 http://127.0.0.1:8080/api/http/routers 2>/dev/null | python3 -c "
import sys,json
try:
  rs=json.load(sys.stdin)
  for r in rs:
    n=r.get('name','')
    if 'av' in n or 'whatsapp' in n or 'inbox' in n:
      print(' ',n,'prio='+str(r.get('priority','?')),'status='+r.get('status','?'))
      print('  rule:',r.get('rule','')[:120])
except Exception as e: print('erro:',e)
" 2>/dev/null || echo "API Traefik inacessivel ou sem routers relevantes"

  echo "--- 5. ENTRYPOINTS ---"
  docker exec "$TK" wget -qO- --timeout=5 http://127.0.0.1:8080/api/entrypoints 2>/dev/null | python3 -c "
import sys,json
try:
  for e in json.load(sys.stdin): print(' ',e.get('name'),e.get('address'))
except: print('erro ao ler entrypoints')
" 2>/dev/null || echo "entrypoints inacessivel"
else
  echo "Container traefik NAO encontrado"
fi

echo "--- 6. TESTE DIRETO AV porta 3001 ---"
docker exec assistente-virtual sh -c 'wget -qO- --timeout=5 127.0.0.1:3001/health 2>&1 && echo HEALTH_OK || echo HEALTH_FALHOU'

echo "--- 7. VERIFY_TOKEN E WEBHOOK GET ---"
VT=$(docker exec assistente-virtual sh -c 'echo $VERIFY_TOKEN' 2>/dev/null)
echo "VERIFY_TOKEN=$VT"
docker exec assistente-virtual sh -c "wget -qO- --timeout=5 'http://127.0.0.1:3001/webhook?hub.mode=subscribe&hub.verify_token=$VT&hub.challenge=TEST123' 2>&1" && echo "WEBHOOK_GET_OK" || echo "WEBHOOK_GET_FALHOU"

echo "--- 8. TESTE POST WEBHOOK DIRETO ---"
docker exec assistente-virtual sh -c 'wget -qO- --timeout=5 --post-data="{\"object\":\"whatsapp_business_account\",\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"5521999999999\",\"type\":\"text\",\"text\":{\"body\":\"TESTE_AVFIX\"},\"id\":\"test001\",\"timestamp\":\"1234567890\"}],\"metadata\":{\"phone_number_id\":\"983992428140920\"}},\"field\":\"messages\"}]}]}" --header="Content-Type: application/json" http://127.0.0.1:3001/webhook 2>&1 | head -3' && echo "POST_OK" || echo "POST_FALHOU"

echo "--- 9. PARAR INBOX E TESTAR VIA HOST ---"
docker stop whatsapp-inbox 2>/dev/null && echo "inbox parado" || echo "inbox nao rodava"
sleep 6
AV_IP=$(docker inspect assistente-virtual --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null | head -1)
echo "IP do AV: $AV_IP"

echo "--- 10. LOGS AV (ultimas 15) ---"
docker logs assistente-virtual --tail 15 2>&1

echo "--- 11. REINICIAR INBOX ---"
docker start whatsapp-inbox 2>/dev/null && echo "inbox reiniciado"

echo "--- 12. LOGS INBOX (ultimas 5) ---"
docker logs whatsapp-inbox --tail 5 2>&1

echo "====== FIM $(date) ======"
