#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  AUDITORIA READ-ONLY — HairTech VPS — $(date)
#  NÃO modifica nada. Apenas coleta e exibe estado atual.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
OUT=/tmp/audit-hairtech-$(date +%Y%m%d-%H%M%S).txt
exec > >(tee "$OUT") 2>&1

SEP() { echo ""; echo "══════════════════════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════════════════════"; }

echo "╔══════════════════════════════════════════════════════╗"
echo "║  AUDITORIA READ-ONLY — HairTech VPS                 ║"
echo "║  $(date '+%Y-%m-%d %H:%M:%S %Z')                    ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── 1. SISTEMA ────────────────────────────────────────────────
SEP "1. SISTEMA"
echo "Hostname:  $(hostname)"
echo "IP:        $(hostname -I | awk '{print $1}')"
echo "Uptime:    $(uptime -p)"
echo "SO:        $(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY | cut -d= -f2)"
echo "Kernel:    $(uname -r)"
echo ""
echo "── Disco:"
df -h | grep -E "Filesystem|/$|/opt|/var"
echo ""
echo "── Memória:"
free -h
echo ""
echo "── Carga CPU:"
uptime

# ── 2. DOCKER — CONTAINERS ───────────────────────────────────
SEP "2. TODOS OS CONTAINERS (docker ps -a)"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" 2>/dev/null || echo "ERRO: docker não acessível"

echo ""
echo "── Containers UNHEALTHY ou RESTARTING:"
docker ps -a --format "{{.Names}} {{.Status}}" 2>/dev/null | grep -iE "unhealthy|restarting|exited|dead" || echo "(nenhum)"

echo ""
echo "── Contagem:"
docker ps -q 2>/dev/null | wc -l | xargs echo "Rodando:"
docker ps -aq 2>/dev/null | wc -l | xargs echo "Total (incl. parados):"

# ── 3. REDES DOCKER ──────────────────────────────────────────
SEP "3. REDES DOCKER"
docker network ls 2>/dev/null

echo ""
echo "── Containers na rede 'web':"
docker network inspect web 2>/dev/null \
  | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    containers = d[0].get('Containers', {})
    for cid, info in containers.items():
        print(f\"  {info['Name']} — {info['IPv4Address']}\")
    if not containers:
        print('  (nenhum)')
except: print('  (erro ao inspecionar rede web)')
" 2>/dev/null || echo "  Rede 'web' não existe"

echo ""
echo "── Containers na rede 'hairtech-network':"
docker network inspect hairtech-network 2>/dev/null \
  | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    containers = d[0].get('Containers', {})
    for cid, info in containers.items():
        print(f\"  {info['Name']} — {info['IPv4Address']}\")
    if not containers:
        print('  (nenhum)')
except: print('  (rede hairtech-network não existe)')
" 2>/dev/null || echo "  (rede não existe)"

# ── 4. VOLUMES DOCKER ────────────────────────────────────────
SEP "4. VOLUMES DOCKER"
docker volume ls 2>/dev/null
echo ""
echo "── Volumes ÓRFÃOS (dangling):"
docker volume ls -qf dangling=true 2>/dev/null | head -10 || echo "(nenhum)"

# ── 5. PORTAS EM USO ─────────────────────────────────────────
SEP "5. PORTAS EM USO (host)"
ss -tlnp 2>/dev/null | grep -E "LISTEN|Local" || netstat -tlnp 2>/dev/null | head -30

echo ""
echo "── Verificação de portas específicas:"
for PORT in 80 443 3001 3099 7700 8080 18789 4000; do
  STATUS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " && echo "ABERTA" || echo "fechada")
  echo "  :${PORT} — ${STATUS}"
done

# ── 6. UFW ───────────────────────────────────────────────────
SEP "6. UFW (Firewall)"
ufw status verbose 2>/dev/null || echo "UFW não disponível"

# ── 7. TRAEFIK ───────────────────────────────────────────────
SEP "7. TRAEFIK (traefik-traefik-1)"
echo "── Status:"
docker inspect traefik-traefik-1 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)[0]
state = d.get('State', {})
print(f\"  Status: {state.get('Status')}\")
print(f\"  Running: {state.get('Running')}\")
print(f\"  StartedAt: {state.get('StartedAt','?')[:19]}\")
print(f\"  RestartCount: {d.get('RestartCount',0)}\")
" 2>/dev/null || echo "  Container não encontrado"

echo ""
echo "── Routers Traefik (via API interna):"
docker exec traefik-traefik-1 wget -qO- http://127.0.0.1:8080/api/http/routers 2>/dev/null \
  | python3 -c "
import sys, json
try:
    routers = json.load(sys.stdin)
    for r in routers:
        name = r.get('name','?')
        rule = r.get('rule','?')
        status = r.get('status','?')
        tls = '🔒 TLS' if r.get('tls') else '  HTTP'
        print(f'  {tls} [{status}] {name}: {rule}')
except Exception as e:
    print(f'  ERRO: {e}')
" 2>/dev/null || echo "  Não foi possível acessar API Traefik"

echo ""
echo "── Logs Traefik (últimas 20 linhas relevantes):"
docker logs traefik-traefik-1 --tail 30 2>&1 | grep -iE "error|warn|claw|openclaw|acme|cert|level=error|level=warn" | tail -20 || echo "  (sem logs relevantes)"

echo ""
echo "── Mounts do Traefik (acme.json):"
docker inspect traefik-traefik-1 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)[0]
for m in d.get('Mounts', []):
    print(f\"  {m.get('Type','?')}: {m.get('Source','?')} → {m.get('Destination','?')}\")
" 2>/dev/null || echo "  Não encontrado"

# ── 8. POSTGRESQL ─────────────────────────────────────────────
SEP "8. POSTGRESQL (hairtech-postgres)"
docker inspect hairtech-postgres 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)[0]
state = d.get('State', {})
print(f\"  Status: {state.get('Status')}\")
print(f\"  Running: {state.get('Running')}\")
print(f\"  StartedAt: {state.get('StartedAt','?')[:19]}\")
print(f\"  Health: {d.get('State',{}).get('Health',{}).get('Status','N/A')}\")
" 2>/dev/null || echo "  Container não encontrado"

echo ""
echo "── Teste de conexão ao banco:"
docker exec hairtech-postgres psql -U hairtech -d hairtechdb -c "\l" 2>/dev/null | head -10 || echo "  Não foi possível conectar ao banco"

# ── 9. ASSISTENTE-VIRTUAL ────────────────────────────────────
SEP "9. ASSISTENTE-VIRTUAL"
docker inspect assistente-virtual 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)[0]
state = d.get('State', {})
print(f\"  Status: {state.get('Status')}\")
print(f\"  Running: {state.get('Running')}\")
print(f\"  StartedAt: {state.get('StartedAt','?')[:19]}\")
print(f\"  RestartCount: {d.get('RestartCount',0)}\")
nets = list(d.get('NetworkSettings',{}).get('Networks',{}).keys())
print(f\"  Redes: {nets}\")
extra = d.get('HostConfig',{}).get('ExtraHosts',[])
print(f\"  ExtraHosts: {extra}\")
" 2>/dev/null || echo "  Container não encontrado"

echo ""
echo "── Health do bot (porta 3001):"
curl -sf --max-time 5 http://localhost:3001/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  FALHA: bot não responde na porta 3001"

echo ""
echo "── Logs AV (últimas 20 linhas):"
docker logs assistente-virtual --tail 20 2>&1 | tail -20 || echo "  Sem logs"

echo ""
echo "── app.js — verificar modificações recentes:"
ls -la /home/user/nodejs/app.js 2>/dev/null
echo "  SHA256: $(sha256sum /home/user/nodejs/app.js 2>/dev/null | cut -c1-16)..."
echo "  Linhas: $(wc -l < /home/user/nodejs/app.js 2>/dev/null)"
echo ""
echo "── app.js contém forward authbot?"
grep -n "authbot\|wa-callback\|WA_RICARDO_NUM\|hairtech-authbot" /home/user/nodejs/app.js 2>/dev/null || echo "  NÃO — forward authbot não encontrado"
echo ""
echo "── app.js contém !exec?"
grep -n "!exec\|EXECUTOR_TOKEN\|host.docker.internal:3099" /home/user/nodejs/app.js 2>/dev/null || echo "  NÃO encontrado"

# ── 10. OPENCLAW LEGADO ──────────────────────────────────────
SEP "10. OPENCLAW LEGADO (openclaw-openclaw-1)"
docker inspect openclaw-openclaw-1 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)[0]
state = d.get('State', {})
print(f\"  Status: {state.get('Status')}\")
print(f\"  Running: {state.get('Running')}\")
print(f\"  StartedAt: {state.get('StartedAt','?')[:19]}\")
" 2>/dev/null || echo "  Container openclaw-openclaw-1 NÃO encontrado"

# ── 11. HAIRTECH-OPENCLAW (NOVO) ─────────────────────────────
SEP "11. HAIRTECH-OPENCLAW (novo — se existir)"
docker inspect hairtech-openclaw 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)[0]
state = d.get('State', {})
print(f\"  Status: {state.get('Status')}\")
print(f\"  Running: {state.get('Running')}\")
print(f\"  StartedAt: {state.get('StartedAt','?')[:19]}\")
print(f\"  RestartCount: {d.get('RestartCount',0)}\")
print(f\"  Image: {d.get('Config',{}).get('Image','?')}\")
health = d.get('State',{}).get('Health',{}).get('Status','N/A')
print(f\"  Health: {health}\")
" 2>/dev/null || echo "  Container hairtech-openclaw NÃO existe"

echo ""
echo "── /opt/hairtech-openclaw:"
if [ -d /opt/hairtech-openclaw ]; then
  ls -la /opt/hairtech-openclaw/
  echo ""
  echo "  config/:"
  ls -la /opt/hairtech-openclaw/config/ 2>/dev/null || echo "    (vazio ou não existe)"
  echo ""
  echo "  workspace/:"
  ls -la /opt/hairtech-openclaw/workspace/ 2>/dev/null || echo "    (vazio ou não existe)"
  echo ""
  echo "  .env (mascarado):"
  sed 's/=\(.\{6\}\).*/=\1[...REDACTED]/g' /opt/hairtech-openclaw/.env 2>/dev/null || echo "    .env não existe"
  echo ""
  echo "  docker-compose.yml:"
  cat /opt/hairtech-openclaw/docker-compose.yml 2>/dev/null || echo "    não existe"
else
  echo "  DIRETÓRIO NÃO EXISTE"
fi

echo ""
echo "── Logs hairtech-openclaw (se existir):"
docker logs hairtech-openclaw --tail 30 2>&1 || echo "  Container não encontrado"

# ── 12. HAIRTECH-AUTHBOT ─────────────────────────────────────
SEP "12. HAIRTECH-AUTHBOT (se existir)"
docker inspect hairtech-authbot 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)[0]
state = d.get('State', {})
print(f\"  Status: {state.get('Status')}\")
print(f\"  Running: {state.get('Running')}\")
print(f\"  StartedAt: {state.get('StartedAt','?')[:19]}\")
print(f\"  RestartCount: {d.get('RestartCount',0)}\")
" 2>/dev/null || echo "  Container hairtech-authbot NÃO existe"

echo ""
echo "── /opt/hairtech-authbot:"
if [ -d /opt/hairtech-authbot ]; then
  ls -la /opt/hairtech-authbot/
  echo ""
  echo "  .env (mascarado):"
  sed 's/=\(.\{6\}\).*/=\1[...REDACTED]/g' /opt/hairtech-authbot/.env 2>/dev/null || echo "    .env não existe"
  echo ""
  echo "  Polling Telegram em uso?"
  docker exec hairtech-authbot ps aux 2>/dev/null || echo "    Container não está rodando"
else
  echo "  DIRETÓRIO NÃO EXISTE"
fi

echo ""
echo "── Health authbot (porta 7700):"
curl -sf --max-time 5 http://localhost:7700/health 2>/dev/null | python3 -m json.tool || echo "  FALHA: authbot não responde na porta 7700"

echo ""
echo "── Logs authbot (se existir):"
docker logs hairtech-authbot --tail 20 2>&1 || echo "  Container não encontrado"

# ── 13. CONFLITO TELEGRAM ────────────────────────────────────
SEP "13. CONFLITO DE POLLING TELEGRAM"
echo "── Token Telegram no .env do assistente-virtual:"
grep -i "telegram\|8470054351" /home/user/nodejs/.env 2>/dev/null || echo "  Não encontrado no AV .env"

echo ""
echo "── Token Telegram nas variáveis do container AV:"
docker exec assistente-virtual env 2>/dev/null | grep -iE "telegram|8470054351" || echo "  Não encontrado no env do container"

echo ""
echo "── Processos usando polling Telegram (node-telegram-bot-api):"
docker ps --format "{{.Names}}" 2>/dev/null | while read c; do
  result=$(docker exec "$c" ps aux 2>/dev/null | grep -i "telegram\|bot.js" | grep -v grep | head -2)
  [ -n "$result" ] && echo "  Container $c: $result"
done || true

# ── 14. DNS ──────────────────────────────────────────────────
SEP "14. DNS ATUAL"
echo "── hairtech.org (registros A):"
dig +short hairtech.org A @1.1.1.1 2>/dev/null || echo "  (dig não disponível)"

echo ""
echo "── claw.hairtech.org:"
R=$(dig +short claw.hairtech.org A @1.1.1.1 2>/dev/null || echo "NXDOMAIN/timeout")
echo "  @1.1.1.1: $R"
R2=$(dig +short claw.hairtech.org A @8.8.8.8 2>/dev/null || echo "timeout")
echo "  @8.8.8.8: $R2"
R3=$(dig +short claw.hairtech.org A @1.0.0.1 2>/dev/null || echo "timeout")
echo "  @1.0.0.1: $R3"

echo ""
echo "── Todos os registros de hairtech.org:"
dig hairtech.org ANY @1.1.1.1 +noall +answer 2>/dev/null | head -20 || echo "  (não disponível)"

# ── 15. SSL / TRAEFIK ROUTERS ────────────────────────────────
SEP "15. SSL E ROUTERS TRAEFIK"
echo "── HTTPS hairtech.org:"
curl -sI --max-time 10 https://hairtech.org/health 2>/dev/null | head -5 || echo "  Sem resposta"

echo ""
echo "── HTTPS claw.hairtech.org (se DNS existir):"
curl -sI --max-time 10 https://claw.hairtech.org/healthz 2>/dev/null | head -5 || echo "  Sem resposta (DNS pode não existir)"

echo ""
echo "── acme.json existe e tem certs?"
docker inspect traefik-traefik-1 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)[0]
for m in d.get('Mounts',[]):
    src = m.get('Source','')
    if 'acme' in src.lower():
        print(f'  acme.json em: {src}')
" 2>/dev/null | while read line; do
  path=$(echo "$line" | awk '{print $3}')
  if [ -f "$path" ]; then
    SIZE=$(ls -lh "$path" | awk '{print $5}')
    DOMAINS=$(python3 -c "import json; d=json.load(open('$path')); certs=[c['domain']['main'] for r in d.values() for c in r.get('Certificates',[])]; print(', '.join(certs))" 2>/dev/null || echo "não parseável")
    echo "  $line | Tamanho: $SIZE | Domínios: $DOMAINS"
  else
    echo "  $line | ARQUIVO NÃO ENCONTRADO"
  fi
done || echo "  Não foi possível localizar acme.json"

# ── 16. IMAGEM OPENCLAW ──────────────────────────────────────
SEP "16. IMAGEM OPENCLAW (se baixada)"
docker images 2>/dev/null | grep -iE "openclaw|ghcr.io/openclaw" || echo "  Imagem OpenClaw NÃO encontrada localmente"
echo ""
echo "── Todas as imagens (top 15 por tamanho):"
docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" 2>/dev/null | sort -t$'\t' -k2 -rh | head -15

# ── 17. CRON ────────────────────────────────────────────────
SEP "17. CRON JOBS"
echo "── crontab root:"
crontab -l 2>/dev/null || echo "  (nenhum crontab para root)"
echo ""
echo "── /etc/cron.daily/:"
ls -la /etc/cron.daily/ 2>/dev/null | grep -v "^total\|^d"
echo ""
echo "── /etc/cron.d/:"
ls -la /etc/cron.d/ 2>/dev/null | grep -v "^total\|^d"

# ── 18. ARQUIVOS CRIADOS ─────────────────────────────────────
SEP "18. ARQUIVOS E DIRETÓRIOS RELEVANTES"
echo "── /opt/ (estrutura de 1 nível):"
ls -la /opt/ 2>/dev/null

echo ""
echo "── /opt/backups/ (se existir):"
ls -la /opt/backups/ 2>/dev/null || echo "  NÃO existe"

echo ""
echo "── /opt/hairtech-openclaw (detalhado):"
find /opt/hairtech-openclaw 2>/dev/null -maxdepth 4 -not -path "*/node_modules/*" | sort || echo "  NÃO existe"

echo ""
echo "── /opt/hairtech-authbot (detalhado):"
find /opt/hairtech-authbot 2>/dev/null -maxdepth 4 -not -path "*/node_modules/*" | sort || echo "  NÃO existe"

echo ""
echo "── /home/user/nodejs/ (modificações recentes — últimas 24h):"
find /home/user/nodejs -maxdepth 2 -newer /home/user/nodejs/package.json -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null | sort

echo ""
echo "── install-openclaw.sh existe?"
ls -la /home/user/nodejs/install-openclaw.sh 2>/dev/null || echo "  Não existe"
ls -la /root/install-openclaw.sh 2>/dev/null || true
ls -la /tmp/install*.sh 2>/dev/null || true

# ── 19. OUTROS CONTAINERS ────────────────────────────────────
SEP "19. OUTROS CONTAINERS CRÍTICOS"
for C in openai-proxy whatsapp-inbox dashboard-react-frontend wordpress-wordpress-1 wordpress-db-1; do
  STATUS=$(docker inspect "$C" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin)[0]; print(d['State']['Status'])" 2>/dev/null || echo "NÃO ENCONTRADO")
  echo "  $C: $STATUS"
done

# ── 20. VERIFICAÇÃO META WEBHOOK ─────────────────────────────
SEP "20. WEBHOOK META (leitura)"
WA_TOKEN_LOCAL=$(grep ^WHATSAPP_TOKEN /home/user/nodejs/.env 2>/dev/null | cut -d= -f2-)
if [ -n "$WA_TOKEN_LOCAL" ]; then
  echo "── Verificando webhook Meta registrado (read-only):"
  PHONE_ID=$(grep ^PHONE_NUMBER_ID /home/user/nodejs/.env 2>/dev/null | cut -d= -f2-)
  echo "  PHONE_NUMBER_ID: $PHONE_ID"
  # Chama API para ver subscriptions (sem modificar)
  curl -sf --max-time 10 \
    -H "Authorization: Bearer ${WA_TOKEN_LOCAL}" \
    "https://graph.facebook.com/v23.0/${PHONE_ID}/subscribed_apps" 2>/dev/null \
    | python3 -m json.tool 2>/dev/null || echo "  Não foi possível verificar subscriptions"
else
  echo "  Não foi possível ler WHATSAPP_TOKEN do .env"
fi

# ── 21. CREDENCIAIS EXPOSTAS ────────────────────────────────
SEP "21. VERIFICAÇÃO DE CREDENCIAIS EXPOSTAS"
echo "── Secrets em variáveis de container (verificar exposição):"
for C in hairtech-openclaw hairtech-authbot; do
  echo "  --- $C ---"
  docker inspect "$C" 2>/dev/null \
    | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)[0]
    env = d.get('Config',{}).get('Env',[])
    for e in env:
        k = e.split('=')[0]
        if any(s in k.upper() for s in ['KEY','TOKEN','SECRET','PASS','PWD']):
            v = e.split('=',1)[1] if '=' in e else '?'
            masked = v[:6] + '...[REDACTED]' if len(v) > 6 else '[SHORT]'
            print(f'    {k}={masked}')
except: pass
" 2>/dev/null || echo "  Container não encontrado"
done

echo ""
echo "── .env files com permissão incorreta (deve ser 600):"
for f in /home/user/nodejs/.env /opt/hairtech-openclaw/.env /opt/hairtech-authbot/.env; do
  if [ -f "$f" ]; then
    PERM=$(stat -c "%a" "$f" 2>/dev/null)
    WARN=""
    [ "$PERM" != "600" ] && WARN=" ⚠️  PERMISSÃO INCORRETA"
    echo "  $f — $PERM$WARN"
  fi
done

# ── 22. HISTÓRICO DE COMANDOS ────────────────────────────────
SEP "22. HISTÓRICO DE COMANDOS RECENTES (root)"
tail -50 /root/.bash_history 2>/dev/null | grep -vE "^#" | tail -30 || echo "  Histórico não disponível"

# ── 23. LOGS DO SISTEMA ──────────────────────────────────────
SEP "23. LOGS DO SISTEMA (últimas 2h)"
journalctl --since "2 hours ago" --no-pager -q 2>/dev/null \
  | grep -iE "docker|openclaw|hairtech|error|fail" \
  | tail -20 || echo "  journalctl não disponível"

echo ""
echo "── Systemd services relevantes:"
systemctl status hairtech-executor 2>/dev/null | head -15 || echo "  hairtech-executor não encontrado"

# ── SUMÁRIO FINAL ────────────────────────────────────────────
SEP "SUMÁRIO — ESTADO GERAL"

echo "── Containers novos detectados (hairtech-*):"
docker ps -a --format "{{.Names}}" 2>/dev/null | grep "hairtech-" || echo "  Nenhum"

echo ""
echo "── Diretórios /opt/ da instalação:"
for d in /opt/hairtech-openclaw /opt/hairtech-authbot /opt/backups; do
  [ -d "$d" ] && echo "  ✅ EXISTE: $d" || echo "  ❌ AUSENTE: $d"
done

echo ""
echo "── DNS claw.hairtech.org:"
RDNS=$(dig +short claw.hairtech.org A @1.1.1.1 2>/dev/null || echo "")
[ "$RDNS" = "72.62.100.6" ] && echo "  ✅ PROPAGADO → 72.62.100.6" || echo "  ❌ NÃO propagado (atual: '${RDNS:-NXDOMAIN}')"

echo ""
echo "── app.js modificado para authbot?"
grep -q "hairtech-authbot\|wa-callback" /home/user/nodejs/app.js 2>/dev/null \
  && echo "  ✅ SIM — forward authbot presente" \
  || echo "  ❌ NÃO — sem forward para authbot"

echo ""
echo "── Imagem OpenClaw baixada?"
docker images 2>/dev/null | grep -q "openclaw" \
  && echo "  ✅ SIM" \
  || echo "  ❌ NÃO"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  AUDITORIA CONCLUÍDA — NENHUMA ALTERAÇÃO FOI FEITA"
echo "  Relatório salvo em: $OUT"
echo "═══════════════════════════════════════════════════════"
