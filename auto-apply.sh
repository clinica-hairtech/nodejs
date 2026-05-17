#!/bin/bash
# auto-apply.sh — executado pelo cron de auto-deploy a cada commit novo.
# Idempotente. Loga tudo em /var/log/hairtech-autodeploy.log.
#
# Round 3 (17/05/2026): Bridge provada funcional. Round 2 revelou que AV
# para de rodar (transiente), causando hairtech.org/health -> 502.
# Foco do v3: T2b reinicia AV se nao-running. T5 com URLs corretas. T6 robusto.

set +e

LOG=/var/log/hairtech-autodeploy.log
exec >> "$LOG" 2>&1

REV=$(cd /home/user/nodejs && git rev-parse --short HEAD 2>/dev/null)
echo ""
echo "============================================================"
echo "[$(date -Iseconds)] auto-apply.sh START rev=$REV v3"
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
# T2b (NOVO): AV recovery — se nao-running, start.
# Run anterior reportou container c860a2c... is not running, causando 502.
# ---------------------------------------------------------------
echo "[T2b] AV recovery check..."
AV_STATE=$(docker inspect assistente-virtual --format '{{.State.Status}}' 2>/dev/null)
echo "[T2b] AV state atual: $AV_STATE"
case "$AV_STATE" in
  running)
    echo "[T2b] AV running OK"
    ;;
  exited|dead|created|paused)
    echo "[T2b] AV nao-running — tentando docker start..."
    docker start assistente-virtual 2>&1
    sleep 15
    AV_STATE_2=$(docker inspect assistente-virtual --format '{{.State.Status}}' 2>/dev/null)
    echo "[T2b] AV state pos-start: $AV_STATE_2"
    if [ "$AV_STATE_2" != "running" ]; then
      echo "[T2b] AV nao subiu — ultimos 50 linhas de log:"
      docker logs assistente-virtual --tail 50 2>&1
    fi
    ;;
  restarting)
    echo "[T2b] AV em restart loop — aguardando 20s e verificando..."
    sleep 20
    AV_STATE_2=$(docker inspect assistente-virtual --format '{{.State.Status}}' 2>/dev/null)
    echo "[T2b] AV state pos-wait: $AV_STATE_2"
    if [ "$AV_STATE_2" != "running" ]; then
      echo "[T2b] AV ainda em loop — ultimos 50 linhas de log:"
      docker logs assistente-virtual --tail 50 2>&1
    fi
    ;;
  "")
    echo "[T2b] AV container nao existe — verificando docker ps -a:"
    docker ps -a --filter name=assistente-virtual --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
    ;;
esac

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
  echo "[T4] AV /health (interno): $AV_HEALTH"

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
# T5: Smoke test publico com URLs CORRETAS
# (Round 2 usava /health em ia.hairtech.org — falso 502.
#  Router real exige /v1-proxy/* com middleware stripprefix)
# ---------------------------------------------------------------
sleep 3
echo "[T5] Smoke test publico:"
for URL in \
  https://hairtech.org/health \
  https://hairtech.org/webhook \
  https://claw.hairtech.org/ \
  https://ia.hairtech.org/v1-proxy/v1/models \
  https://ia.hairtech.org/v1-proxy/; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 "$URL" 2>/dev/null || echo "000")
  echo "[T5]   $URL -> $CODE"
done

# ---------------------------------------------------------------
# T6: Resumo de containers via docker ps -a (mais robusto que inspect)
# ---------------------------------------------------------------
echo "[T6] Containers (via docker ps -a):"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>&1 | sed 's/^/[T6] /'

echo "[$(date -Iseconds)] auto-apply.sh END"
