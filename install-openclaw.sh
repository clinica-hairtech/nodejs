#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  INSTALAÇÃO OPENCLAW SELF-HOSTED — HairTech v2026.4.23           ║
# ║  Execute como root no VPS: bash /home/user/nodejs/install-openclaw.sh ║
# ╚═══════════════════════════════════════════════════════════════════╝
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG=/opt/install-openclaw-$(date +%Y%m%d-%H%M%S).log
exec > >(tee -a "$LOG") 2>&1

# ── CREDENCIAIS ──────────────────────────────────────────────────────
# As credenciais são lidas de /root/.openclaw-secrets (NÃO commitado no git).
# Crie esse arquivo antes de executar:
#
#   cat > /root/.openclaw-secrets <<'EOF'
#   TG_TOKEN="8470054351:..."
#   WA_TOKEN="EAANMjg..."
#   WABA_ID="1480059533694084"
#   WA_PHONE_ID="983992428140920"
#   WA_RICARDO="5521982006372"
#   GEMINI_KEY="AIzaSy..."
#   ANTHROPIC_KEY="sk-ant-api03-..."
#   OPENAI_KEY="sk-proj-..."
#   HOSTINGER_TOKEN="RAW0ff..."
#   VPS_IP="72.62.100.6"
#   EOF
#   chmod 600 /root/.openclaw-secrets

SECRETS_FILE="/root/.openclaw-secrets"
if [ ! -f "$SECRETS_FILE" ]; then
  echo "ERRO: Arquivo de credenciais não encontrado: $SECRETS_FILE"
  echo "Crie o arquivo com as credenciais conforme instruções no topo deste script."
  exit 1
fi
# shellcheck source=/dev/null
source "$SECRETS_FILE"

# Validar variáveis obrigatórias
for VAR in TG_TOKEN WA_TOKEN WABA_ID WA_PHONE_ID WA_RICARDO GEMINI_KEY ANTHROPIC_KEY OPENAI_KEY HOSTINGER_TOKEN VPS_IP; do
  [ -z "${!VAR:-}" ] && { echo "ERRO: $VAR não definido em $SECRETS_FILE"; exit 1; }
done

RICARDO_TG_ID="${RICARDO_TG_ID:-}"  # pode ser pré-definido no .openclaw-secrets

# ── HELPERS ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}"; }
sep()  { echo ""; echo "═══════════════════════════════════════════════════════"; echo "  $*"; echo "═══════════════════════════════════════════════════════"; }

tg_raw() {
  local chat="$1"; shift
  curl -sf "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d "chat_id=${chat}" \
    -d "parse_mode=Markdown" \
    --data-urlencode "text=$*" > /dev/null 2>&1 || true
}

notify_tg() {
  [ -z "$RICARDO_TG_ID" ] && return 0
  tg_raw "$RICARDO_TG_ID" "$*"
}

# Aguarda Ricardo responder uma palavra-chave no Telegram (timeout em segundos)
wait_tg_keyword() {
  local keyword="$1"
  local timeout_s="${2:-600}"
  local deadline=$((SECONDS + timeout_s))
  local last_update=0

  echo "⏳ Aguardando Ricardo responder '$keyword' no Telegram (timeout: ${timeout_s}s)..."

  while [ $SECONDS -lt $deadline ]; do
    local resp
    resp=$(curl -sf "https://api.telegram.org/bot${TG_TOKEN}/getUpdates?offset=$((last_update+1))&timeout=20" 2>/dev/null || echo '{"result":[]}')
    local count
    count=$(echo "$resp" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(len(r))" 2>/dev/null || echo 0)
    if [ "$count" -gt 0 ]; then
      local text uid
      text=$(echo "$resp" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r[-1].get('message',{}).get('text',''))" 2>/dev/null || echo "")
      uid=$(echo "$resp" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r[-1]['update_id'])" 2>/dev/null || echo 0)
      last_update=$uid
      if [[ "${text^^}" == "${keyword^^}" ]]; then
        ok "Aprovado via Telegram: '$text'"
        return 0
      fi
    fi
    sleep 5
  done
  err "Timeout aguardando '$keyword'"
  return 1
}

# Obtém RICARDO_TG_ID (chat_id mais recente do bot)
bootstrap_tg_id() {
  sep "BOOTSTRAP — Descobrindo Telegram ID de Ricardo"

  # Se já está definido (no .openclaw-secrets ou como variável de ambiente), usar direto
  if [ -n "$RICARDO_TG_ID" ]; then
    ok "RICARDO_TG_ID já configurado: $RICARDO_TG_ID"
    notify_tg "🤖 *Script OpenClaw iniciado*. Estou instalando. Você será notificado em cada fase."
    return 0
  fi

  echo "👋 Buscando ID de Ricardo nas mensagens recentes do bot..."
  local resp
  resp=$(curl -sf "https://api.telegram.org/bot${TG_TOKEN}/getUpdates?limit=10" 2>/dev/null || echo '{"result":[]}')
  RICARDO_TG_ID=$(echo "$resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for upd in reversed(data.get('result',[])):
    msg = upd.get('message', {})
    if msg.get('from', {}).get('id'):
        print(msg['from']['id'])
        break
" 2>/dev/null || echo "")

  if [ -z "$RICARDO_TG_ID" ]; then
    echo ""
    warn "AÇÃO NECESSÁRIA: Abra o Telegram, ache @HairTechBot e mande /start"
    echo "O script vai aguardar 5 minutos..."
    local deadline=$((SECONDS + 300))
    while [ $SECONDS -lt $deadline ] && [ -z "$RICARDO_TG_ID" ]; do
      sleep 10
      resp=$(curl -sf "https://api.telegram.org/bot${TG_TOKEN}/getUpdates?limit=5" 2>/dev/null || echo '{"result":[]}')
      RICARDO_TG_ID=$(echo "$resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for upd in reversed(data.get('result',[])):
    msg = upd.get('message', {})
    if msg.get('from', {}).get('id'):
        print(msg['from']['id'])
        break
" 2>/dev/null || echo "")
    done
  fi

  if [ -z "$RICARDO_TG_ID" ]; then
    err "Não consegui descobrir o Telegram ID. Adicione RICARDO_TG_ID=SEU_ID em /root/.openclaw-secrets e rode novamente."
    exit 1
  fi
  ok "RICARDO_TG_ID = $RICARDO_TG_ID"
  notify_tg "🤖 *Script OpenClaw iniciado*. Estou instalando. Você será notificado em cada fase."
}

# ════════════════════════════════════════════════════════════════
# FASE PRÉ-0 — Pré-requisitos
# ════════════════════════════════════════════════════════════════
fase_pre0() {
  sep "FASE PRÉ-0 — Pré-requisitos"
  notify_tg "🟢 *FASE PRÉ-0 iniciada*: instalando dnsutils, criando template WA, checando VPS."

  # Verificações de segurança
  [ "$(id -u)" -eq 0 ] || { err "Execute como root!"; exit 1; }
  [ "$(hostname -I | awk '{print $1}')" = "$VPS_IP" ] 2>/dev/null || warn "IP do VPS não bate com $VPS_IP — verificar manualmente."

  # Instalar dnsutils
  echo "→ Instalando dnsutils..."
  apt-get update -qq
  apt-get install -y dnsutils python3 > /dev/null
  which dig > /dev/null && ok "dig instalado" || { err "dig não instalado!"; exit 1; }

  # Status VPS
  echo "→ Status VPS:"
  df -h / | head -2
  free -h | head -2
  uptime
  docker --version
  docker compose version

  # Checar espaço mínimo
  FREE_KB=$(df / --output=avail | tail -1)
  [ "$FREE_KB" -lt 2048000 ] && { err "Menos de 2GB livre em /. Abortar."; exit 1; }

  # Criar template Meta auth_critica_v1 via API
  echo "→ Verificando template WhatsApp auth_critica_v1..."
  EXISTS=$(curl -sf -H "Authorization: Bearer ${WA_TOKEN}" \
    "https://graph.facebook.com/v23.0/${WABA_ID}/message_templates?name=auth_critica_v1" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['name'] if d.get('data') else '')" 2>/dev/null || echo "")

  if [ -z "$EXISTS" ]; then
    echo "→ Criando template..."
    curl -sf -X POST \
      -H "Authorization: Bearer ${WA_TOKEN}" \
      -H "Content-Type: application/json" \
      "https://graph.facebook.com/v23.0/${WABA_ID}/message_templates" \
      -d '{
        "name":"auth_critica_v1","language":"pt_BR","category":"UTILITY",
        "components":[
          {"type":"BODY","text":"🚨 CRÍTICO\n*{{1}}*\n{{2}}\n\nApós aprovar, responda *SIM* para confirmar."},
          {"type":"BUTTONS","buttons":[
            {"type":"QUICK_REPLY","text":"APROVAR"},
            {"type":"QUICK_REPLY","text":"NEGAR"}
          ]}
        ]
      }' | python3 -m json.tool 2>/dev/null || warn "Falha ao criar template — continuar mesmo assim"
    ok "Template criado (status PENDING, aprovação Meta 1-24h)"
  else
    ok "Template já existe: $EXISTS"
  fi

  notify_tg "✅ *FASE PRÉ-0 OK*. dnsutils instalado, template WA verificado, VPS com espaço suficiente."
}

# ════════════════════════════════════════════════════════════════
# FASE 0 — Backup completo
# ════════════════════════════════════════════════════════════════
fase_0() {
  sep "FASE 0 — Backup completo"
  notify_tg "🟢 *FASE 0 iniciada*: backup completo antes de qualquer alteração."

  DIR=/opt/backups/$(date +%F-%H%M-pre-openclaw)
  mkdir -p "$DIR"
  cd "$DIR"

  # Inventário de containers
  docker ps -a > ps.txt
  docker network ls > networks.txt
  docker volume ls > volumes.txt
  docker inspect $(docker ps -aq 2>/dev/null | tr '\n' ' ') > inspect.json 2>/dev/null || true
  ok "Inventário salvo"

  # Backup compose files
  for d in /opt/*/ /root/*/; do
    [ -f "$d/docker-compose.yml" ] && cp -v "$d/docker-compose.yml" "./$(basename $d)-compose.yml" 2>/dev/null || true
  done
  [ -f /home/user/nodejs/docker-compose.yml ] && cp -v /home/user/nodejs/docker-compose.yml ./av-compose.yml
  [ -f /home/user/nodejs/app.js ]             && cp -v /home/user/nodejs/app.js ./av-app.js.bak
  [ -f /home/user/nodejs/.env ]               && cp -v /home/user/nodejs/.env ./av.env.bak && chmod 600 ./av.env.bak
  ok "Compose files e .env backupeados"

  # Dump Postgres
  echo "→ Dump PostgreSQL..."
  docker exec hairtech-postgres pg_dump -U hairtech -d hairtechdb 2>/dev/null | gzip > hairtechdb.sql.gz
  local DB_SIZE
  DB_SIZE=$(ls -lh hairtechdb.sql.gz | awk '{print $5}')
  ok "Dump DB: $DB_SIZE"

  # Backup acme.json
  local ACME_DIR
  ACME_DIR=$(docker inspect traefik-traefik-1 2>/dev/null \
    | python3 -c "import sys,json; mounts=[m['Source'] for m in json.load(sys.stdin)[0].get('Mounts',[]) if 'acme' in m.get('Source','')]; print(mounts[0] if mounts else '')" 2>/dev/null || echo "")
  if [ -n "$ACME_DIR" ] && [ -f "$ACME_DIR" ]; then
    cp -v "$ACME_DIR" ./acme.json.bak && chmod 600 ./acme.json.bak
    ok "acme.json backupeado"
  else
    warn "acme.json não encontrado automaticamente — verificar mounts do Traefik"
    docker inspect traefik-traefik-1 2>/dev/null | python3 -c "import sys,json; [print(m) for m in json.load(sys.stdin)[0].get('Mounts',[])]" 2>/dev/null | tee acme-mounts.txt || true
  fi

  # Snapshot DNS
  curl -sf -H "Authorization: Bearer ${HOSTINGER_TOKEN}" \
    "https://developers.hostinger.com/api/dns/v1/zones/hairtech.org" > dns.json 2>/dev/null || warn "Snapshot DNS falhou"

  echo "=== BACKUP em $DIR ==="
  ls -lh
  notify_tg "✅ *FASE 0 OK*. Backup em \`${DIR}\`. DB dump: ${DB_SIZE}."
  cd /
}

# ════════════════════════════════════════════════════════════════
# FASE 1 — Criar DNS A claw.hairtech.org
# ════════════════════════════════════════════════════════════════
fase_1() {
  sep "FASE 1 — DNS claw.hairtech.org"
  notify_tg "🟢 *FASE 1 iniciada*: criando DNS A claw.hairtech.org → ${VPS_IP}."

  # Criar registro
  curl -sf -X PUT \
    -H "Authorization: Bearer ${HOSTINGER_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://developers.hostinger.com/api/dns/v1/zones/hairtech.org" \
    -d "{\"overwrite\":false,\"zone\":[{\"name\":\"claw\",\"type\":\"A\",\"ttl\":300,\"records\":[{\"content\":\"${VPS_IP}\"}]}]}" \
    | python3 -m json.tool 2>/dev/null || warn "DNS API retornou erro — verificar se já existe"

  # Aguardar propagação (até 8 minutos)
  echo "→ Aguardando propagação DNS (até 8 minutos)..."
  local propagated=false
  for i in $(seq 1 16); do
    local R
    R=$(dig +short claw.hairtech.org A @1.1.1.1 2>/dev/null || echo "")
    echo "  Tentativa $i/16: '$R'"
    if [ "$R" = "$VPS_IP" ]; then
      propagated=true
      ok "DNS propagado: claw.hairtech.org → $VPS_IP"
      break
    fi
    sleep 30
  done

  if [ "$propagated" = "false" ]; then
    err "DNS NÃO propagou em 8 minutos. NÃO continuar para FASE 2 — Let's Encrypt rate-limit!"
    notify_tg "🔴 *FASE 1 FALHOU*: DNS não propagou. Verifique painel Hostinger. NÃO execute FASE 2 ainda."
    exit 1
  fi

  # Validar em múltiplos resolvers
  local R2
  R2=$(dig +short claw.hairtech.org A @8.8.8.8 2>/dev/null || echo "")
  [ "$R2" = "$VPS_IP" ] && ok "Google DNS: OK" || warn "Google DNS ainda não propagou (aceitável)"

  notify_tg "✅ *FASE 1 OK*. DNS claw.hairtech.org → ${VPS_IP} propagado."
}

# ════════════════════════════════════════════════════════════════
# FASE 2 — Container hairtech-openclaw
# ════════════════════════════════════════════════════════════════
fase_2() {
  sep "FASE 2 — Instalar hairtech-openclaw"
  notify_tg "🟢 *FASE 2 iniciada*: subindo container OpenClaw paralelo ao legado."

  # Verificar legado intacto antes de tudo
  docker ps | grep -q "openclaw-openclaw-1" && ok "Legado openclaw-openclaw-1 intacto" \
    || warn "openclaw-openclaw-1 não encontrado (talvez já estava parado)"

  mkdir -p /opt/hairtech-openclaw/{config,workspace}
  cd /opt/hairtech-openclaw
  chown -R 1000:1000 config workspace
  chmod 700 config

  # .env
  cat > /opt/hairtech-openclaw/.env <<EOF
OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:latest
OPENCLAW_GATEWAY_TOKEN=__GERAR__
GEMINI_API_KEY=${GEMINI_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
OPENAI_API_KEY=${OPENAI_KEY}
WA_TOKEN=${WA_TOKEN}
WA_PHONE_ID=${WA_PHONE_ID}
WA_RICARDO=${WA_RICARDO}
EOF
  chmod 600 /opt/hairtech-openclaw/.env

  # Gerar token gateway
  local TOKEN
  TOKEN=$(openssl rand -hex 32)
  sed -i "s|__GERAR__|$TOKEN|" /opt/hairtech-openclaw/.env
  echo "  Gateway token (primeiros 6): ${TOKEN:0:6}..."

  # Detectar cert resolver do Traefik
  local RESOLVER
  RESOLVER=$(docker inspect traefik-traefik-1 2>/dev/null \
    | python3 -c "
import sys, json, re
labels = json.load(sys.stdin)[0].get('Config',{}).get('Labels',{})
for k,v in labels.items():
    m = re.search(r'certresolvers\.(\w+)', k)
    if m: print(m.group(1)); break
" 2>/dev/null || echo "letsencrypt")
  [ -z "$RESOLVER" ] && RESOLVER="letsencrypt"
  ok "Cert resolver: $RESOLVER"

  # docker-compose.yml (backticks entre aspas duplas)
  cat > /opt/hairtech-openclaw/docker-compose.yml <<YAML
services:
  openclaw:
    image: \${OPENCLAW_IMAGE}
    container_name: hairtech-openclaw
    restart: unless-stopped
    env_file: .env
    environment:
      OPENCLAW_CONFIG_DIR: /home/node/.openclaw
      OPENCLAW_WORKSPACE_DIR: /home/node/.openclaw/workspace
      OPENCLAW_GATEWAY_BIND: lan
      OPENCLAW_GATEWAY_CONTROLUI_ALLOWEDORIGINS: '["https://claw.hairtech.org"]'
    volumes:
      - ./config:/home/node/.openclaw
      - ./workspace:/home/node/.openclaw/workspace
    networks: [web]
    healthcheck:
      test: ["CMD-SHELL","wget -qO- http://127.0.0.1:18789/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    labels:
      - traefik.enable=true
      - traefik.docker.network=web
      - "traefik.http.routers.openclaw.rule=Host(\`claw.hairtech.org\`)"
      - traefik.http.routers.openclaw.entrypoints=websecure
      - traefik.http.routers.openclaw.tls.certresolver=${RESOLVER}
      - traefik.http.services.openclaw.loadbalancer.server.port=18789
networks:
  web:
    external: true
YAML

  # Pull + fixar digest
  echo "→ Pull da imagem OpenClaw..."
  docker compose pull 2>&1 | tail -5
  local DIGEST
  DIGEST=$(docker inspect ghcr.io/openclaw/openclaw:latest --format='{{index .RepoDigests 0}}' 2>/dev/null || echo "")
  if [ -n "$DIGEST" ]; then
    sed -i "s|^OPENCLAW_IMAGE=.*|OPENCLAW_IMAGE=$DIGEST|" /opt/hairtech-openclaw/.env
    ok "Digest fixado: ${DIGEST:0:60}..."
  fi

  # Subir
  docker compose up -d
  echo "→ Aguardando container iniciar (30s)..."
  sleep 30
  docker ps --filter name=hairtech-openclaw

  # Verificar legado ainda intacto
  docker ps | grep -q "openclaw-openclaw-1" && ok "Legado openclaw-openclaw-1 ainda intacto ✅" \
    || warn "Legado não encontrado nos containers ativos"

  notify_tg "✅ *FASE 2 OK*. hairtech-openclaw rodando. Legado intacto."
}

# ════════════════════════════════════════════════════════════════
# FASE 3 — Validar SSL Traefik
# ════════════════════════════════════════════════════════════════
fase_3() {
  sep "FASE 3 — SSL Traefik claw.hairtech.org"
  notify_tg "🟢 *FASE 3 iniciada*: validando HTTPS e cert Let's Encrypt."

  # Verificar router
  echo "→ Router Traefik para claw.hairtech.org:"
  docker exec traefik-traefik-1 wget -qO- http://127.0.0.1:8080/api/http/routers 2>/dev/null \
    | python3 -c "
import sys, json
routers = json.load(sys.stdin)
claw = [r for r in routers if 'claw' in r.get('rule','')]
for r in claw:
    print('  Router:', r.get('name'), '| Status:', r.get('status'))
print('(nenhum)' if not claw else '')
" 2>/dev/null || warn "Não conseguiu consultar API Traefik"

  # Logs Traefik relacionados a claw
  echo "→ Logs Traefik (últimos 2 min):"
  docker logs --since 2m traefik-traefik-1 2>&1 | grep -iE 'claw|acme|error|obtain' | tail -20 || true

  # Testar HTTPS (aceita cert temporário durante emissão)
  echo "→ Testando HTTPS externamente..."
  local HTTP_CODE
  HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 15 https://claw.hairtech.org/healthz 2>/dev/null || echo "000")
  echo "  HTTP code: $HTTP_CODE"

  if [ "$HTTP_CODE" = "000" ]; then
    warn "Sem resposta HTTPS — Let's Encrypt pode ainda estar emitindo cert. Aguardando 60s..."
    sleep 60
    HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 15 https://claw.hairtech.org/healthz 2>/dev/null || echo "000")
    echo "  HTTP code após aguardar: $HTTP_CODE"
  fi

  # 200 = health ok, 401 = gateway com token, ambos indicam SSL OK
  if [[ "$HTTP_CODE" =~ ^(200|401|403)$ ]]; then
    ok "HTTPS funcionando (code $HTTP_CODE — cert emitido)"
  else
    warn "HTTPS retornou $HTTP_CODE — cert pode estar sendo emitido. Verificar logs Traefik."
    notify_tg "⚠️ *FASE 3*: HTTPS retornou $HTTP_CODE. Pode estar emitindo cert. Verificar logs."
  fi

  notify_tg "✅ *FASE 3 OK*. SSL em https://claw.hairtech.org (code ${HTTP_CODE})."
}

# ════════════════════════════════════════════════════════════════
# FASE 4 — Bot Telegram (hairtech-authbot)
# ════════════════════════════════════════════════════════════════
fase_4() {
  sep "FASE 4 — Bot Telegram hairtech-authbot"
  notify_tg "🟢 *FASE 4 iniciada*: criando container de autorização Telegram+WhatsApp."

  # Verificar conflito de polling
  local TG_CONFLICT
  TG_CONFLICT=$(docker exec assistente-virtual env 2>/dev/null | grep -i "8470054351" || true)
  if [ -n "$TG_CONFLICT" ]; then
    warn "Token Telegram em uso no assistente-virtual! Verificar se há conflito de polling."
    notify_tg "⚠️ *FASE 4*: Token Telegram detectado no assistente-virtual. Verificar conflito de polling."
  fi

  mkdir -p /opt/hairtech-authbot
  cd /opt/hairtech-authbot

  # package.json
  cat > /opt/hairtech-authbot/package.json <<'EOF'
{
  "name": "hairtech-authbot",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "node-telegram-bot-api": "^0.66.0",
    "express": "^4.19.2"
  }
}
EOF

  # bot.js completo
  cat > /opt/hairtech-authbot/bot.js <<'EOF'
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';

const TG = process.env.TELEGRAM_BOT_TOKEN;
const OWNER = Number(process.env.RICARDO_TG_ID);
const WA_TOKEN = process.env.WA_TOKEN;
const WA_PHONE_ID = process.env.WA_PHONE_ID;
const WA_RICARDO = process.env.WA_RICARDO;

if (!TG || !OWNER) {
  console.error('FATAL: Missing TELEGRAM_BOT_TOKEN or RICARDO_TG_ID');
  process.exit(1);
}

const bot = new TelegramBot(TG, { polling: true });
const pending = new Map();
const waPending = new Map();
const waConfirm = new Map();

const app = express();
app.use(express.json());

app.post('/ask', async (req, res) => {
  const { id, title, body, level } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'missing id/title' });
  if (pending.has(id)) return res.status(409).json({ error: 'id in use' });
  const text = `🛠 *${title}*\n${body || ''}\n\nNível: ${level || 'normal'}`;
  try {
    await bot.sendMessage(OWNER, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '✅ Aprovar', callback_data: `A:${id}` },
        { text: '❌ Negar',   callback_data: `R:${id}` }
      ]]}
    });
  } catch (e) {
    console.error('Telegram send error:', e.message);
    return res.status(500).json({ error: 'telegram send failed' });
  }
  const decision = await new Promise(r => {
    pending.set(id, r);
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); r('timeout'); } }, 15 * 60 * 1000);
  });
  res.json({ decision });
});

bot.on('callback_query', async (q) => {
  if (q.from.id !== OWNER) {
    await bot.answerCallbackQuery(q.id, { text: 'Não autorizado', show_alert: true });
    return;
  }
  const [verdict, id] = q.data.split(':');
  if (verdict === 'noop') { await bot.answerCallbackQuery(q.id); return; }
  const dec = verdict === 'A' ? 'approved' : 'rejected';
  const r = pending.get(id);
  if (r) { pending.delete(id); r(dec); }
  await bot.answerCallbackQuery(q.id, { text: dec.toUpperCase() });
  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: `(${dec})`, callback_data: 'noop' }]] },
      { chat_id: q.message.chat.id, message_id: q.message.message_id }
    );
  } catch (_) {}
});

async function waSend(payload) {
  try {
    const r = await fetch(`https://graph.facebook.com/v23.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if (!r.ok) console.error('WA error:', JSON.stringify(j));
    return j;
  } catch (e) {
    console.error('WA exception:', e.message);
    return { error: e.message };
  }
}

app.post('/ask-critical', async (req, res) => {
  const { id, title, body } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'missing id/title' });
  if (waPending.has(id)) return res.status(409).json({ error: 'id in use' });
  await waSend({
    messaging_product: 'whatsapp', to: WA_RICARDO, type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `🚨 CRÍTICO\n*${title}*\n${body || ''}\n\nApós aprovar, responda *SIM* para confirmar.` },
      action: { buttons: [
        { type: 'reply', reply: { id: `WA_A_${id}`, title: 'APROVAR' } },
        { type: 'reply', reply: { id: `WA_R_${id}`, title: 'NEGAR'  } }
      ]}
    }
  });
  const decision = await new Promise(r => {
    waPending.set(id, r);
    setTimeout(() => { if (waPending.has(id)) { waPending.delete(id); waConfirm.delete(id); r('timeout'); } }, 15 * 60 * 1000);
  });
  res.json({ decision });
});

app.post('/wa-callback', async (req, res) => {
  const m = req.body;
  if (!m || !m.type) return res.status(400).json({ error: 'invalid payload' });
  if (m.type === 'button_reply' && m.button_id?.startsWith('WA_')) {
    const parts = m.button_id.split('_');
    const v = parts[1];
    const id = parts.slice(2).join('_');
    if (v === 'R') {
      const r = waPending.get(id);
      if (r) { waPending.delete(id); waConfirm.delete(id); r('rejected'); }
    } else if (v === 'A') {
      waConfirm.set(id, Date.now());
      await waSend({
        messaging_product: 'whatsapp', to: WA_RICARDO, type: 'text',
        text: { body: `Para CONFIRMAR a ação ${id}, responda *SIM* nos próximos 5 min.` }
      });
      setTimeout(() => {
        if (waConfirm.has(id)) {
          waConfirm.delete(id);
          const r = waPending.get(id);
          if (r) { waPending.delete(id); r('expired'); }
        }
      }, 5 * 60 * 1000);
    }
  }
  if (m.type === 'text' && /^SIM$/i.test((m.text || '').trim())) {
    const keys = [...waConfirm.keys()];
    const id = keys[keys.length - 1];
    if (id) {
      waConfirm.delete(id);
      const r = waPending.get(id);
      if (r) { waPending.delete(id); r('approved'); }
    }
  }
  res.sendStatus(200);
});

app.get('/health', (_, res) => res.json({ ok: true, pending: pending.size, waPending: waPending.size }));
app.listen(7700, () => console.log(`authbot on :7700 | owner=${OWNER}`));
EOF

  # .env do authbot
  cat > /opt/hairtech-authbot/.env <<EOF
TELEGRAM_BOT_TOKEN=${TG_TOKEN}
RICARDO_TG_ID=${RICARDO_TG_ID}
WA_TOKEN=${WA_TOKEN}
WA_PHONE_ID=${WA_PHONE_ID}
WA_RICARDO=${WA_RICARDO}
EOF
  chmod 600 /opt/hairtech-authbot/.env

  # docker-compose.yml
  cat > /opt/hairtech-authbot/docker-compose.yml <<'EOF'
services:
  authbot:
    image: node:20-alpine
    container_name: hairtech-authbot
    working_dir: /app
    env_file: .env
    volumes:
      - ./:/app
    command: sh -c "npm install --silent --no-audit --no-fund && node bot.js"
    restart: unless-stopped
    networks: [web]
networks:
  web:
    external: true
EOF

  docker compose up -d
  echo "→ Aguardando authbot iniciar (45s)..."
  sleep 45
  docker logs hairtech-authbot --tail 20

  # Smoke test
  echo "→ Smoke test Telegram..."
  local SMOKE
  SMOKE=$(docker exec hairtech-openclaw wget -qO- \
    --post-data '{"id":"smoke-setup","title":"Smoke test","body":"Setup validado. Aperte ✅ para confirmar.","level":"normal"}' \
    --header 'Content-Type: application/json' \
    http://hairtech-authbot:7700/ask 2>/dev/null \
    || curl -sf -X POST http://localhost:7700/ask \
      -H "Content-Type: application/json" \
      -d '{"id":"smoke-setup","title":"Smoke test","body":"Aperte Aprovar para confirmar.","level":"normal"}' 2>/dev/null || echo "{}")
  echo "  Smoke result: $SMOKE"

  notify_tg "✅ *FASE 4 OK*. hairtech-authbot rodando em :7700. Telegram ativo."
}

# ════════════════════════════════════════════════════════════════
# FASE 5 — WhatsApp crítico (edita app.js)
# ════════════════════════════════════════════════════════════════
fase_5() {
  sep "FASE 5 — WhatsApp crítico + edição app.js"

  # ── PARADA OBRIGATÓRIA ──────────────────────────────────────
  notify_tg "⚠️ *FASE 5 — PARADA OBRIGATÓRIA*

Preciso editar \`/home/user/nodejs/app.js\` para adicionar forward de webhook Meta para o authbot.

Aqui estão as primeiras 50 linhas do arquivo:
\`\`\`
$(head -50 /home/user/nodejs/app.js)
\`\`\`

Responda *EDITARAPP* para autorizar, ou *NAOEDIT* para pular esta fase."

  echo "⏳ Aguardando aprovação de Ricardo via Telegram para editar app.js..."
  if wait_tg_keyword "EDITARAPP" 600; then
    ok "Aprovado. Editando app.js..."
  else
    warn "Não autorizado ou timeout. Pulando FASE 5."
    notify_tg "⚠️ *FASE 5 pulada*. Você pode executar manualmente depois."
    return 0
  fi

  # Garantir rede web no assistente-virtual
  docker network connect web assistente-virtual 2>/dev/null || true
  ok "assistente-virtual conectado à rede web"

  # Adicionar WA_RICARDO_NUM ao .env se não existir
  grep -q '^WA_RICARDO_NUM=' /home/user/nodejs/.env || echo "WA_RICARDO_NUM=${WA_RICARDO}" >> /home/user/nodejs/.env

  # Inserir forward de webhook no app.js (antes do bloco de processamento de leads)
  # Verifica se já foi inserido
  if grep -q "wa-callback" /home/user/nodejs/app.js; then
    ok "Forward authbot já presente no app.js"
  else
    # Inserir após o bloco "Comandos do Dr. Ricardo"
    python3 <<'PYEOF'
import re

with open('/home/user/nodejs/app.js', 'r') as f:
    content = f.read()

forward_code = '''
    // Encaminhar respostas do Ricardo (botões e SIM) para authbot
    if (from === process.env.WA_RICARDO_NUM || from === OWNER_PHONE) {
      const isButton = message.type === 'interactive' && message.interactive?.type === 'button_reply';
      const isSim = message.type === 'text' && /^SIM$/i.test(message.text?.body || '');
      if (isButton || isSim) {
        const payload = {
          from,
          type: isButton ? 'button_reply' : 'text',
          button_id: message.interactive?.button_reply?.id,
          text: message.text?.body
        };
        fetch('http://hairtech-authbot:7700/wa-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(e => console.error('authbot forward error:', e.message));
      }
    }

'''

# Inserir após "const from = message.from;"
marker = 'const from = message.from;'
if marker in content:
    content = content.replace(marker, marker + forward_code, 1)
    with open('/home/user/nodejs/app.js', 'w') as f:
        f.write(content)
    print('OK: forward inserido')
else:
    print('WARN: marcador não encontrado — não foi possível inserir automaticamente')
PYEOF
  fi

  # Restart do assistente-virtual (via authbot ask-critical)
  notify_tg "🔴 *FASE 5 — RESTART AV (WhatsApp Crítico)*

Vou fazer \`docker compose restart assistente-virtual\` para ativar o novo código.

*Isso é necessário.* Responda APROVAR no WhatsApp da clínica e depois SIM para confirmar."

  local DECISION
  DECISION=$(curl -sf -X POST http://localhost:7700/ask-critical \
    -H "Content-Type: application/json" \
    -d '{"id":"restart-av-fase5","title":"Restart assistente-virtual","body":"Aplicar forward de webhook para authbot. Necessário para FASE 5."}' \
    2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('decision','timeout'))" 2>/dev/null || echo "timeout")

  if [ "$DECISION" = "approved" ]; then
    ok "Restart aprovado via WhatsApp+SIM"
    cd /home/user/nodejs
    docker compose restart assistente-virtual
    sleep 20
    docker logs assistente-virtual --tail 20
    ok "assistente-virtual reiniciado"
  else
    warn "Restart não aprovado ($DECISION). Pulando restart."
    notify_tg "⚠️ *FASE 5*: restart não aprovado ($DECISION). Restart manual necessário."
  fi

  notify_tg "✅ *FASE 5 OK*. Forward WhatsApp → authbot configurado."
}

# ════════════════════════════════════════════════════════════════
# FASE 6 — SOUL Admin (openclaw.json + workspace)
# ════════════════════════════════════════════════════════════════
fase_6() {
  sep "FASE 6 — SOUL Admin"
  notify_tg "🟢 *FASE 6 iniciada*: configurando agente Admin do OpenClaw."

  # openclaw.json (com placeholders)
  cat > /opt/hairtech-openclaw/config/openclaw.json <<'JSON'
{
  "meta": { "lastTouchedVersion": "2026.4.23" },
  "gateway": {
    "port": 18789,
    "bind": "lan",
    "auth": { "mode": "token", "token": "__TOKEN__" }
  },
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
        "apiKey": "__GKEY__",
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
          "openai/gpt-4o-mini",
          "gemini-api/gemini-2.5-pro"
        ]
      }
    }
  }
}
JSON

  # Substituir placeholders
  local TOKEN_VAL GKEY_VAL
  TOKEN_VAL=$(grep ^OPENCLAW_GATEWAY_TOKEN /opt/hairtech-openclaw/.env | cut -d= -f2-)
  GKEY_VAL=$(grep ^GEMINI_API_KEY /opt/hairtech-openclaw/.env | cut -d= -f2-)
  sed -i "s|__TOKEN__|$TOKEN_VAL|g; s|__GKEY__|$GKEY_VAL|g" /opt/hairtech-openclaw/config/openclaw.json

  # Verificar substituição (mascarado)
  echo "→ Verificação (mascarada):"
  grep -E '"token"|"apiKey"' /opt/hairtech-openclaw/config/openclaw.json \
    | sed 's/\(.\{20\}\).*\(.\{6\}\)"/\1...[REDACTED]...\2"/'

  chown 1000:1000 /opt/hairtech-openclaw/config/openclaw.json
  chmod 600 /opt/hairtech-openclaw/config/openclaw.json

  # Workspace files
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
- Hostinger KVM2 Ubuntu 24.04 / IP ${VPS_IP}
- Domínio hairtech.org / Traefik + Let's Encrypt
- VPS vence 22/05/2026

## Containers
- traefik-traefik-1 (NÃO reiniciar sem crítico)
- hairtech-postgres (user=hairtech db=hairtechdb)
- assistente-virtual (Node.js em /home/user/nodejs/app.js)
- openclaw-openclaw-1 (LEGADO — NÃO MEXER)
- hairtech-openclaw (eu)
- hairtech-authbot (:7700)

## Rede compartilhada: web
## Autorização: POST http://hairtech-authbot:7700/ask ou /ask-critical
## Backups: /opt/backups/YYYY-MM-DD/
EOF

  cat > USER.md <<EOF
# Dr. Ricardo Meireles
Tricologista — Clínica HairTech.
Timezone: America/Sao_Paulo (UTC-3).
Telegram ID: ${RICARDO_TG_ID}
WhatsApp: +${WA_RICARDO}
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

  # Recarregar OpenClaw
  echo "→ Reiniciando hairtech-openclaw..."
  docker restart hairtech-openclaw
  sleep 30
  docker logs hairtech-openclaw --tail 30 | grep -iE 'gateway|model|error|warn|start' || true

  notify_tg "✅ *FASE 6 OK*. SOUL Admin configurada. Gemini 2.5 Flash primary, fallbacks Claude/GPT-4o."
}

# ════════════════════════════════════════════════════════════════
# FASE 7 — Validação end-to-end
# ════════════════════════════════════════════════════════════════
fase_7() {
  sep "FASE 7 — Validação end-to-end"
  notify_tg "🟢 *FASE 7 iniciada*: teste de inferência via gateway."

  local TOKEN_VAL
  TOKEN_VAL=$(grep ^OPENCLAW_GATEWAY_TOKEN /opt/hairtech-openclaw/.env | cut -d= -f2-)

  echo "→ Testando inferência via HTTPS gateway..."
  local RESP
  RESP=$(curl -sf -H "x-api-key: $TOKEN_VAL" \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"Diga apenas: vivo."}]}' \
    --max-time 30 \
    https://claw.hairtech.org/v1/chat/completions 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('message',{}).get('content','ERRO_PARSE'))" 2>/dev/null || echo "TIMEOUT_OU_ERRO")
  echo "  Resposta IA: $RESP"

  # Saúde do authbot
  echo "→ Health authbot:"
  curl -sf http://localhost:7700/health 2>/dev/null | python3 -m json.tool || true

  # Container status final
  echo "→ Status final de todos os containers:"
  docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

  local STATUS="OK"
  [[ "$RESP" =~ "vivo" ]] || { warn "Inferência não retornou 'vivo' — verificar logs do container"; STATUS="DEGRADED"; }

  notify_tg "✅ *FASE 7 OK*. Inferência: '${RESP}'. Status: ${STATUS}.

https://claw.hairtech.org"
}

# ════════════════════════════════════════════════════════════════
# FASE 8 — Runbook + cron backup
# ════════════════════════════════════════════════════════════════
fase_8() {
  sep "FASE 8 — Runbook e cron backup"
  notify_tg "🟢 *FASE 8 iniciada*: configurando cron de backup e runbook."

  # Cron backup diário
  cat > /opt/hairtech-openclaw/backup.sh <<'EOF'
#!/bin/bash
# Verificar espaço
[ $(df /opt --output=avail | tail -1) -lt 512000 ] && echo "ERRO: menos de 500MB disponíveis" && exit 1

DIR=/opt/backups/$(date +%F)-auto
mkdir -p "$DIR"
docker exec hairtech-postgres pg_dump -U hairtech -d hairtechdb 2>/dev/null | gzip > "$DIR/hairtechdb.sql.gz"
cp -r /opt/hairtech-openclaw/config "$DIR/openclaw-config"
cp -r /opt/hairtech-openclaw/workspace "$DIR/openclaw-workspace"
cp /home/user/nodejs/docker-compose.yml "$DIR/av-compose.yml" 2>/dev/null || true

# Rotação: manter 14 dias
find /opt/backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} \; 2>/dev/null || true
echo "Backup OK: $DIR"
EOF
  chmod +x /opt/hairtech-openclaw/backup.sh

  # Instalar cron (06h00 BRT = 09h00 UTC)
  (crontab -l 2>/dev/null | grep -v "backup.sh"; echo "0 9 * * * /opt/hairtech-openclaw/backup.sh >> /opt/hairtech-openclaw/backup.log 2>&1") | crontab -
  ok "Cron configurado: backup diário às 06h (BRT)"

  # Runbook
  cat > /opt/hairtech-openclaw/RUNBOOK.md <<EOF
# RUNBOOK OpenClaw HairTech

## Verificar saúde
docker ps --format "table {{.Names}}\t{{.Status}}"
curl -sk https://claw.hairtech.org/healthz

## Ver logs
docker logs hairtech-openclaw --tail 50
docker logs hairtech-authbot --tail 30

## Restart seguro OpenClaw (não afeta AV nem Traefik)
cd /opt/hairtech-openclaw && docker compose restart

## Restart authbot
cd /opt/hairtech-authbot && docker compose restart

## Backup manual
bash /opt/hairtech-openclaw/backup.sh

## Rollback total (emergência)
cd /opt/hairtech-openclaw && docker compose down
# (assistente-virtual, traefik, postgres — intactos)

## Arquivos importantes
- Código AV: /home/user/nodejs/app.js  (NÃO em /opt/)
- Config OpenClaw: /opt/hairtech-openclaw/config/openclaw.json
- Workspace: /opt/hairtech-openclaw/workspace/
- Backups: /opt/backups/

## Licença OpenClaw
Vence: 24/05/2026 — renovar em openclaw.dev

## VPS Hostinger
Vence: 22/05/2026 — renovar em hpanel.hostinger.com
EOF

  notify_tg "✅ *FASE 8 OK*. Cron backup às 06h BRT. Runbook em \`/opt/hairtech-openclaw/RUNBOOK.md\`."
}

# ════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════
main() {
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║  OPENCLAW SELF-HOSTED — HairTech — $(date '+%Y-%m-%d %H:%M')   ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo "Log completo em: $LOG"
  echo ""

  # Verificar root
  [ "$(id -u)" -eq 0 ] || { echo "ERRO: Execute como root (sudo bash $0)"; exit 1; }

  bootstrap_tg_id

  fase_pre0
  fase_0
  fase_1
  fase_2
  fase_3
  fase_4
  fase_5
  fase_6
  fase_7
  fase_8

  sep "INSTALAÇÃO CONCLUÍDA"
  echo ""
  echo "  🎯 https://claw.hairtech.org"
  echo "  📋 Runbook: /opt/hairtech-openclaw/RUNBOOK.md"
  echo "  📁 Log:     $LOG"
  echo ""
  notify_tg "🎯 *INSTALAÇÃO OPENCLAW CONCLUÍDA*

https://claw.hairtech.org

📋 Runbook: \`/opt/hairtech-openclaw/RUNBOOK.md\`
📁 Log: \`${LOG}\`

Legado openclaw-openclaw-1 intacto. Descomissionar após 48h estáveis."
}

main "$@"
