#!/bin/bash
# auto-apply.sh v5 — MANUS DEPLOY MODE (17/05/2026 madrugada)
#
# CONTEXTO CRITICO (briefing Manus 23:27 BRT):
# - AV, whatsapp-ana, whatsapp-inbox, hairtech-operator-bridge PARADOS
#   INTENCIONALMENTE pra debug. NAO RELIGAR ATE Manus/Dr. Ricardo autorizar.
# - Gemini 429 (free tier excedido) bloqueia AV mesmo se religar
# - Meta rate-limit em 5521993542383, cooldown horas
# - whatsapp-inbox tem PHONE_NUMBER_ID errado (=WABA_ID em vez do real)
# - Backups manuais existem em /home/user/nodejs/{app.js,docker-compose.yml}.bak-20260517_022014
#   NAO APAGAR
#
# Round 5 REMOVE acoes destrutivas do Round 4:
# - REMOVE watchdog /etc/cron.d/hairtech-av-watchdog (Round 4 instalou)
# - SKIPA T2b (docker start AV) — AV intencional parado
# - SKIPA T4 health check via docker exec (AV parado, exec falha)
# - Vira tudo READ-ONLY: so diagnostico, zero acao em containers
#
# Quando voltar a religar:
# - Dr. Ricardo: fixa Gemini billing (console.cloud.google.com)
# - Dr. Ricardo: aguarda Meta cooldown
# - Manus ou Dr. Ricardo: fixa PHONE_NUMBER_ID em whatsapp-inbox
# - Dr. Ricardo: autoriza Claude (web) a religar -> commit Round 6 com T0+T2b reativados

set +e

LOG=/var/log/hairtech-autodeploy.log
exec >> "$LOG" 2>&1

REV=$(cd /home/user/nodejs && git rev-parse --short HEAD 2>/dev/null)
echo ""
echo "============================================================"
echo "[$(date -Iseconds)] auto-apply.sh START rev=$REV v5 (READ-ONLY / MANUS DEPLOY MODE)"
echo "============================================================"

# ---------------------------------------------------------------
# T0: REMOVER watchdog do Round 4 (estava restartando AV contra vontade)
# ---------------------------------------------------------------
WATCHDOG=/etc/cron.d/hairtech-av-watchdog
if [ -f "$WATCHDOG" ]; then
  echo "[T0] REMOVENDO watchdog $WATCHDOG (Round 4 instalou; Manus precisa de AV parado)"
  rm -f "$WATCHDOG"
  systemctl restart cron 2>/dev/null || service cron restart 2>/dev/null
  echo "[T0] Watchdog removido e cron reiniciado"
else
  echo "[T0] Watchdog ja nao existe (ok)"
fi

# ---------------------------------------------------------------
# T1: Traefik state (READ-ONLY)
# ---------------------------------------------------------------
T_STATUS=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null || echo "missing")
echo "[T1] Traefik: $T_STATUS (read-only, sem acao)"

# ---------------------------------------------------------------
# T2: Network check (READ-ONLY — nao conecta nada)
# ---------------------------------------------------------------
echo "[T2] Network check (read-only):"
for C in openai-proxy assistente-virtual hairtech-openclaw whatsapp-inbox dashboard-frontend; do
  STATE=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  ON_WEB=$(docker inspect "$C" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -c '^web$')
  echo "[T2]   $C state=$STATE on_web=$ON_WEB"
done

# ---------------------------------------------------------------
# T2b SKIPPED — AV intencional parado
# ---------------------------------------------------------------
echo "[T2b] SKIP — AV stopped on purpose by Manus (debug Gemini 429 + Meta rate limit)"

# ---------------------------------------------------------------
# T3: Labels Traefik (READ-ONLY diagnostico)
# ---------------------------------------------------------------
echo "[T3] Labels Traefik:"
for C in openai-proxy assistente-virtual hairtech-openclaw whatsapp-inbox; do
  LABELS=$(docker inspect "$C" --format '{{range $k,$v := .Config.Labels}}{{if (eq (index (split $k ".") 0) "traefik")}}{{$k}}={{$v}}{{println}}{{end}}{{end}}' 2>/dev/null)
  if [ -n "$LABELS" ]; then
    echo "[T3] $C:"
    echo "$LABELS" | sed 's/^/[T3]     /'
  fi
done

# ---------------------------------------------------------------
# T4 SKIPPED — AV parado, docker exec falharia
# ---------------------------------------------------------------
echo "[T4] SKIP — AV parado, docker exec nao funciona"

# ---------------------------------------------------------------
# T5: Smoke test publico (READ-ONLY)
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
# T6: docker ps -a (READ-ONLY)
# ---------------------------------------------------------------
echo "[T6] Containers (via docker ps -a):"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>&1 | sed 's/^/[T6] /'

# ---------------------------------------------------------------
# T7 NOVO: backups manuais do Manus
# ---------------------------------------------------------------
echo "[T7] Backups manuais do Manus (NAO APAGAR):"
ls -la /home/user/nodejs/*.bak-* 2>/dev/null | sed 's/^/[T7] /'

echo "[$(date -Iseconds)] auto-apply.sh END (READ-ONLY mode)"
