#!/bin/bash
# claude-openclaw-bridge.sh — ponte ASSINCRONA via Git
# Roda na VPS a cada 1min via cron.
#
# Fluxo:
# 1. git pull origin claude/...
# 2. processa cada data/claude-to-openclaw/*.req.json
# 3. escreve resposta em data/openclaw-to-claude/{id}.res.json
# 4. move req processada pra _processadas/
# 5. commit + push
#
# Tipos de request suportados:
#   - sql_read       (SELECT only no Postgres)
#   - shell_read     (whitelist read-only)
#   - ollama_query   (chat com Ollama VPS, R$0)
#   - openclaw_chat  (chat com agente hairtech-orquestrador via API interna)
#   - api_internal   (qualquer GET no /api/internal/)
#   - waha_query     (GET no WAHA da ANA pra listar chats/mensagens)

set +e
cd /home/user/nodejs 2>/dev/null || exit 0

LOG=/var/log/hairtech-bridge.log
log() { echo "[$(date -Iseconds)] $*" >> "$LOG"; }

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
git pull --rebase origin "$BRANCH" 2>/dev/null

REQS=$(ls data/claude-to-openclaw/*.req.json 2>/dev/null)
[ -z "$REQS" ] && exit 0

mkdir -p data/openclaw-to-claude data/claude-to-openclaw/_processadas

source /home/user/nodejs/.env 2>/dev/null
INTERNAL_TOKEN="${INTERNAL_API_TOKEN}"
OPENCLAW_TOKEN="${OPENCLAW_GATEWAY_TOKEN}"
WAHA_KEY="${WHATSAPP_ANA_KEY}"

processou=0
for req in $REQS; do
  ID=$(basename "$req" .req.json)
  RES="data/openclaw-to-claude/${ID}.res.json"
  [ -f "$RES" ] && { mv "$req" data/claude-to-openclaw/_processadas/ 2>/dev/null; continue; }

  TIPO=$(jq -r .tipo "$req" 2>/dev/null)
  log "Processando $ID tipo=$TIPO"

  case "$TIPO" in
    sql_read)
      QUERY=$(jq -r .query "$req")
      # Bloqueia se nao for SELECT
      if ! echo "$QUERY" | grep -qiE '^[[:space:]]*SELECT'; then
        jq -n --arg q "$QUERY" '{ok:false,erro:"so SELECT permitido",query:$q}' > "$RES"
      elif echo "$QUERY" | grep -qiE '(DROP|DELETE|UPDATE|INSERT|ALTER|GRANT|TRUNCATE|CREATE)'; then
        jq -n '{ok:false,erro:"verbo destrutivo bloqueado"}' > "$RES"
      else
        RESULT=$(docker exec hairtech-postgres psql -U hairtech -d hairtechdb -t -c "$QUERY" 2>&1 | head -c 100000)
        jq -n --arg r "$RESULT" --arg q "$QUERY" '{ok:true,query:$q,result:$r,gerado_em:now|todate}' > "$RES"
      fi
      ;;
    shell_read)
      CMD=$(jq -r .cmd "$req")
      FIRST=$(echo "$CMD" | awk '{print $1}')
      if echo "ls cat head tail wc grep find du df hostname date uname uptime" | grep -qw "$FIRST"; then
        # bloqueia metachars perigosos
        if echo "$CMD" | grep -qE '[;|&`$><]'; then
          jq -n '{ok:false,erro:"caracteres perigosos bloqueados"}' > "$RES"
        else
          RESULT=$(eval "$CMD" 2>&1 | head -c 50000)
          jq -n --arg r "$RESULT" --arg c "$CMD" '{ok:true,cmd:$c,result:$r,gerado_em:now|todate}' > "$RES"
        fi
      elif echo "$CMD" | grep -qE '^docker (logs|ps|inspect|exec [a-zA-Z0-9_.-]+ (ls|cat|head|tail))'; then
        RESULT=$(eval "$CMD" 2>&1 | head -c 50000)
        jq -n --arg r "$RESULT" --arg c "$CMD" '{ok:true,cmd:$c,result:$r,gerado_em:now|todate}' > "$RES"
      else
        jq -n --arg c "$CMD" '{ok:false,erro:"cmd nao na whitelist",cmd:$c}' > "$RES"
      fi
      ;;
    ollama_query)
      PROMPT=$(jq -r .prompt "$req")
      MODEL=$(jq -r '.model // "qwen2.5:7b-instruct"' "$req")
      PAYLOAD=$(jq -n --arg m "$MODEL" --arg p "$PROMPT" \
        '{model:$m, messages:[{role:"user",content:$p}], stream:false, options:{num_predict:1000}}')
      RESULT=$(curl -s --max-time 60 -X POST http://ollama:11434/api/chat \
        -H "Content-Type: application/json" -d "$PAYLOAD" 2>&1 | head -c 100000)
      jq -n --argjson r "$RESULT" '{ok:true,result:$r,gerado_em:now|todate}' > "$RES" 2>/dev/null \
        || jq -n --arg r "$RESULT" '{ok:true,result_raw:$r,gerado_em:now|todate}' > "$RES"
      ;;
    api_internal)
      PATH_REQ=$(jq -r .path "$req")
      # Sanitiza path
      SAFE_PATH=$(echo "$PATH_REQ" | sed 's/[^a-zA-Z0-9/_?=&.-]//g')
      RESULT=$(curl -s --max-time 30 -H "Authorization: Bearer $INTERNAL_TOKEN" \
        "http://localhost:3001/api/internal${SAFE_PATH}" 2>&1 | head -c 100000)
      jq -n --argjson r "$RESULT" '{ok:true,result:$r}' > "$RES" 2>/dev/null \
        || jq -n --arg r "$RESULT" '{ok:true,result_raw:$r}' > "$RES"
      ;;
    waha_query)
      ENDPOINT=$(jq -r .endpoint "$req")
      SAFE=$(echo "$ENDPOINT" | sed 's/[^a-zA-Z0-9/_?=&.-]//g')
      RESULT=$(curl -s --max-time 30 -H "X-Api-Key: $WAHA_KEY" \
        "http://whatsapp-ana:3000${SAFE}" 2>&1 | head -c 100000)
      jq -n --argjson r "$RESULT" '{ok:true,result:$r}' > "$RES" 2>/dev/null \
        || jq -n --arg r "$RESULT" '{ok:true,result_raw:$r}' > "$RES"
      ;;
    openclaw_chat)
      PROMPT=$(jq -r .prompt "$req")
      RESULT=$(curl -s --max-time 60 -X POST http://hairtech-openclaw:18789/api/chat \
        -H "Authorization: Bearer $OPENCLAW_TOKEN" \
        -d "$(jq -n --arg p "$PROMPT" '{prompt:$p, agent:"hairtech-orquestrador"}')" 2>&1 | head -c 100000)
      jq -n --argjson r "$RESULT" '{ok:true,result:$r}' > "$RES" 2>/dev/null \
        || jq -n --arg r "$RESULT" '{ok:true,result_raw:$r}' > "$RES"
      ;;
    *)
      jq -n --arg t "$TIPO" '{ok:false,erro:"tipo nao suportado",tipo_recebido:$t,tipos_validos:["sql_read","shell_read","ollama_query","api_internal","waha_query","openclaw_chat"]}' > "$RES"
      ;;
  esac

  mv "$req" data/claude-to-openclaw/_processadas/ 2>/dev/null
  processou=$((processou + 1))
done

if [ "$processou" -gt 0 ]; then
  git add data/openclaw-to-claude/ data/claude-to-openclaw/ 2>/dev/null
  git -c user.email="bridge@hairtech.org" -c user.name="Claude-OpenClaw Bridge" \
    commit -m "[bridge] processou $processou requisicoes" 2>/dev/null
  git push origin "$BRANCH" 2>/dev/null
  log "Push OK ($processou reqs processadas)"
fi
