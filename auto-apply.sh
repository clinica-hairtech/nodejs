#!/bin/bash
# auto-apply.sh — executado pelo cron de auto-deploy a cada commit novo.
# Idempotente. Loga tudo em /var/log/hairtech-autodeploy.log.
# Round 1 (17/05/2026): focar em ressuscitar Traefik (exited 128 ha 4 dias).

set +e

LOG=/var/log/hairtech-autodeploy.log
exec >> "$LOG" 2>&1

REV=$(cd /home/user/nodejs && git rev-parse --short HEAD 2>/dev/null)
echo ""
echo "============================================================"
echo "[$(date -Iseconds)] auto-apply.sh START rev=$REV"
echo "============================================================"

# ---------------------------------------------------------------
# T1: Garantir Traefik rodando (priority #1)
# ---------------------------------------------------------------
T_STATUS=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null || echo "missing")
T_EXIT=$(docker inspect traefik-traefik-1 --format '{{.State.ExitCode}}' 2>/dev/null || echo "?")
echo "[T1] Traefik status atual: $T_STATUS (exit code: $T_EXIT)"

case "$T_STATUS" in
  running)
    echo "[T1] Traefik OK"
    ;;
  exited|dead|created)
    echo "[T1] Traefik down — tentando docker start..."
    docker start traefik-traefik-1 2>&1
    sleep 10
    T_STATUS_2=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null)
    echo "[T1] Status apos docker start: $T_STATUS_2"
    if [ "$T_STATUS_2" != "running" ]; then
      echo "[T1] Logs (ultimas 60 linhas):"
      docker logs traefik-traefik-1 --tail 60 2>&1
    fi
    ;;
  missing)
    echo "[T1] AVISO: container traefik-traefik-1 nao existe."
    docker ps -a --filter name=traefik --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
    ;;
esac

# ---------------------------------------------------------------
# T2: Estado interno do AV + WAHA (via DNS interna)
# ---------------------------------------------------------------
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env 2>/dev/null | cut -d= -f2-)

if [ -n "$KEY" ]; then
  AV_HEALTH=$(docker exec assistente-virtual wget -qO- --timeout=5 http://localhost:3001/health 2>&1 | head -c 200)
  echo "[T2] AV /health (interno): $AV_HEALTH"

  WAHA_BLOB=$(docker exec assistente-virtual wget -qO- --timeout=5 --header="X-Api-Key: $KEY" "http://whatsapp-ana:3000/api/sessions/default" 2>&1)
  echo "[T2] WAHA session (interno): $(echo "$WAHA_BLOB" | head -c 400)"
else
  echo "[T2] WHATSAPP_ANA_KEY ausente no .env — pulando checks de webhook"
fi

# ---------------------------------------------------------------
# T3: Acessibilidade publica via Traefik (smoke test)
# ---------------------------------------------------------------
for URL in https://hairtech.org/health https://claw.hairtech.org/ https://ia.hairtech.org/health; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 "$URL" 2>/dev/null || echo "000")
  echo "[T3] $URL -> $CODE"
done

# ---------------------------------------------------------------
# T4: Estado de containers chave (resumo)
# ---------------------------------------------------------------
echo "[T4] Containers chave:"
for C in traefik-traefik-1 assistente-virtual whatsapp-ana hairtech-openclaw hairtech-postgres openai-proxy; do
  S=$(docker inspect "$C" --format '{{.State.Status}}/{{.State.RestartCount}}/{{.State.ExitCode}}' 2>/dev/null || echo "missing")
  echo "[T4]   $C -> $S"
done

echo "[$(date -Iseconds)] auto-apply.sh END"
