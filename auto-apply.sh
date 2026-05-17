#!/bin/bash
# auto-apply.sh v8 — Round 10 (17/05/2026)
#
# Briefing consolidado: passos 1-3 + CFM compliance + audit log + healthcheck +
# Postgres migrations + marker files para ativacoes deferidas.
#
# v8 adiciona: T15 (backup pre-deploy), T16 (healthcheck install + Telegram alert),
#              T17 (Postgres migrations via docker exec), T18 (ALLOW_RESTART.flag),
#              T19 (ANTHROPIC_READY.flag), T20 (FOCUSNFE_TOKEN validacao)

set +e

LOG=/var/log/hairtech-autodeploy.log
exec >> "$LOG" 2>&1

REV=$(git rev-parse --short HEAD 2>/dev/null)
echo ""
echo "============================================================"
echo "[$(date -Iseconds)] auto-apply.sh START rev=$REV v8 (Round 10: backup + healthcheck + migrations + markers)"
echo "============================================================"

# ---------------------------------------------------------------
# T-1: Cron robusto (mantido v6+)
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
# T0: Watchdog AV removido (mantido v5+)
# ---------------------------------------------------------------
WATCHDOG=/etc/cron.d/hairtech-av-watchdog
[ -f "$WATCHDOG" ] && { rm -f "$WATCHDOG"; systemctl restart cron 2>/dev/null; echo "[T0] Watchdog removido"; } || echo "[T0] Watchdog ausente"

# ---------------------------------------------------------------
# T1-T7: Diagnostico READ-ONLY (mantido v6+)
# ---------------------------------------------------------------
T_STATUS=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null || echo "missing")
echo "[T1] Traefik: $T_STATUS"

echo "[T2] Network check:"
for C in openai-proxy assistente-virtual hairtech-openclaw whatsapp-inbox dashboard-frontend whatsapp-ana; do
  STATE=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  ON_WEB=$(docker inspect "$C" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -c '^web$')
  echo "[T2]   $C state=$STATE on_web=$ON_WEB"
done

# T2b agora respeita marker ALLOW_RESTART.flag (T18 abaixo)
echo "[T2b] gated por T18 (ALLOW_RESTART.flag)"

echo "[T6] Containers:"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>&1 | sed 's/^/[T6] /'

echo "[T7] Backups manuais:"
ls -la /home/user/nodejs/*.bak-* 2>/dev/null | sed 's/^/[T7] /'

# ---------------------------------------------------------------
# T8: Install Claude Code (mantido v7)
# ---------------------------------------------------------------
if ! command -v claude &>/dev/null; then
  echo "[T8] Install Claude Code..."
  npm install -g @anthropic-ai/claude-code 2>&1 | tail -3 | sed 's/^/[T8]   /'
else
  echo "[T8] Claude Code ja instalado: $(claude --version 2>&1 | head -1)"
fi

# ---------------------------------------------------------------
# T9: OpenClaw diagnostic (mantido v7)
# ---------------------------------------------------------------
echo "[T9] OpenClaw diagnostic:"
OPENCLAW_IP=$(docker inspect hairtech-openclaw --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | awk '{print $1}')
if [ -n "$OPENCLAW_IP" ]; then
  H1=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://$OPENCLAW_IP:18789/" 2>/dev/null || echo "000")
  echo "[T9]   IP=$OPENCLAW_IP :18789/ -> $H1"
fi

# ---------------------------------------------------------------
# T15 (NOVO Round 10): Backup pre-deploy idempotente
# ---------------------------------------------------------------
echo "[T15] Backup pre-deploy:"
BACKUP_DIR=/opt/backup
mkdir -p "$BACKUP_DIR"

# Tag git (idempotente — so cria se nao existe)
cd /home/user/nodejs
TAG_NAME="pre-execucao-$(date +%Y%m%d)"
if ! git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
  git tag "$TAG_NAME" 2>&1 | sed 's/^/[T15]   /'
  echo "[T15]   tag $TAG_NAME criada"
else
  echo "[T15]   tag $TAG_NAME ja existe"
fi

# Backup .env (mantem 7 dias)
ENV_BAK="/home/user/nodejs/.env.bak-$(date +%Y%m%d)"
if [ ! -f "$ENV_BAK" ] && [ -f /home/user/nodejs/.env ]; then
  cp /home/user/nodejs/.env "$ENV_BAK" && chmod 600 "$ENV_BAK"
  echo "[T15]   .env backup -> $ENV_BAK"
fi

# Postgres dump (so se mudou desde ultimo dump)
PG_BAK="$BACKUP_DIR/pg-$(date +%Y%m%d).sql"
if [ ! -f "$PG_BAK" ]; then
  docker exec hairtech-postgres pg_dump -U hairtech hairtechdb > "$PG_BAK" 2>/dev/null
  PG_SIZE=$(stat -c%s "$PG_BAK" 2>/dev/null || echo 0)
  if [ "$PG_SIZE" -gt 100 ]; then
    chmod 600 "$PG_BAK"
    echo "[T15]   pg_dump -> $PG_BAK ($PG_SIZE bytes)"
  else
    rm -f "$PG_BAK"
    echo "[T15]   pg_dump FALHOU (size=$PG_SIZE)"
  fi
fi

# Retencao: deleta backups com mais de 7 dias
find "$BACKUP_DIR" -name "pg-*.sql" -mtime +7 -delete 2>/dev/null
find /home/user/nodejs -maxdepth 1 -name ".env.bak-*" -mtime +7 -delete 2>/dev/null

# ---------------------------------------------------------------
# T16 (NOVO Round 10): Install healthcheck + cron */5min
# ---------------------------------------------------------------
echo "[T16] Healthcheck install:"
HC_DIR=/opt/healthcheck
HC_SCRIPT="$HC_DIR/check.sh"
HC_CRON=/etc/cron.d/hairtech-healthcheck

mkdir -p "$HC_DIR"
if [ -f /home/user/nodejs/scripts/healthcheck.sh ]; then
  cp /home/user/nodejs/scripts/healthcheck.sh "$HC_SCRIPT"
  chmod 755 "$HC_SCRIPT"
  echo "[T16]   $HC_SCRIPT instalado"
else
  echo "[T16]   /home/user/nodejs/scripts/healthcheck.sh ausente"
fi

if [ ! -f "$HC_CRON" ]; then
  cat > "$HC_CRON" <<'HCEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root flock -n /var/run/hairtech-healthcheck.lock /opt/healthcheck/check.sh > /dev/null 2>&1
HCEOF
  chmod 644 "$HC_CRON"
  systemctl restart cron 2>/dev/null
  echo "[T16]   cron */5min instalado"
else
  echo "[T16]   cron ja instalado"
fi

touch /var/log/hairtech-healthcheck.log
chmod 640 /var/log/hairtech-healthcheck.log

# ---------------------------------------------------------------
# T17 (NOVO Round 10): Postgres migrations
# Tabelas novas: audit_ai_calls, leads, contratos, pagamentos, notas_fiscais, agendamentos
# Aplicado via docker exec — nao precisa AV rodando
# ---------------------------------------------------------------
echo "[T17] Postgres migrations:"
PG_CHECK=$(docker exec hairtech-postgres psql -U hairtech -d hairtechdb -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('leads','contratos','pagamentos','notas_fiscais','agendamentos','audit_ai_calls') ORDER BY tablename" 2>/dev/null | tr '\n' ',')
echo "[T17]   tabelas atuais: $PG_CHECK"

# Aplica migrations idempotentes via heredoc
docker exec -i hairtech-postgres psql -U hairtech -d hairtechdb 2>&1 <<'SQLEOF' | tail -10 | sed 's/^/[T17]   /'
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS disclosure_enviado BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS disclosure_ts BIGINT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS disclosure_hash TEXT;

CREATE TABLE IF NOT EXISTS audit_ai_calls (
  id BIGSERIAL PRIMARY KEY,
  agente TEXT NOT NULL,
  model TEXT,
  prompt_hash TEXT,
  response_hash TEXT,
  tokens INTEGER DEFAULT 0,
  ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_ai_calls(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_agente ON audit_ai_calls(agente);

CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  wa_id TEXT NOT NULL,
  nome TEXT, cpf TEXT, email TEXT,
  origem TEXT DEFAULT 'whatsapp',
  estagio TEXT DEFAULT 'novo',
  permite_reengajamento BOOLEAN DEFAULT true,
  consentimento_cfm BOOLEAN DEFAULT false,
  consentimento_cfm_ts TIMESTAMPTZ,
  consentimento_cfm_hash TEXT,
  ultimo_contato_at TIMESTAMPTZ DEFAULT NOW(),
  tentativas_reengajamento INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_wa ON leads(wa_id);
CREATE INDEX IF NOT EXISTS idx_leads_estagio ON leads(estagio);
CREATE INDEX IF NOT EXISTS idx_leads_ultimo_contato ON leads(ultimo_contato_at DESC);

CREATE TABLE IF NOT EXISTS contratos (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT REFERENCES leads(id),
  wa_id TEXT NOT NULL,
  provider TEXT DEFAULT 'docusign',
  envelope_id TEXT,
  template_id TEXT,
  tipo TEXT DEFAULT 'fue_padrao',
  valor NUMERIC,
  status TEXT DEFAULT 'criado',
  signer_email TEXT, signer_cpf TEXT, signer_nome TEXT,
  url_assinatura TEXT, assinado_em TIMESTAMPTZ, pdf_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contratos_envelope ON contratos(envelope_id);
CREATE INDEX IF NOT EXISTS idx_contratos_status ON contratos(status);
CREATE INDEX IF NOT EXISTS idx_contratos_wa ON contratos(wa_id);

CREATE TABLE IF NOT EXISTS pagamentos (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT REFERENCES leads(id),
  contrato_id BIGINT REFERENCES contratos(id),
  wa_id TEXT NOT NULL,
  provider TEXT DEFAULT 'infinitepay',
  invoice_slug TEXT, transaction_nsu TEXT UNIQUE,
  valor NUMERIC NOT NULL,
  status TEXT DEFAULT 'pendente',
  link_pagamento TEXT, receipt_url TEXT, pago_em TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pag_nsu ON pagamentos(transaction_nsu);
CREATE INDEX IF NOT EXISTS idx_pag_status ON pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pag_wa ON pagamentos(wa_id);

CREATE TABLE IF NOT EXISTS notas_fiscais (
  id BIGSERIAL PRIMARY KEY,
  pagamento_id BIGINT REFERENCES pagamentos(id),
  wa_id TEXT NOT NULL,
  provider TEXT DEFAULT 'focusnfe',
  ref TEXT, numero_nf TEXT,
  cpf_tomador TEXT, nome_tomador TEXT, valor NUMERIC,
  status TEXT DEFAULT 'pendente',
  pdf_url TEXT, xml_url TEXT, emitida_em TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nf_status ON notas_fiscais(status);
CREATE INDEX IF NOT EXISTS idx_nf_pag ON notas_fiscais(pagamento_id);

CREATE TABLE IF NOT EXISTS agendamentos (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT REFERENCES leads(id),
  wa_id TEXT NOT NULL,
  tipo TEXT DEFAULT 'consulta',
  unidade TEXT,
  data_hora TIMESTAMPTZ NOT NULL,
  duracao_min INTEGER DEFAULT 60,
  status TEXT DEFAULT 'agendado',
  valor NUMERIC,
  apple_event_id TEXT, feegow_id TEXT, observacoes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ag_data ON agendamentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_ag_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_ag_wa ON agendamentos(wa_id);
SQLEOF

# ---------------------------------------------------------------
# T18 (NOVO Round 10): Marker ALLOW_RESTART.flag -> religa containers
# ---------------------------------------------------------------
FLAG_RESTART=/home/user/nodejs/ALLOW_RESTART.flag
if [ -f "$FLAG_RESTART" ]; then
  echo "[T18] ALLOW_RESTART.flag detectado — religando containers"
  for C in assistente-virtual whatsapp-inbox hairtech-operator-bridge; do
    S=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null)
    if [ "$S" != "running" ] && [ -n "$S" ]; then
      echo "[T18]   $C state=$S -> docker start"
      docker start "$C" 2>&1 | sed 's/^/[T18]     /'
    fi
  done
else
  echo "[T18] sem ALLOW_RESTART.flag — AV/INBOX/bridge intencional parados"
fi

# ---------------------------------------------------------------
# T19 (NOVO Round 10): Marker ANTHROPIC_READY.flag -> merge OpenClaw
# ---------------------------------------------------------------
FLAG_ANTHROPIC=/opt/hairtech-openclaw/ANTHROPIC_READY.flag
SNIPPET=/opt/hairtech-openclaw/config/claude-provider-snippet.json
if [ -f "$FLAG_ANTHROPIC" ] && [ -f "$SNIPPET" ]; then
  echo "[T19] ANTHROPIC_READY.flag detectado — preparando merge"
  CFG=/opt/hairtech-openclaw/config/openclaw.json
  if [ -f "$CFG" ] && ! grep -q "anthropic-api" "$CFG"; then
    cp "$CFG" "$CFG.bak-$(date +%Y%m%d_%H%M%S)"
    # Merge usando jq se disponivel, senao loga aviso
    if command -v jq >/dev/null; then
      jq -s '.[0] * .[1]' "$CFG" "$SNIPPET" > /tmp/openclaw-merged.json && \
        mv /tmp/openclaw-merged.json "$CFG" && \
        docker restart hairtech-openclaw && \
        echo "[T19]   anthropic-api mergeado e openclaw restartado"
    else
      echo "[T19]   jq nao instalado — pulando merge automatico"
    fi
  fi
else
  echo "[T19] sem ANTHROPIC_READY.flag ou snippet ausente"
fi

# ---------------------------------------------------------------
# T20 (NOVO Round 10): Validar FOCUSNFE_TOKEN
# ---------------------------------------------------------------
if [ -f /home/user/nodejs/.env ] && grep -q "^FOCUSNFE_TOKEN=" /home/user/nodejs/.env; then
  TOKEN=$(grep "^FOCUSNFE_TOKEN=" /home/user/nodejs/.env | cut -d= -f2-)
  if [ -n "$TOKEN" ]; then
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -u "$TOKEN:" \
      "https://api.focusnfe.com.br/v2/nfse?ref=healthcheck" 2>/dev/null)
    echo "[T20] FocusNFe ping (esperado 400 nfse_invalido): HTTP=$HTTP"
  fi
else
  echo "[T20] FOCUSNFE_TOKEN ausente — modo manual (legacy)"
fi

echo "[$(date -Iseconds)] auto-apply.sh END (v8 Round 10)"
