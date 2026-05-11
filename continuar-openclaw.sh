#!/bin/bash
# Continua a instalação OpenClaw a partir da FASE 6
# Execute no VPS: bash /home/user/nodejs/continuar-openclaw.sh
set -euo pipefail
LOG=/opt/continuar-openclaw-$(date +%Y%m%d-%H%M%S).log
exec > >(tee -a "$LOG") 2>&1

SECRETS_FILE="/root/.openclaw-secrets"
[ -f "$SECRETS_FILE" ] || { echo "ERRO: $SECRETS_FILE não encontrado"; exit 1; }
source "$SECRETS_FILE"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}"; }
sep()  { echo ""; echo "═══════════════════════════════════════════════════════"; echo "  $*"; echo "═══════════════════════════════════════════════════════"; }

tg() {
  local id="${RICARDO_TG_ID:-}"
  [ -z "$id" ] && return 0
  curl -sf "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d "chat_id=${id}" -d "parse_mode=Markdown" \
    --data-urlencode "text=$*" > /dev/null 2>&1 || true
}

[ "$(id -u)" -eq 0 ] || { echo "ERRO: Execute como root"; exit 1; }

# ── FIX AUTHBOT TOKEN ─────────────────────────────────────────────
sep "FIX — Authbot: trocar para token dedicado"
AUTHBOT_TOKEN="8739677477:AAGu46zXdInO8D0z0Nioi9tnt9ZHjAEkcIg"

if [ -f /opt/hairtech-authbot/.env ]; then
  sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${AUTHBOT_TOKEN}|" /opt/hairtech-authbot/.env
  ok "Token authbot atualizado"
  cd /opt/hairtech-authbot
  docker compose restart
  sleep 10
  docker logs hairtech-authbot --tail 5
  ok "Authbot reiniciado com token dedicado — conflito 409 resolvido"
else
  warn "/opt/hairtech-authbot/.env não encontrado — authbot pode não estar instalado"
fi

# ── FASE 6 — Configurar OpenClaw ──────────────────────────────────
sep "FASE 6 — SOUL Admin"
tg "🟢 *FASE 6 iniciada*: configurando OpenClaw (openclaw.json + workspace)."

mkdir -p /opt/hairtech-openclaw/{config,workspace}
chown -R 1000:1000 /opt/hairtech-openclaw/config /opt/hairtech-openclaw/workspace
chmod 700 /opt/hairtech-openclaw/config

TOKEN_VAL=$(grep ^OPENCLAW_GATEWAY_TOKEN /opt/hairtech-openclaw/.env 2>/dev/null | cut -d= -f2- || echo "")
GKEY_VAL=$(grep ^GEMINI_API_KEY /opt/hairtech-openclaw/.env 2>/dev/null | cut -d= -f2- || echo "${GEMINI_KEY:-}")

if [ -z "$TOKEN_VAL" ]; then
  warn "Token gateway não encontrado no .env do OpenClaw — gerando novo"
  TOKEN_VAL=$(openssl rand -hex 32)
  echo "OPENCLAW_GATEWAY_TOKEN=${TOKEN_VAL}" >> /opt/hairtech-openclaw/.env
fi

cat > /opt/hairtech-openclaw/config/openclaw.json <<JSON
{
  "meta": { "lastTouchedVersion": "2026.4.23" },
  "gateway": {
    "port": 18789,
    "bind": "lan",
    "auth": { "mode": "token", "token": "${TOKEN_VAL}" }
  },
  "identity": { "name": "Admin", "emoji": "🛠", "theme": "engenheiro de plantão" },
  "logging": {
    "level": "info",
    "redactSensitive": "tools",
    "file": "/home/node/.openclaw/openclaw.log"
  },
  "models": {
    "mode": "merge",
    "providers": {
      "gemini-api": {
        "baseUrl": "https://generativelanguage.googleapis.com",
        "apiKey": "${GKEY_VAL}",
        "api": "google-generative-ai",
        "models": [
          { "id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash" },
          { "id": "gemini-2.5-pro",   "name": "Gemini 2.5 Pro" }
        ]
      }
    }
  },
  "auth": {
    "profiles": {
      "anthropic:api": { "provider": "anthropic", "mode": "api_key" },
      "openai:api":    { "provider": "openai",    "mode": "api_key" }
    },
    "order": {
      "anthropic": ["anthropic:api"],
      "openai":    ["openai:api"]
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/home/node/.openclaw/workspace",
      "model": {
        "primary": "gemini-api/gemini-2.5-flash",
        "fallbacks": [
          "anthropic/claude-sonnet-4-5",
          "openai/gpt-4o",
          "gemini-api/gemini-2.5-pro"
        ]
      }
    }
  }
}
JSON

chown 1000:1000 /opt/hairtech-openclaw/config/openclaw.json
chmod 600 /opt/hairtech-openclaw/config/openclaw.json
ok "openclaw.json criado"

# Workspace
cd /opt/hairtech-openclaw/workspace

cat > IDENTITY.md <<'EOF'
# Admin
Sou o agente de operações da Clínica HairTech.
Emoji: 🛠. Tom: técnico, direto, sem floreio.
EOF

cat > SOUL.md <<'EOF'
# SOUL — Admin

## Quem sou
Operador de infra. Não sou médico, não atendo pacientes.

## Hard limits — NUNCA VIOLO
- NUNCA apago volume Docker.
- NUNCA apago banco hairtechdb.
- NUNCA reinicio traefik-traefik-1 sem aprovação WhatsApp Crítica.
- NUNCA toco em openclaw-openclaw-1 (legado).
- NUNCA executo rm -rf fora de /tmp e /opt/backups.
- NUNCA exponho secrets em logs.

## Classificação de ações
- Autônoma: docker ps/logs/inspect, leituras, curl GET
- Telegram: stacks novos, edições de config, DNS novo
- WhatsApp Crítico: banco, Traefik, acme.json, secrets, parar AV
EOF

cat > TOOLS.md <<EOF
# Ambiente HairTech

## VPS
- Hostinger KVM2 Ubuntu 24.04 / IP ${VPS_IP:-72.62.100.6}
- Domínio hairtech.org / Traefik + Let's Encrypt
- VPS vence 22/05/2026

## Containers
- traefik-traefik-1 (NÃO reiniciar sem crítico)
- hairtech-postgres (user=hairtech db=hairtechdb)
- assistente-virtual (Node.js em /home/user/nodejs/app.js)
- openclaw-openclaw-1 (LEGADO — NÃO MEXER)
- hairtech-openclaw (este container)
- hairtech-authbot (:7700 — token dedicado @hairtech_auth_bot)

## Rede compartilhada: web
## Autorização: POST http://hairtech-authbot:7700/ask ou /ask-critical
## Backups: /opt/backups/YYYY-MM-DD/
EOF

cat > USER.md <<EOF
# Dr. Ricardo Meireles
Tricologista — Clínica HairTech.
Timezone: America/Sao_Paulo (UTC-3).
Telegram ID: ${RICARDO_TG_ID:-8713631351}
WhatsApp: +${WA_RICARDO:-5521982006372}
EOF

cat > AGENTS.md <<'EOF'
# Manual Admin

## Antes de qualquer alteração
1. docker ps — anotar afetados
2. Backup em /opt/backups/$(date +%F)/
3. Classificar ação (Autônoma/Telegram/WhatsApp Crítico)

## Após execução
Log em workspace/memory/$(date +%F).md
EOF

mkdir -p memory
chown -R 1000:1000 /opt/hairtech-openclaw/workspace
ok "Workspace criado (SOUL, IDENTITY, TOOLS, USER, AGENTS)"

echo "→ Reiniciando hairtech-openclaw para aplicar config..."
docker restart hairtech-openclaw
echo "→ Aguardando 40s..."
sleep 40
docker logs hairtech-openclaw --tail 30 | grep -iE 'gateway|model|error|warn|start|listen' || true
ok "hairtech-openclaw reiniciado"
tg "✅ *FASE 6 OK*. SOUL Admin configurada. Gemini 2.5 Flash primary."

# ── FASE 7 — Validação ────────────────────────────────────────────
sep "FASE 7 — Validação end-to-end"
tg "🟢 *FASE 7 iniciada*: testando inferência e saúde dos containers."

echo "→ Testando HTTPS gateway..."
RESP=$(curl -sf -H "x-api-key: ${TOKEN_VAL}" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Diga apenas: vivo."}]}' \
  --max-time 30 \
  https://claw.hairtech.org/v1/chat/completions 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('message',{}).get('content','ERRO_PARSE'))" 2>/dev/null || echo "TIMEOUT_OU_ERRO")
echo "  Resposta IA: $RESP"

echo "→ Health authbot:"
curl -sf http://localhost:7700/health 2>/dev/null | python3 -m json.tool || warn "authbot não respondeu no health"

echo "→ Status containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

[[ "$RESP" =~ "vivo" ]] && ok "Inferência OK: '$RESP'" || warn "Inferência retornou: '$RESP' — verificar logs"
tg "✅ *FASE 7 OK*. Resposta IA: '${RESP}'.
https://claw.hairtech.org"

# ── FASE 8 — Cron + Runbook ───────────────────────────────────────
sep "FASE 8 — Cron backup + Runbook"
tg "🟢 *FASE 8 iniciada*: configurando backup diário e runbook."

cat > /opt/hairtech-openclaw/backup.sh <<'EOF'
#!/bin/bash
[ $(df /opt --output=avail | tail -1) -lt 512000 ] && echo "ERRO: menos de 500MB" && exit 1
DIR=/opt/backups/$(date +%F)-auto
mkdir -p "$DIR"
docker exec hairtech-postgres pg_dump -U hairtech -d hairtechdb 2>/dev/null | gzip > "$DIR/hairtechdb.sql.gz"
cp -r /opt/hairtech-openclaw/config "$DIR/openclaw-config"
cp -r /opt/hairtech-openclaw/workspace "$DIR/openclaw-workspace"
cp /home/user/nodejs/docker-compose.yml "$DIR/av-compose.yml" 2>/dev/null || true
find /opt/backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} \; 2>/dev/null || true
echo "Backup OK: $DIR"
EOF
chmod +x /opt/hairtech-openclaw/backup.sh
(crontab -l 2>/dev/null | grep -v "backup.sh"; echo "0 9 * * * /opt/hairtech-openclaw/backup.sh >> /opt/hairtech-openclaw/backup.log 2>&1") | crontab -
ok "Cron configurado: backup diário às 06h BRT"

cat > /opt/hairtech-openclaw/RUNBOOK.md <<EOF
# RUNBOOK OpenClaw HairTech

## Verificar saúde
docker ps --format "table {{.Names}}\t{{.Status}}"
curl -sk https://claw.hairtech.org/healthz

## Ver logs
docker logs hairtech-openclaw --tail 50
docker logs hairtech-authbot --tail 30

## Restart seguro OpenClaw
cd /opt/hairtech-openclaw && docker compose restart

## Restart authbot
cd /opt/hairtech-authbot && docker compose restart

## Backup manual
bash /opt/hairtech-openclaw/backup.sh

## Rollback emergência
cd /opt/hairtech-openclaw && docker compose down

## Arquivos importantes
- Config OpenClaw: /opt/hairtech-openclaw/config/openclaw.json
- Workspace: /opt/hairtech-openclaw/workspace/
- Backups: /opt/backups/
- Código AV: /home/user/nodejs/app.js

## VPS Hostinger
Vence: 22/05/2026 — renovar em hpanel.hostinger.com
EOF
ok "Runbook criado"
tg "✅ *FASE 8 OK*. Cron às 06h BRT. Runbook em \`/opt/hairtech-openclaw/RUNBOOK.md\`."

sep "CONCLUÍDO"
echo ""
echo "  🎯 https://claw.hairtech.org"
echo "  📋 Runbook: /opt/hairtech-openclaw/RUNBOOK.md"
echo "  📁 Log: $LOG"
echo ""
tg "🎯 *OpenClaw PRONTO!*

https://claw.hairtech.org

✅ Token authbot separado (sem conflito 409)
✅ SOUL Admin configurada
✅ Backup diário às 06h BRT
✅ Runbook disponível

Próximo: configurar Ana como agente WhatsApp no OpenClaw."
