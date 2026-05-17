#!/bin/bash
# auto-apply.sh — executado pelo cron de auto-deploy a cada commit novo.
# Idempotente. Loga tudo em /var/log/hairtech-autodeploy.log.
#
# Round 2 (17/05/2026): Manus fechou P3 (ANA paired) e ressuscitou Traefik.
# Foco agora: resolver ia.hairtech.org → 502 (provavelmente openai-proxy
# fora da network 'web' apos Traefik restart).

set +e

LOG=/var/log/hairtech-autodeploy.log
exec >> "$LOG" 2>&1

REV=$(cd /home/user/nodejs && git rev-parse --short HEAD 2>/dev/null)
echo ""
echo "============================================================"
echo "[$(date -Iseconds)] auto-apply.sh START rev=$REV"
echo "============================================================"

# ---------------------------------------------------------------
# T1: Garantir Traefik rodando
# ---------------------------------------------------------------
T_STATUS=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null || echo "missing")
echo "[T1] Traefik: $T_STATUS"
if [ "$T_STATUS" = "exited" ] || [ "$T_STATUS" = "dead" ]; then
  echo "[T1] Traefik down — docker start..."
  docker start traefik-traefik-1 2>&1
  sleep 10
fi

# ---------------------------------------------------------------
# T2: Garantir containers Web Traefik na rede 'web'
#     (Manus reportou 502 em ia.hairtech.org — openai-proxy provavelmente
#      saiu da rede 'web' quando Traefik subiu. Religar.)
# ---------------------------------------------------------------
for C in openai-proxy assistente-virtual hairtech-openclaw whatsapp-inbox dashboard-frontend; do
  EXISTS=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null)
  if [ -z "$EXISTS" ]; then
    echo "[T2] $C nao existe — pulando"
    continue
  fi
  ON_WEB=$(docker inspect "$C" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -c '^web$')
  if [ "$ON_WEB" = "0" ]; then
    echo "[T2] $C NAO esta na network 'web' — conectando..."
    docker network connect web "$C" 2>&1
    echo "[T2] $C conectado"
  else
    echo "[T2] $C ja esta na network 'web'"
  fi
done

# ---------------------------------------------------------------
# T3: Labels Traefik dos containers — diagnostico
# ---------------------------------------------------------------
echo "[T3] Labels Traefik dos containers chave:"
for C in openai-proxy assistente-virtual hairtech-openclaw; do
  LABELS=$(docker inspect "$C" --format '{{range $k,$v := .Config.Labels}}{{if (eq (index (split $k ".") 0) "traefik")}}{{$k}}={{$v}}{{println}}{{end}}{{end}}' 2>/dev/null)
  if [ -z "$LABELS" ]; then
    echo "[T3] $C — sem labels traefik"
  else
    echo "[T3] $C:"
    echo "$LABELS" | sed 's/^/[T3]     /'
  fi
done

# ---------------------------------------------------------------
# T4: Estado interno do AV + WAHA
# ---------------------------------------------------------------
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env 2>/dev/null | cut -d= -f2-)
if [ -n "$KEY" ]; then
  AV_HEALTH=$(docker exec assistente-virtual wget -qO- --timeout=5 http://localhost:3001/health 2>&1 | head -c 200)
  echo "[T4] AV /health: $AV_HEALTH"

  WAHA_STATUS=$(docker exec assistente-virtual wget -qO- --timeout=5 --header="X-Api-Key: $KEY" "http://whatsapp-ana:3000/api/sessions/default" 2>&1 | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get('status','?'), 'me=', (d.get('me') or {}).get('id','null'), 'engine=', (d.get('engine') or {}).get('state','?'))
except:
  print('(parse failed)')" 2>&1)
  echo "[T4] WAHA: $WAHA_STATUS"
fi

# ---------------------------------------------------------------
# T5: Smoke test publico apos T2 connect
# ---------------------------------------------------------------
sleep 3
echo "[T5] Smoke test publico:"
for URL in https://hairtech.org/health https://claw.hairtech.org/ https://ia.hairtech.org/health https://ia.hairtech.org/v1/models; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 "$URL" 2>/dev/null || echo "000")
  echo "[T5]   $URL -> $CODE"
done

# ---------------------------------------------------------------
# T6: Resumo final de containers
# ---------------------------------------------------------------
echo "[T6] Containers (status/restarts):"
for C in traefik-traefik-1 assistente-virtual whatsapp-ana hairtech-openclaw hairtech-postgres openai-proxy hairtech-authbot whatsapp-inbox dashboard-frontend; do
  S=$(docker inspect "$C" --format '{{.State.Status}}/{{.State.RestartCount}}' 2>/dev/null || echo "missing")
  echo "[T6]   $C -> $S"
done

echo "[$(date -Iseconds)] auto-apply.sh END"
