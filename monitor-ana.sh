#!/bin/bash
# monitor-ana.sh — Verifica sessao WAHA e tenta restart automatico
# Instalar cron: crontab -e
# Adicionar: */5 * * * * /bin/bash /home/user/nodejs/monitor-ana.sh >> /var/log/ana-monitor.log 2>&1

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

# Checar status da sessao
STATUS=$(docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>process.stdout.write(d.status||"UNKNOWN")).catch(e=>process.stdout.write("ERROR"));' \
  2>/dev/null)

echo "[$LOG_DATE] ANA status: $STATUS"

if [ "$STATUS" = "WORKING" ]; then
  exit 0
fi

# Tentar reiniciar sessao existente
echo "[$LOG_DATE] Tentando POST /start na sessao existente..."
docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,h={"X-Api-Key":k},B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default/start",{method:"POST",headers:h}).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>process.stdout.write(e.message));' \
  2>/dev/null
echo ""

sleep 30

STATUS2=$(docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>process.stdout.write(d.status||"UNKNOWN")).catch(e=>process.stdout.write("ERROR"));' \
  2>/dev/null)

echo "[$LOG_DATE] Apos restart: $STATUS2"

if [ "$STATUS2" = "WORKING" ]; then
  echo "[$LOG_DATE] OK: ANA reconectada automaticamente sem QR"
  exit 0
fi

if [ "$STATUS2" = "SCAN_QR_CODE" ]; then
  echo "[$LOG_DATE] CRITICO: ANA precisa de novo QR scan — intervencao manual necessaria"
  echo "[$LOG_DATE] Rode: /home/user/nodejs/monitor-ana.sh --qr para ver o QR"
  exit 2
fi

echo "[$LOG_DATE] FALHA: status=$STATUS2 — verificar container manualmente"
exit 1
