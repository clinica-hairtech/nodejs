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

echo "--- 4. TRAEFIK ROUTERS ---"
TK=$(docker ps --format "{{.Names}}" | grep -i traefik | head -1)
echo "Traefik: $TK"
[ -n "$TK" ] && docker exec "$TK" wget -qO- http://127.0.0.1:8080/api/http/routers 2>/dev/null | python3 -c "
import sys,json
try:
  rs=json.load(sys.stdin)
  for r in rs:
    n=r.get('name','')
    if 'av' in n or 'whatsapp' in n or 'inbox' in n:
      print(' ',n,'prio='+str(r.get('priority','?')),'status='+r.get('status','?'))
      print('  rule:',r.get('rule','')[:120])
except Exception as e: print('erro:',e)
" || echo "API inacessivel"

echo "--- 5. ENTRYPOINTS ---"
[ -n "$TK" ] && docker exec "$TK" wget -qO- http://127.0.0.1:8080/api/entrypoints 2>/dev/null | python3 -c "
import sys,json
try:
  for e in json.load(sys.stdin): print(' ',e.get('name'),e.get('address'))
except: print('erro')
"

echo "--- 6. TESTE DIRETO AV :3001 ---"
docker exec assistente-virtual sh -c 'wget -qO- 127.0.0.1:3001/health && echo HEALTH_OK || echo HEALTH_FALHOU'

echo "--- 7. VERIFY_TOKEN ---"
VT=$(docker exec assistente-virtual sh -c 'echo $VERIFY_TOKEN' 2>/dev/null)
echo "VERIFY_TOKEN=$VT"
docker exec assistente-virtual sh -c "wget -qO- '127.0.0.1:3001/webhook?hub.mode=subscribe&hub.verify_token=$VT&hub.challenge=TEST123' 2>&1" && echo "WEBHOOK_VERIFY_OK" || echo "WEBHOOK_VERIFY_FALHOU"

echo "--- 8. PARAR WHATSAPP-INBOX E TESTAR ---"
docker stop whatsapp-inbox 2>/dev/null && echo "inbox parado" || echo "inbox nao rodava"
sleep 8
docker exec assistente-virtual sh -c 'wget -qO- --post-data="{}" 127.0.0.1:3001/webhook 2>&1 | head -3'

echo "--- 9. LOGS AV ---"
docker logs assistente-virtual --tail 20 2>&1

echo "--- 10. REINICIAR INBOX ---"
docker start whatsapp-inbox 2>/dev/null && echo "inbox reiniciado" || echo "nao reiniciou"

echo "--- 11. LOGS INBOX ---"
docker logs whatsapp-inbox --tail 10 2>&1

echo "====== FIM $(date) ======"
