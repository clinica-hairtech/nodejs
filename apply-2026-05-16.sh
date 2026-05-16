#!/bin/bash
# apply-2026-05-16.sh
# Aplica os fixes commitados em 16/05/2026 (HairTech sessao noturna).
# Roda uma vez apos git pull. Idempotente.
#
# Uso:
#   bash /home/user/nodejs/apply-2026-05-16.sh

set -e
set +H

cd /home/user/nodejs

echo "================================================"
echo " HairTech — Aplicando fixes 16/05/2026"
echo "================================================"
echo ""

echo "[1/3] Verificando estado do branch..."
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "branch atual: $BRANCH"
if [ "$BRANCH" != "claude/hairtech-whatsapp-ai-liD5V" ]; then
  echo "AVISO: branch atual nao e claude/hairtech-whatsapp-ai-liD5V"
  echo "Trocando..."
  git fetch origin claude/hairtech-whatsapp-ai-liD5V
  git checkout claude/hairtech-whatsapp-ai-liD5V
fi
git status --short
echo ""

echo "[2/3] Atualizando do GitHub..."
git fetch origin claude/hairtech-whatsapp-ai-liD5V
git pull --ff-only origin claude/hairtech-whatsapp-ai-liD5V
echo "Commits aplicados:"
git log --oneline -5
echo ""

echo "[3/3] Recriando container whatsapp-ana com a imagem 2024.11..."
echo "(auth persiste no volume; nao deve pedir QR)"
docker compose -f docker-compose.whatsapp-ana.yml up -d --force-recreate whatsapp-ana
echo "Aguardando 45s pra Chromium subir..."
sleep 45
echo ""

echo "================================================"
echo " Validacao"
echo "================================================"
KEY=$(grep "^WHATSAPP_ANA_KEY=" .env | cut -d= -f2-)
echo ""
echo "-- Container --"
docker ps --filter name=whatsapp-ana --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
echo ""
echo "-- Sessao WAHA (engine.state e a fonte de verdade, nao o campo status que tem bug) --"
WAHA_IP=$(docker inspect whatsapp-ana --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
echo "WAHA_IP=$WAHA_IP"
curl -s -H "X-Api-Key: $KEY" "http://$WAHA_IP:3000/api/sessions/default" \
  | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print('status      :', d.get('status'))
  print('engine.state:', (d.get('engine') or {}).get('state'))
  print('me          :', (d.get('me') or {}).get('id'))
except Exception as e:
  print('ERRO ao ler JSON:', e)
" 2>&1
echo ""
echo "-- Ultimos logs do WAHA --"
docker logs whatsapp-ana --tail 15 2>&1 | grep -iE 'error|warn|evaluate|ready|working|connected' | tail -10
echo ""
echo "================================================"
echo " Proximo passo manual:"
echo " 1. Dr. Ricardo manda 'teste' pelo celular pessoal pro +5521967813366"
echo " 2. Esperar 15s"
echo " 3. Rodar:"
echo "      docker logs assistente-virtual --since 2m | grep ANA"
echo " 4. Se aparecer [ANA] webhook event= e [ANA] msg de 5521... -> P3 FECHADO"
echo "================================================"
