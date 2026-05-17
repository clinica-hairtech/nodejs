#!/bin/bash
# auto-apply.sh v7 — OpenClaw integration + Claude Code install (17/05/2026)
#
# Dr. Ricardo autorizou: "Faca tudo que nao depende disso [Gemini billing +
# Meta cooldown] e termine de implementar para o Openclaw estar conectado
# a voce e funcionando, instalar tudo que precisa".
#
# Round 7 adiciona:
# - T8: instalar Claude Code globalmente no VPS (npm install -g)
#       (autenticacao OAuth fica pro Dr. Ricardo amanha — 30s no celular)
# - T9: diagnostico do OpenClaw (containers, config, /api response)
# - T10: prepara provider Anthropic Claude em openclaw.json
#       (snippet pronto pra merge quando ANTHROPIC_API_KEY for adicionada)
#
# Mantem READ-ONLY pra containers (AV/INBOX/bridge intencional parados).

set +e

LOG=/var/log/hairtech-autodeploy.log
exec >> "$LOG" 2>&1

REV=$(cd /home/user/nodejs && git rev-parse --short HEAD 2>/dev/null)
echo ""
echo "============================================================"
echo "[$(date -Iseconds)] auto-apply.sh START rev=$REV v7 (OpenClaw integration)"
echo "============================================================"

# ---------------------------------------------------------------
# T-1: Cron robusto (mantido do v6)
# ---------------------------------------------------------------
CRON=/etc/cron.d/hairtech-autodeploy
if [ -f "$CRON" ] && grep -q "git pull --ff-only" "$CRON"; then
  echo "[T-1] Atualizando cron pra git reset --hard"
  cat > "$CRON" <<'CRONEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/2 * * * * root cd /home/user/nodejs && git fetch origin claude/hairtech-whatsapp-ai-liD5V --quiet 2>&1 && [ "$(git rev-parse HEAD 2>/dev/null)" != "$(git rev-parse origin/claude/hairtech-whatsapp-ai-liD5V 2>/dev/null)" ] && echo "[$(date -Iseconds)] commit novo, aplicando via reset --hard" >> /var/log/hairtech-autodeploy.log && git reset --hard origin/claude/hairtech-whatsapp-ai-liD5V --quiet >> /var/log/hairtech-autodeploy.log 2>&1 && bash /home/user/nodejs/auto-apply.sh >> /var/log/hairtech-autodeploy.log 2>&1
CRONEOF
  chmod 644 "$CRON"
  systemctl restart cron 2>/dev/null || service cron restart 2>/dev/null
fi

# ---------------------------------------------------------------
# T0: Watchdog AV removido (mantido do v5/v6)
# ---------------------------------------------------------------
WATCHDOG=/etc/cron.d/hairtech-av-watchdog
[ -f "$WATCHDOG" ] && { rm -f "$WATCHDOG"; systemctl restart cron 2>/dev/null; echo "[T0] Watchdog removido"; } || echo "[T0] Watchdog ausente"

# ---------------------------------------------------------------
# T1-T7: Diagnostico READ-ONLY (mantido do v6)
# ---------------------------------------------------------------
T_STATUS=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null || echo "missing")
echo "[T1] Traefik: $T_STATUS"

echo "[T2] Network check:"
for C in openai-proxy assistente-virtual hairtech-openclaw whatsapp-inbox dashboard-frontend whatsapp-ana; do
  STATE=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  ON_WEB=$(docker inspect "$C" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -c '^web$')
  echo "[T2]   $C state=$STATE on_web=$ON_WEB"
done

echo "[T2b] SKIP — modo READ-ONLY ate Dr. Ricardo autorizar restart"

echo "[T3] Labels Traefik:"
for C in openai-proxy assistente-virtual hairtech-openclaw whatsapp-inbox; do
  LABELS=$(docker inspect "$C" --format '{{range $k,$v := .Config.Labels}}{{if (eq (index (split $k ".") 0) "traefik")}}{{$k}}={{$v}}{{println}}{{end}}{{end}}' 2>/dev/null)
  [ -n "$LABELS" ] && { echo "[T3] $C:"; echo "$LABELS" | sed 's/^/[T3]     /'; }
done

echo "[T4] SKIP — AV parado"

sleep 3
echo "[T5] Smoke test publico:"
for URL in https://hairtech.org/health https://hairtech.org/webhook https://claw.hairtech.org/ https://ia.hairtech.org/v1-proxy/v1/models; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 "$URL" 2>/dev/null || echo "000")
  echo "[T5]   $URL -> $CODE"
done

echo "[T6] Containers:"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>&1 | sed 's/^/[T6] /'

echo "[T7] Backups manuais:"
ls -la /home/user/nodejs/*.bak-* 2>/dev/null | sed 's/^/[T7] /'

# ---------------------------------------------------------------
# T8 (NOVO): Install Claude Code globalmente se nao presente
# ---------------------------------------------------------------
if ! command -v claude &>/dev/null; then
  echo "[T8] Claude Code nao instalado — npm install -g @anthropic-ai/claude-code"
  npm install -g @anthropic-ai/claude-code 2>&1 | tail -5 | sed 's/^/[T8]   /'
  if command -v claude &>/dev/null; then
    VER=$(claude --version 2>&1 | head -1)
    echo "[T8] Claude Code instalado: $VER"
  else
    echo "[T8] FALHOU. Verificar Node.js: $(node --version 2>&1) npm: $(npm --version 2>&1)"
  fi
else
  VER=$(claude --version 2>&1 | head -1)
  echo "[T8] Claude Code ja instalado: $VER"
fi

# ---------------------------------------------------------------
# T9 (NOVO): OpenClaw diagnostic
# ---------------------------------------------------------------
echo "[T9] OpenClaw diagnostic:"
OPENCLAW_IP=$(docker inspect hairtech-openclaw --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | awk '{print $1}')
echo "[T9]   IP interno: $OPENCLAW_IP"

if [ -n "$OPENCLAW_IP" ]; then
  H1=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://$OPENCLAW_IP:18789/" 2>/dev/null || echo "000")
  H2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://$OPENCLAW_IP:18789/api/health" 2>/dev/null || echo "000")
  H3=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://$OPENCLAW_IP:18789/api/agents" 2>/dev/null || echo "000")
  echo "[T9]   :18789/             -> $H1"
  echo "[T9]   :18789/api/health   -> $H2"
  echo "[T9]   :18789/api/agents   -> $H3"
fi

echo "[T9]   Configs em /opt/hairtech-openclaw/config/:"
ls -la /opt/hairtech-openclaw/config/ 2>/dev/null | sed 's/^/[T9]     /'

# ---------------------------------------------------------------
# T10 (NOVO): Preparar provider Anthropic Claude em openclaw.json
# Estrategia: NAO mexer no openclaw.json (Manus teve problemas com schema).
# Em vez disso, escrever snippet pronto a /opt/hairtech-openclaw/config/
# claude-provider-snippet.json — Dr. Ricardo (ou Round 8 quando autorizado)
# faz o merge depois de gerar ANTHROPIC_API_KEY.
# ---------------------------------------------------------------
SNIPPET=/opt/hairtech-openclaw/config/claude-provider-snippet.json
if [ -d /opt/hairtech-openclaw/config ]; then
  cat > "$SNIPPET" <<'SNIPEOF'
{
  "_README": "Snippet pra adicionar Anthropic Claude como provider no OpenClaw. Mergear em openclaw.json -> models.providers. Gerar key em console.anthropic.com/settings/keys e exportar ANTHROPIC_API_KEY no env do container hairtech-openclaw (ou no /opt/hairtech-openclaw/.env).",
  "providers": {
    "anthropic-api": {
      "api": "anthropic-messages",
      "base_url": "https://api.anthropic.com/v1",
      "auth_header": "x-api-key",
      "auth_env": "ANTHROPIC_API_KEY",
      "models": {
        "claude-opus-4-7": {
          "id": "claude-opus-4-7",
          "context_window": 1000000,
          "max_output_tokens": 64000,
          "supports_tools": true,
          "supports_thinking": true,
          "use_for": "tasks complexos: planejar, revisar codigo, decisoes estrategicas"
        },
        "claude-sonnet-4-6": {
          "id": "claude-sonnet-4-6",
          "context_window": 200000,
          "max_output_tokens": 8192,
          "supports_tools": true,
          "use_for": "uso geral: chat de personas, geracao texto"
        },
        "claude-haiku-4-5": {
          "id": "claude-haiku-4-5-20251001",
          "context_window": 200000,
          "max_output_tokens": 8192,
          "supports_tools": true,
          "use_for": "tasks rapidos baratos: classificar, parsing, sumarizar curto"
        }
      }
    }
  }
}
SNIPEOF
  chmod 644 "$SNIPPET"
  echo "[T10] Snippet Anthropic salvo em $SNIPPET"
  echo "[T10] Para ativar:"
  echo "[T10]   1. Dr. Ricardo gera key em console.anthropic.com/settings/keys"
  echo "[T10]   2. echo \"ANTHROPIC_API_KEY=sk-ant-...\" >> /opt/hairtech-openclaw/.env"
  echo "[T10]   3. Mergear o bloco \"providers.anthropic-api\" do snippet"
  echo "[T10]      no models.providers do openclaw.json (backup primeiro)"
  echo "[T10]   4. docker restart hairtech-openclaw"
else
  echo "[T10] /opt/hairtech-openclaw/config nao existe — pulando"
fi

# ---------------------------------------------------------------
# T11 (NOVO): hairtech-orquestrador backup check (Manus removeu por schema invalido)
# ---------------------------------------------------------------
BAK=/opt/hairtech-openclaw/config/hairtech-orquestrador.json.bak
if [ -f "$BAK" ]; then
  SZ=$(stat -c%s "$BAK" 2>/dev/null)
  echo "[T11] Backup hairtech-orquestrador.json.bak existe ($SZ bytes)"
  echo "[T11] Primeiras linhas (para Claude analisar schema):"
  head -50 "$BAK" 2>&1 | sed 's/^/[T11]   /'
else
  echo "[T11] Backup hairtech-orquestrador.json.bak ausente"
fi

echo "[$(date -Iseconds)] auto-apply.sh END (v7 OpenClaw integration)"
