#!/bin/bash
# monitor-ana.sh — Verifica sessao WAHA e tenta restart automatico
# Instalar cron: crontab -e
# Adicionar: */5 * * * * /bin/bash /home/user/nodejs/monitor-ana.sh >> /var/log/ana-monitor.log 2>&1
#
# NOTA: WAHA WEBJS tem bug onde campo "status" alto-nivel fica em
# SCAN_QR_CODE mesmo apos conexao. Usar engine.state como fonte da verdade.

set +H
LOG_DATE=$(date '+%Y-%m-%d %H:%M:%S')
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)

if [ -z "$KEY" ]; then
  echo "[$LOG_DATE] ERRO: WHATSAPP_ANA_KEY nao encontrada no .env"
  exit 1
fi

# Verificar se container esta rodando
if ! docker ps --format '{{.Names}}' | grep -q "^whatsapp-ana$"; then
  echo "[$LOG_DATE] ALERTA: container whatsapp-ana nao esta rodando. Subindo..."
  docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml up -d
  sleep 20
fi

# Checar engine.state (fonte da verdade — ignora bug do campo status alto-nivel)
SESSION_JSON=$(docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>process.stdout.write(JSON.stringify(d))).catch(e=>process.stdout.write("{}"));' \
  2>/dev/null)

ENGINE_STATE=$(echo "$SESSION_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('engine',{}).get('state','UNKNOWN'))" 2>/dev/null)
STATUS_FIELD=$(echo "$SESSION_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','UNKNOWN'))" 2>/dev/null)

echo "[$LOG_DATE] ANA engine.state=$ENGINE_STATE status=$STATUS_FIELD"

# CONNECTED = sessao ativa (mesmo que status diga SCAN_QR_CODE — bug WAHA WEBJS)
if [ "$ENGINE_STATE" = "CONNECTED" ]; then
  echo "[$LOG_DATE] OK: ANA conectada (engine WEBJS ativa)"
  exit 0
fi

# OPENING/PAIRING = tentando conectar, aguardar
if [ "$ENGINE_STATE" = "OPENING" ] || [ "$ENGINE_STATE" = "PAIRING" ]; then
  echo "[$LOG_DATE] ANA em estado transitorio ($ENGINE_STATE) — aguardando..."
  exit 0
fi

# Tentar reiniciar sessao existente
echo "[$LOG_DATE] Tentando POST /start na sessao existente..."
docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,h={"X-Api-Key":k},B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default/start",{method:"POST",headers:h}).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>process.stdout.write(e.message));' \
  2>/dev/null
echo ""

sleep 30

SESSION_JSON2=$(docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>process.stdout.write(JSON.stringify(d))).catch(e=>process.stdout.write("{}"));' \
  2>/dev/null)

ENGINE_STATE2=$(echo "$SESSION_JSON2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('engine',{}).get('state','UNKNOWN'))" 2>/dev/null)

echo "[$LOG_DATE] Apos restart: engine.state=$ENGINE_STATE2"

if [ "$ENGINE_STATE2" = "CONNECTED" ]; then
  echo "[$LOG_DATE] OK: ANA reconectada automaticamente sem QR"
  exit 0
fi

if [ "$ENGINE_STATE2" = "OPENING" ] || [ "$ENGINE_STATE2" = "PAIRING" ]; then
  echo "[$LOG_DATE] ANA reconectando ($ENGINE_STATE2) — ok, aguardar proximo ciclo"
  exit 0
fi

echo "[$LOG_DATE] CRITICO: ANA precisa de novo QR scan — intervencao manual necessaria"
echo "[$LOG_DATE] Rode: /home/user/nodejs/reconectar-ana.sh para gerar QR"
exit 2
