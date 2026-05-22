#!/bin/bash
# auto-apply.sh v10 - Round 15: auto-arm OpenClaw (17/05/2026)
#
# Manus ativou OpenClaw com provider Anthropic (relatorio 21:56 UTC).
# Esta versao adiciona T22 que copia docs/agents/*/ pra
# /opt/hairtech-openclaw/agents/ quando ANTHROPIC_READY.flag existir.
# OpenClaw carrega agentes ao restart.

set +e

LOG=/var/log/hairtech-autodeploy.log
exec >> "$LOG" 2>&1

REV=$(git rev-parse --short HEAD 2>/dev/null)
echo ""
echo "============================================================"
echo "[$(date -Iseconds)] auto-apply.sh START rev=$REV v10 (Round 15: auto-arm OpenClaw)"
echo "============================================================"

# T-1: Cron robusto (mantido)
CRON=/etc/cron.d/hairtech-autodeploy
if [ -f "$CRON" ] && grep -q "git pull --ff-only" "$CRON"; then
  cat > "$CRON" <<'CRONEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/2 * * * * root cd /home/user/nodejs && git fetch origin claude/hairtech-whatsapp-ai-liD5V --quiet 2>&1 && [ "$(git rev-parse HEAD 2>/dev/null)" != "$(git rev-parse origin/claude/hairtech-whatsapp-ai-liD5V 2>/dev/null)" ] && echo "[$(date -Iseconds)] commit novo, aplicando via reset --hard" >> /var/log/hairtech-autodeploy.log && git reset --hard origin/claude/hairtech-whatsapp-ai-liD5V --quiet >> /var/log/hairtech-autodeploy.log 2>&1 && bash /home/user/nodejs/auto-apply.sh >> /var/log/hairtech-autodeploy.log 2>&1
CRONEOF
  chmod 644 "$CRON"
  systemctl restart cron 2>/dev/null
fi

# T0: Watchdog removido
rm -f /etc/cron.d/hairtech-av-watchdog

# T1-T7: Diagnostico read-only (mantido)
T_STATUS=$(docker inspect traefik-traefik-1 --format '{{.State.Status}}' 2>/dev/null || echo "missing")
echo "[T1] Traefik: $T_STATUS"

echo "[T2] Network check:"
for C in openai-proxy assistente-virtual hairtech-openclaw whatsapp-inbox dashboard-frontend whatsapp-ana; do
  STATE=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  echo "[T2]   $C state=$STATE"
done

echo "[T6] Containers:"
docker ps -a --format 'table {{.Names}}\t{{.Status}}' 2>&1 | sed 's/^/[T6] /'

# T8: Claude Code instalado / instala se faltar
if command -v claude &>/dev/null; then
  echo "[T8] Claude Code ja instalado: $(claude --version 2>&1 | head -1)"
else
  if [ ! -f /opt/.claude-code-installed ] && [ -f /home/user/nodejs/scripts/install-claude-code.sh ]; then
    echo "[T8] Claude Code ausente -> rodando installer (1x)"
    chmod +x /home/user/nodejs/scripts/install-claude-code.sh
    bash /home/user/nodejs/scripts/install-claude-code.sh 2>&1 | tail -3 | sed 's/^/[T8] /'
  else
    echo "[T8] Claude Code ausente (installer ja tentou ou nao encontrado)"
  fi
fi

# T15: Backup pre-deploy
BACKUP_DIR=/opt/backup
mkdir -p "$BACKUP_DIR"
cd /home/user/nodejs
TAG_NAME="pre-execucao-$(date +%Y%m%d)"
git rev-parse "$TAG_NAME" >/dev/null 2>&1 || git tag "$TAG_NAME"
ENV_BAK="/home/user/nodejs/.env.bak-$(date +%Y%m%d)"
[ ! -f "$ENV_BAK" ] && [ -f /home/user/nodejs/.env ] && cp /home/user/nodejs/.env "$ENV_BAK" && chmod 600 "$ENV_BAK"
PG_BAK="$BACKUP_DIR/pg-$(date +%Y%m%d).sql"
[ ! -f "$PG_BAK" ] && docker exec hairtech-postgres pg_dump -U hairtech hairtechdb > "$PG_BAK" 2>/dev/null && chmod 600 "$PG_BAK"
find "$BACKUP_DIR" -name "pg-*.sql" -mtime +7 -delete 2>/dev/null
find /home/user/nodejs -maxdepth 1 -name ".env.bak-*" -mtime +7 -delete 2>/dev/null
echo "[T15] Backup pre-deploy concluido"

# T16: Healthcheck install
HC_DIR=/opt/healthcheck
mkdir -p "$HC_DIR"
[ -f /home/user/nodejs/scripts/healthcheck.sh ] && cp /home/user/nodejs/scripts/healthcheck.sh "$HC_DIR/check.sh" && chmod 755 "$HC_DIR/check.sh"
HC_CRON=/etc/cron.d/hairtech-healthcheck
if [ ! -f "$HC_CRON" ]; then
  cat > "$HC_CRON" <<'HCEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root flock -n /var/run/hairtech-healthcheck.lock /opt/healthcheck/check.sh > /dev/null 2>&1
HCEOF
  chmod 644 "$HC_CRON"
  systemctl restart cron 2>/dev/null
fi
touch /var/log/hairtech-healthcheck.log
chmod 640 /var/log/hairtech-healthcheck.log

# T17: Postgres migrations (idempotentes + fix transaction_nsu)
echo "[T17] Postgres migrations + fix:"
docker exec -i hairtech-postgres psql -U hairtech -d hairtechdb 2>&1 <<'SQLEOF' | tail -5 | sed 's/^/[T17]   /'
-- Fix Round 11 bug: transaction_nsu foi adicionada errado em audit_ai_calls
ALTER TABLE audit_ai_calls DROP COLUMN IF EXISTS transaction_nsu;
-- Garante coluna onde realmente faltava
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS transaction_nsu TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagamentos_transaction_nsu_key') THEN
    ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_transaction_nsu_key UNIQUE (transaction_nsu);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pag_nsu ON pagamentos(transaction_nsu);
-- LGPD: log de acesso ao prontuario (quem acessou o que e quando)
CREATE TABLE IF NOT EXISTS prontuario_access_log (
  id BIGSERIAL PRIMARY KEY,
  wa_id TEXT NOT NULL,
  acessado_em TIMESTAMPTZ DEFAULT NOW(),
  acessado_por TEXT,
  acao TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_pal_wa ON prontuario_access_log(wa_id);
CREATE INDEX IF NOT EXISTS idx_pal_ts ON prontuario_access_log(acessado_em);
SQLEOF

# T18: Marker ALLOW_RESTART.flag
if [ -f /home/user/nodejs/ALLOW_RESTART.flag ]; then
  for C in assistente-virtual whatsapp-inbox hairtech-operator-bridge; do
    S=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null)
    [ "$S" != "running" ] && [ -n "$S" ] && docker start "$C" 2>&1 | sed 's/^/[T18] /'
  done
fi

# T19: Anthropic provider snippet (legacy, Manus fez correto via Python)
echo "[T19] anthropic-api ja mergeado por Manus (relatorio 21:56 UTC)"

# T20: FocusNFe check
grep -q "^FOCUSNFE_TOKEN=" /home/user/nodejs/.env 2>/dev/null && echo "[T20] FOCUSNFE_TOKEN presente" || echo "[T20] FOCUSNFE_TOKEN ausente"

# T23 (Round 15): Auto-arma OpenClaw.
# Se o openclaw.json ja tem o provider anthropic mergeado E ha ANTHROPIC_API_KEY
# disponivel no .env do container, cria o flag ANTHROPIC_READY automaticamente.
# Assim o T22 abaixo sincroniza os 13 agentes e reinicia OpenClaw sem acao manual.
echo "[T23] Auto-arm OpenClaw:"
OC_DIR=/opt/hairtech-openclaw
OC_FLAG=$OC_DIR/ANTHROPIC_READY.flag
OC_CFG=$OC_DIR/openclaw.json
if [ -f "$OC_CFG" ]; then
  if grep -q '"anthropic-api"' "$OC_CFG" 2>/dev/null; then
    HAS_KEY=0
    [ -f "$OC_DIR/.env" ] && grep -q '^ANTHROPIC_API_KEY=..' "$OC_DIR/.env" && HAS_KEY=1
    if [ "$HAS_KEY" = "0" ]; then
      docker inspect hairtech-openclaw --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
        | grep -q '^ANTHROPIC_API_KEY=..' && HAS_KEY=1
    fi
    if [ "$HAS_KEY" = "1" ]; then
      if [ ! -f "$OC_FLAG" ]; then
        touch "$OC_FLAG"
        echo "[T23]   provider anthropic mergeado + key presente -> ANTHROPIC_READY.flag criado"
        TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
        TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
        curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
          --data-urlencode "chat_id=${TG_CHAT}" \
          --data-urlencode "text=HairTech: OpenClaw armado (Anthropic + 13 agentes sincronizando). rev=$REV" \
          > /dev/null 2>&1
      else
        echo "[T23]   ANTHROPIC_READY.flag ja existe (ok)"
      fi
    else
      echo "[T23]   provider mergeado mas ANTHROPIC_API_KEY ausente no .env / container - skip"
    fi
  else
    echo "[T23]   openclaw.json sem provider anthropic-api - skip"
  fi
else
  echo "[T23]   $OC_CFG inexistente - skip"
fi

# T22 (NOVO Round 12): Sincronizar 13 agentes pro OpenClaw
echo "[T22] Sync agentes OpenClaw:"
FLAG_ANTHROPIC=/opt/hairtech-openclaw/ANTHROPIC_READY.flag
if [ -f "$FLAG_ANTHROPIC" ] && [ -d /home/user/nodejs/docs/agents ]; then
  AGENTS_DIR=/opt/hairtech-openclaw/agents
  mkdir -p "$AGENTS_DIR"
  CHANGED=0
  for agent_dir in /home/user/nodejs/docs/agents/*/; do
    [ -d "$agent_dir" ] || continue
    agent_name=$(basename "$agent_dir")
    target="$AGENTS_DIR/$(echo "$agent_name" | tr '[:upper:]' '[:lower:]')"
    # Compara timestamp do agent_dir vs target/config.json
    if [ ! -f "$target/config.json" ] || [ "$agent_dir/config.json" -nt "$target/config.json" ]; then
      mkdir -p "$target"
      cp -f "$agent_dir"/SOUL.md "$target/" 2>/dev/null
      cp -f "$agent_dir"/AGENTS.md "$target/" 2>/dev/null
      cp -f "$agent_dir"/config.json "$target/" 2>/dev/null
      echo "[T22]   sync: $agent_name -> $target"
      CHANGED=1
    fi
  done
  if [ "$CHANGED" = "1" ]; then
    echo "[T22] Agentes mudaram - restart hairtech-openclaw"
    docker restart hairtech-openclaw 2>&1 | sed 's/^/[T22] /'
    sleep 8
    docker logs hairtech-openclaw --tail 5 2>&1 | sed 's/^/[T22] /'
  else
    echo "[T22] Agentes ja em dia (nenhuma copia necessaria)"
  fi
  ls -la "$AGENTS_DIR" 2>&1 | head -20 | sed 's/^/[T22]   /'
else
  echo "[T22] sem ANTHROPIC_READY.flag ou docs/agents - skip"
fi

# T24 (Round 15): Health probe OpenClaw apos T22.
# Se OpenClaw esta running mas /health nao responde, faz UM restart e ressincroniza.
echo "[T24] OpenClaw health probe:"
OC_RUNNING=$(docker inspect hairtech-openclaw --format '{{.State.Status}}' 2>/dev/null)
if [ "$OC_RUNNING" = "running" ]; then
  HEALTH_CODE=$(docker exec hairtech-openclaw curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:18789/health 2>/dev/null)
  HEALTH_CODE=${HEALTH_CODE:-000}
  echo "[T24]   /health HTTP=$HEALTH_CODE"
  if [ "$HEALTH_CODE" != "200" ] && [ -f "$OC_FLAG" ]; then
    HEAL_MARK=/tmp/hairtech-openclaw-heal-$(date +%Y%m%d%H)
    if [ ! -f "$HEAL_MARK" ]; then
      touch "$HEAL_MARK"
      echo "[T24]   health=$HEALTH_CODE -> docker restart (1x/hora max)"
      docker restart hairtech-openclaw 2>&1 | sed 's/^/[T24] /'
    else
      echo "[T24]   ja tentou healing nesta hora, skip"
    fi
  fi
else
  echo "[T24]   nao running (state=$OC_RUNNING) - skip"
fi

# T27: IA local Ollama
# Instala 1 vez se OLLAMA_ENABLED=1 no .env (ou se variavel especial flag presente).
# Marker /opt/.ollama-installed evita reinstalar.
WANT_OLLAMA=0
[ -f /home/user/nodejs/.env ] && grep -q "^OLLAMA_ENABLED=1" /home/user/nodejs/.env && WANT_OLLAMA=1
[ -f /home/user/nodejs/INSTALL_OLLAMA.flag ] && WANT_OLLAMA=1
if [ "$WANT_OLLAMA" = "1" ]; then
  if [ ! -f /opt/.ollama-installed ] && [ -f /home/user/nodejs/scripts/install-ollama.sh ]; then
    echo "[T27] Ollama solicitado e nao instalado -> rodando installer"
    chmod +x /home/user/nodejs/scripts/install-ollama.sh
    bash /home/user/nodejs/scripts/install-ollama.sh 2>&1 | tail -4 | sed 's/^/[T27] /'
  else
    # Garante container running mesmo se installer ja rodou
    if docker inspect ollama > /dev/null 2>&1; then
      S=$(docker inspect ollama --format '{{.State.Status}}')
      [ "$S" != "running" ] && docker start ollama > /dev/null 2>&1 && echo "[T27] ollama estava $S -> started"
      # Verifica se modelo do .env esta presente; se nao, pull (upgrade pos KVM upgrade)
      WANT_MODEL=$(grep "^OLLAMA_MODEL=" /home/user/nodejs/.env 2>/dev/null | cut -d= -f2-)
      if [ -n "$WANT_MODEL" ] && ! docker exec ollama ollama list 2>/dev/null | grep -q "$WANT_MODEL"; then
        echo "[T27] modelo $WANT_MODEL nao presente -> pull em background"
        docker exec -d ollama ollama pull "$WANT_MODEL" 2>/dev/null
      fi
    fi
  fi
fi

# T26: Se ALLOW_RESTART.flag existe E arquivos do AV mudaram, force-recreate.
# Sem isso, commits em app.js/admin.js/db.js nao chegam no container rodando.
if [ -f /home/user/nodejs/ALLOW_RESTART.flag ]; then
  LAST_AV=/tmp/hairtech-av-last-deployed-sha
  CUR_SHA=$(git -C /home/user/nodejs log -1 --pretty=%H -- app.js admin.js db.js retomada.js lembretes.js relatorio.js nfse.js heygen.js calendar.js systemPrompt.js 2>/dev/null)
  PREV_SHA=$(cat "$LAST_AV" 2>/dev/null)
  if [ -n "$CUR_SHA" ] && [ "$CUR_SHA" != "$PREV_SHA" ]; then
    echo "[T26] AV files changed ($PREV_SHA -> $CUR_SHA) -> force-recreate"
    (cd /home/user/nodejs && docker compose up -d --force-recreate assistente-virtual 2>&1 | tail -3 | sed 's/^/[T26] /')
    echo "$CUR_SHA" > "$LAST_AV"
    sleep 6
    docker logs assistente-virtual --tail 5 2>&1 | sed 's/^/[T26] /'
  else
    echo "[T26] AV files inalterados, skip recreate"
  fi
fi

# T28: Cron de agentes pro-ativos.
# Executa DENTRO do container AV via docker exec (heranca de ENV + acesso DB).
PROACTIVE_CRON=/etc/cron.d/hairtech-proactive
if [ ! -f "$PROACTIVE_CRON" ] || ! grep -q "PROACTIVE_VERSION=v2" "$PROACTIVE_CRON" 2>/dev/null; then
  cat > "$PROACTIVE_CRON" <<'PROCEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# PROACTIVE_VERSION=v2 (paths corrigidos /app)
# CRM pro-ativo (re-engajamento leads inativos): 10h BRT = 13h UTC
0 13 * * * root docker exec assistente-virtual node /app/scripts/proactive-crm.js >> /var/log/hairtech-proactive.log 2>&1
# POS-FUE follow-up (D+1/3/7/15/30): 09h BRT = 12h UTC
0 12 * * * root docker exec assistente-virtual node /app/scripts/proactive-pos.js >> /var/log/hairtech-proactive.log 2>&1
# FIN resumo diario: 18h BRT = 21h UTC
0 21 * * * root docker exec assistente-virtual node /app/scripts/proactive-fin.js >> /var/log/hairtech-proactive.log 2>&1
# EDU PubMed semanal: segunda 08h BRT = 11h UTC
0 11 * * 1 root docker exec assistente-virtual node /app/scripts/proactive-edu.js >> /var/log/hairtech-proactive.log 2>&1
# COMP vencimentos semanal: segunda 08h05 BRT = 11h05 UTC
5 11 * * 1 root docker exec assistente-virtual node /app/scripts/proactive-comp.js >> /var/log/hairtech-proactive.log 2>&1
PROCEOF
  chmod 644 "$PROACTIVE_CRON"
  systemctl restart cron 2>/dev/null
  echo "[T28] cron pro-ativo instalado/atualizado (crm + pos + fin)"
else
  echo "[T28] cron pro-ativo ja existe"
fi
touch /var/log/hairtech-proactive.log
chmod 640 /var/log/hairtech-proactive.log

# T29: Gera AGENDA_ICS_TOKEN no .env se faltar (uniqueness por VPS).
if [ -f /home/user/nodejs/.env ] && ! grep -q "^AGENDA_ICS_TOKEN=" /home/user/nodejs/.env; then
  NEW_TOK=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | xxd -p)
  echo "" >> /home/user/nodejs/.env
  echo "# Feed iCalendar publico (Apple/Google Calendar)" >> /home/user/nodejs/.env
  echo "AGENDA_ICS_TOKEN=$NEW_TOK" >> /home/user/nodejs/.env
  chmod 600 /home/user/nodejs/.env
  echo "[T29] AGENDA_ICS_TOKEN gerado e gravado no .env"
fi

# T30: Gera AGENTS_API_TOKEN no .env se faltar (ponte multi-agente p/ ChatGPT/Manus/etc).
if [ -f /home/user/nodejs/.env ] && ! grep -q "^AGENTS_API_TOKEN=" /home/user/nodejs/.env; then
  NEW_AT=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)
  echo "" >> /home/user/nodejs/.env
  echo "# Ponte multi-agente: /api/agent/chat (ChatGPT Custom GPT, Manus, scripts)" >> /home/user/nodejs/.env
  echo "AGENTS_API_TOKEN=$NEW_AT" >> /home/user/nodejs/.env
  echo "AGENTS_API_LIMITE=10" >> /home/user/nodejs/.env
  chmod 600 /home/user/nodejs/.env
  echo "[T30] AGENTS_API_TOKEN gerado e gravado no .env"
fi

# T31: Instala cron do vigia-agentes.sh (30 em 30 min).
VIGIA_SRC=/home/user/nodejs/scripts/cron/vigia-agentes.sh
VIGIA_CRON=/etc/cron.d/hairtech-vigia
if [ -f "$VIGIA_SRC" ]; then
  chmod +x "$VIGIA_SRC"
  if [ ! -f "$VIGIA_CRON" ] || ! grep -q "vigia-agentes.sh" "$VIGIA_CRON" 2>/dev/null; then
    cat > "$VIGIA_CRON" <<EOF
*/30 * * * * root $VIGIA_SRC >> /var/log/hairtech-vigia.log 2>&1
EOF
    chmod 644 "$VIGIA_CRON"
    systemctl restart cron 2>/dev/null
    echo "[T31] cron vigia-agentes instalado (30/30min)"
  fi
  touch /var/log/hairtech-vigia.log
  chmod 640 /var/log/hairtech-vigia.log
fi

# T25: Escreve status.json pra /admin/status ler.
STATUS_FILE=/home/user/nodejs/status.json
{
  printf '{'
  printf '"updated_at":"%s",' "$(date -Iseconds)"
  printf '"source":"auto-apply",'
  printf '"rev":"%s",' "$REV"
  printf '"containers":{'
  FIRST=1
  for C in hairtech-postgres assistente-virtual whatsapp-ana hairtech-openclaw traefik-traefik-1 whatsapp-inbox; do
    ST=$(docker inspect "$C" --format '{{.State.Status}}' 2>/dev/null || echo missing)
    [ -z "$ST" ] && ST=missing
    [ $FIRST -eq 0 ] && printf ','
    printf '"%s":"%s"' "$C" "$ST"
    FIRST=0
  done
  printf '},'
  HEALTH=$(docker exec hairtech-openclaw curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://localhost:18789/health 2>/dev/null)
  HEALTH=${HEALTH:-0}
  ANTH_READY=false; [ -f /opt/hairtech-openclaw/ANTHROPIC_READY.flag ] && ANTH_READY=true
  ALLOW_RESTART=false; [ -f /home/user/nodejs/ALLOW_RESTART.flag ] && ALLOW_RESTART=true
  AGENTS=$(ls /opt/hairtech-openclaw/agents 2>/dev/null | wc -l)
  printf '"openclaw":{"anthropic_ready":%s,"agents_synced":%s,"health_http":%s},' "$ANTH_READY" "$AGENTS" "$HEALTH"
  printf '"flags":{"ALLOW_RESTART":%s,"ANTHROPIC_READY":%s}' "$ALLOW_RESTART" "$ANTH_READY"
  printf '}'
} > "$STATUS_FILE.tmp" && mv "$STATUS_FILE.tmp" "$STATUS_FILE"
chmod 644 "$STATUS_FILE"
echo "[T25] status.json escrito"

# T31: Cron noturno - vasculhamento Ollama madrugada + relatorio matinal
NOTURNO_CRON=/etc/cron.d/hairtech-noturno
if [ ! -f "$NOTURNO_CRON" ] || ! grep -q "NOTURNO_VERSION=v1" "$NOTURNO_CRON" 2>/dev/null; then
  cat > "$NOTURNO_CRON" <<'NOTEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# NOTURNO_VERSION=v1
# Vasculhamento Ollama: 02:00 BRT = 05:00 UTC. Custo zero (IA local).
0 5 * * * root docker exec assistente-virtual node /app/scripts/vasculhar-ollama.js >> /var/log/hairtech-noturno.log 2>&1
# Backup Postgres local: 03:30 BRT = 06:30 UTC
30 6 * * * root docker exec hairtech-postgres pg_dump -U hairtech hairtechdb 2>/dev/null | gzip > /opt/backup/pg-$(date +\%Y\%m\%d).sql.gz 2>>/var/log/hairtech-noturno.log && find /opt/backup -name "pg-*.sql.gz" -mtime +7 -delete 2>>/var/log/hairtech-noturno.log
# Relatorio matinal Telegram: 07:45 BRT = 10:45 UTC
45 10 * * * root docker exec assistente-virtual node /app/scripts/relatorio-matinal.js >> /var/log/hairtech-noturno.log 2>&1
NOTEOF
  chmod 644 "$NOTURNO_CRON"
  systemctl restart cron 2>/dev/null
  echo "[T31] cron noturno instalado (vasculhamento 02h + backup 03h30 + relatorio 07h45)"
fi
mkdir -p /opt/backup
touch /var/log/hairtech-noturno.log
chmod 640 /var/log/hairtech-noturno.log

# T30: Healthcheck v2 com cooldown + para AV em restart-loop.
# Migra de /opt/healthcheck/check.sh antigo (sem cooldown) pro novo.
# Tambem sinaliza fim do flood se houve mais de 30 alertas/dia recentes.
if [ -f /home/user/nodejs/scripts/healthcheck.sh ]; then
  if ! diff -q /home/user/nodejs/scripts/healthcheck.sh /opt/healthcheck/check.sh > /dev/null 2>&1; then
    cp /home/user/nodejs/scripts/healthcheck.sh /opt/healthcheck/check.sh
    chmod 755 /opt/healthcheck/check.sh
    echo "[T30] healthcheck atualizado (v2 com cooldown)"
    # Manda 1 notificacao do upgrade
    TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
    TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
    curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TG_CHAT}" \
      --data-urlencode "text=HairTech: healthcheck v2 ativo - alertas agora tem cooldown 1h por categoria (fim do flood)." \
      > /dev/null 2>&1
  fi
fi

# T33: Watchdog 30min - verifica saude de TODOS os agentes
WATCHDOG_CRON=/etc/cron.d/hairtech-watchdog
if [ ! -f "$WATCHDOG_CRON" ] || ! grep -q "WATCHDOG_VERSION=v1" "$WATCHDOG_CRON" 2>/dev/null; then
  cat > "$WATCHDOG_CRON" <<'WDEOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# WATCHDOG_VERSION=v1
# A cada 30min: verifica agente noturno + healthchecks ja existem em /etc/cron.d/hairtech-healthcheck
*/30 * * * * root docker exec assistente-virtual sh -c "pgrep -f agente-noturno.js >/dev/null || node /app/scripts/agente-noturno.js >> /var/log/agente-noturno.log 2>&1 &" >> /var/log/hairtech-watchdog.log 2>&1
WDEOF
  chmod 644 "$WATCHDOG_CRON"
  systemctl restart cron 2>/dev/null
  echo "[T33] watchdog 30min instalado"
fi
touch /var/log/hairtech-watchdog.log /var/log/agente-noturno.log
chmod 640 /var/log/hairtech-watchdog.log /var/log/agente-noturno.log

# T32: Agente noturno 24/7 - escuta Telegram, usa Ollama local primeiro.
# Roda dentro do container AV em background. Restart automatico se cair.
AGENTE_PID_FILE=/tmp/hairtech-agente-noturno.pid
if [ -f /home/user/nodejs/scripts/agente-noturno.js ]; then
  # Verifica se ja ta rodando dentro do container AV
  RUNNING=$(docker exec assistente-virtual sh -c "pgrep -f agente-noturno.js" 2>/dev/null | head -1)
  if [ -z "$RUNNING" ]; then
    echo "[T32] iniciando agente noturno em background dentro do AV"
    docker exec -d assistente-virtual node /app/scripts/agente-noturno.js > /dev/null 2>&1
  else
    echo "[T32] agente noturno ja rodando (pid $RUNNING dentro do container)"
  fi
fi

# T34: Trigger manual via flag - dispara vasculhamento IMEDIATO sem esperar 02h
TRIGGER_FLAG=/home/user/nodejs/RODAR_VASCULHAMENTO.flag
if [ -f "$TRIGGER_FLAG" ]; then
  echo "[T34] Flag RODAR_VASCULHAMENTO detectada - disparando AGORA"
  docker exec -d assistente-virtual node /app/scripts/vasculhar-ollama.js > /var/log/hairtech-vasculhar.log 2>&1
  # Apaga flag pra nao re-disparar
  rm -f "$TRIGGER_FLAG"
  # Commit local removendo a flag (cron continua puxando, se nao remover do remote ele vai voltar)
  TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
  TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
  curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" \
    --data-urlencode "text=Vasculhamento Ollama disparado MANUALMENTE via flag. Resultado em ~30min." > /dev/null 2>&1
  echo "[T34] Telegram avisado"
fi

echo "[$(date -Iseconds)] auto-apply.sh END (v10 Round 15)"
