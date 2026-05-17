#!/bin/bash
# auto-apply.sh v6 — Cron robusto a conflitos locais (17/05/2026)
#
# Manus reportou: Round 3+4 nao aplicaram porque cron usava git pull --ff-only
# que falha silenciosamente quando ha modificacoes locais. Manus fez
# git reset --hard manual pra forcar Round 5.
#
# Round 6 atualiza o cron pra usar git reset --hard origin/branch (sobrescreve
# locais). Custo: edicoes manuais de Manus em /home/user/nodejs/* serao
# perdidas no proximo tick. Beneficio: bridge nunca mais trava.
# Untracked files (.bak-*, public/, etc.) NAO sao tocados por reset --hard.
#
# Mantem MODO READ-ONLY: T2b ainda skipa start AV, watchdog nao instalado.
# Aguardando Dr. Ricardo acordar e autorizar restart.

set +e

LOG=/var/log/hairtech-autodeploy.log
exec >> "$LOG" 2>&1

REV=$(cd /home/user/nodejs && git rev-parse --short HEAD 2>/dev/null)
echo ""
echo "============================================================"
echo "[$(date -Iseconds)] auto-apply.sh START rev=$REV v6 (READ-ONLY + cron robusto)"
echo "============================================================"

# ---------------------------------------------------------------
# T-1 (NOVO): Atualizar cron pra usar git reset --hard (idempotente)
# ---------------------------------------------------------------
CRON=/etc/cron.d/hairtech-autodeploy
if [ -f "$CRON" ] && grep -q "git pull --ff-only" "$CRON"; then
  echo "[T-1] Cron usa git pull --ff-only — atualizando pra git reset --hard"
  cat > "$CRON" <<'CRONEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/2 * * * * root cd /home/user/nodejs && git fetch origin claude/hairtech-whatsapp-ai-liD5V --quiet 2>&1 && [ "$(git rev-parse HEAD 2>/dev/null)" != "$(git rev-parse origin/claude/hairtech-whatsapp-ai-liD5V 2>/dev/null)" ] && echo "[$(date -Iseconds)] commit novo, aplicando via reset --hard" >> /var/log/hairtech-autodeploy.log && git reset --hard origin/claude/hairtech-whatsapp-ai-liD5V --quiet >> /var/log/hairtech-autodeploy.log 2>&1 && bash /home/user/nodejs/auto-apply.sh >> /var/log/hairtech-autodeploy.log 2>&1
CRONEOF
  chmod 644 "$CRON"
  systemctl restart cron 2>/dev/null || service cron restart 2>/dev/null
  echo "[T-1] Cron atualizado pra git reset --hard"
elif grep -q "git reset --hard origin" "$CRON" 2>/dev/null; then
  echo "[T-1] Cron ja usa git reset --hard (ok)"
else
  echo "[T-1] AVISO: cron $CRON nao tem padrao esperado:"
  cat "$CRON" 2>&1 | sed 's/^/[T-1]   /'
fi

# ---------------------------------------------------------------
# T0: Garantir watchdog AV REMOVIDO (Round 4 instalou; Round 5 removeu;
#     defesa em profundidade pra caso volte por acidente)
# ---------------------------------------------------------------
WATCHDOG=/etc/cron.d/hairtech-av-watchdog
if [ -f "$WATCHDOG" ]; then
  echo "[T0] Watchdog ressurgiu — removendo de novo"
  rm -f "$WATCHDOG"
  systemctl restart cron 2>/dev/null || service cron restart 2>/dev/null
else
  echo "[T0] Watchdog ausente (ok)"
fi

# ---------------------------------------------------------------
# T1: Traefik state (READ-ONLY)
# ---------------------------------------------------------------
T_STATUS=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null || echo "missing")
echo "[T1] Traefik: $T_STATUS"

# ---------------------------------------------------------------
# T2: Network check (READ-ONLY)
# ---------------------------------------------------------------
echo "[T2] Network check:"
for C in openai-proxy assistente-virtual hairtech-openclaw whatsapp-inbox dashboard-frontend whatsapp-ana; do
  STATE=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  ON_WEB=$(docker inspect "$C" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -c '^web$')
  echo "[T2]   $C state=$STATE on_web=$ON_WEB"
done

# ---------------------------------------------------------------
# T2b SKIPPED — AV intencional parado (aguardando Dr. Ricardo)
# ---------------------------------------------------------------
echo "[T2b] SKIP — modo READ-ONLY ate Dr. Ricardo autorizar restart"

# ---------------------------------------------------------------
# T3: Labels Traefik (READ-ONLY)
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
# T4 SKIPPED
# ---------------------------------------------------------------
echo "[T4] SKIP — AV parado"

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
# T6: docker ps -a
# ---------------------------------------------------------------
echo "[T6] Containers (docker ps -a):"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>&1 | sed 's/^/[T6] /'

# ---------------------------------------------------------------
# T7: backups manuais Manus
# ---------------------------------------------------------------
echo "[T7] Backups manuais (nao apagar):"
ls -la /home/user/nodejs/*.bak-* 2>/dev/null | sed 's/^/[T7] /'

echo "[$(date -Iseconds)] auto-apply.sh END (READ-ONLY mode v6)"
