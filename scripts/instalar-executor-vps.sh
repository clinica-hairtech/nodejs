#!/bin/bash
# ============================================================
# EXECUTOR HTTP SEGURO PARA CODEX / CLAUDE / CHATGPT
# Clinica HairTech - Hostinger VPS
# Versao: 22/05/2026
#
# COMO USAR:
# 1. SSH na VPS: ssh -i ~/.ssh/hairtech_vps_ed25519 root@72.62.100.6
# 2. Cole este script inteiro
# 3. Aguarde criar container hairtech-executor
# 4. Anote o TOKEN no final do output
# 5. Passe URL+token pra Claude Code Web (este chat)
# ============================================================

set -e

echo "============================================================"
echo "CRIANDO EXECUTOR HTTP HAIRTECH"
echo "============================================================"

mkdir -p /opt/hairtech-executor
cd /opt/hairtech-executor

EXECUTOR_TOKEN=$(openssl rand -hex 32)

cat > .env <<EOF
EXECUTOR_TOKEN=${EXECUTOR_TOKEN}
PORT=3099
EOF
chmod 600 .env

cat > package.json <<'PEOF'
{
  "name": "hairtech-executor",
  "version": "1.0.0",
  "main": "executor.js",
  "type": "commonjs",
  "scripts": { "start": "node executor.js" },
  "dependencies": { "express": "^4.18.3", "dotenv": "^16.4.5" }
}
PEOF

cat > executor.js <<'EOFJS'
require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3099;
const TOKEN = process.env.EXECUTOR_TOKEN;
if (!TOKEN) { console.error('ERRO: EXECUTOR_TOKEN ausente'); process.exit(1); }

const COMMANDS = {
  health: 'echo "executor-ok" && date && hostname',
  whoami: 'whoami && pwd && hostname',
  disk: 'df -h',
  memory: 'free -h',
  uptime: 'uptime',
  docker_ps: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
  docker_ps_all: 'docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
  docker_networks: 'docker network ls',
  docker_volumes: 'docker volume ls',
  docker_images: 'docker images',
  traefik_logs: 'docker logs --tail=200 traefik-traefik-1 2>&1',
  av_logs: 'docker logs --tail=200 assistente-virtual 2>&1',
  openclaw_logs: 'docker logs --tail=200 hairtech-openclaw 2>&1',
  ana_logs: 'docker logs --tail=200 whatsapp-ana 2>&1',
  postgres_logs: 'docker logs --tail=200 hairtech-postgres 2>&1',
  ollama_logs: 'docker logs --tail=200 ollama 2>&1',
  list_opt: 'ls -lah /opt',
  list_root: 'ls -lah /root',
  list_nodejs: 'ls -lah /home/user/nodejs',
  cat_compose: 'cat /home/user/nodejs/docker-compose.yml',
  cat_autoapply: 'cat /home/user/nodejs/auto-apply.sh',
  check_ports: 'ss -tulpn',
  os_release: 'cat /etc/os-release',
  git_log: 'cd /home/user/nodejs && git log -20 --oneline',
  git_status: 'cd /home/user/nodejs && git status',
  cron_list: 'ls -lah /etc/cron.d/',
  cron_autodeploy: 'cat /etc/cron.d/hairtech-autodeploy 2>/dev/null || echo "nao existe"',
  cron_noturno: 'cat /etc/cron.d/hairtech-noturno 2>/dev/null || echo "nao existe"',
  cron_proactive: 'cat /etc/cron.d/hairtech-proactive 2>/dev/null || echo "nao existe"',
  tail_autodeploy: 'tail -100 /var/log/hairtech-autodeploy.log 2>/dev/null || echo "sem log"',
  tail_noturno: 'tail -100 /var/log/hairtech-noturno.log 2>/dev/null || echo "sem log"',
  tail_vasculhar: 'tail -100 /var/log/hairtech-vasculhar.log 2>/dev/null || echo "sem log"',
  tail_healthcheck: 'tail -100 /var/log/hairtech-healthcheck.log 2>/dev/null || echo "sem log"',
  status_json: 'cat /home/user/nodejs/status.json 2>/dev/null || echo "{}"',
  vasculhamento_json: 'cat /home/user/nodejs/data/vasculhamento.json 2>/dev/null || echo "{}"',
  flags_check: 'ls -lah /home/user/nodejs/*.flag 2>/dev/null || echo "sem flags"',
  flag_anthropic_ready: 'ls -lah /opt/hairtech-openclaw/ANTHROPIC_READY.flag 2>/dev/null || echo "ausente"'
};

function buildCommand(action, params = {}) {
  if (COMMANDS[action]) return COMMANDS[action];

  if (action === 'docker_logs') {
    const c = String(params.container || '').trim();
    const tail = Number(params.tail || 200);
    if (!/^[a-zA-Z0-9_.-]+$/.test(c)) throw new Error('container invalido');
    if (!Number.isInteger(tail) || tail < 1 || tail > 1000) throw new Error('tail invalido');
    return `docker logs --tail=${tail} ${c} 2>&1`;
  }
  if (action === 'docker_inspect') {
    const c = String(params.container || '').trim();
    if (!/^[a-zA-Z0-9_.-]+$/.test(c)) throw new Error('container invalido');
    return `docker inspect ${c}`;
  }
  if (action === 'docker_exec_read') {
    // executar comando READ-ONLY dentro de container
    const c = String(params.container || '').trim();
    const cmd = String(params.cmd || '').trim();
    if (!/^[a-zA-Z0-9_.-]+$/.test(c)) throw new Error('container invalido');
    // Whitelist de comandos seguros
    const READ_ONLY = /^(ls|cat|head|tail|wc|grep|find|du|df|ps|env|node -v|npm -v|date|hostname|whoami|pwd)( |$)/;
    if (!READ_ONLY.test(cmd)) throw new Error('cmd nao permitido (so read-only)');
    if (/[;&|`$><]/.test(cmd)) throw new Error('caracteres nao permitidos');
    return `docker exec ${c} sh -c '${cmd}'`;
  }
  if (action === 'list_dir') {
    const dir = String(params.dir || '').trim();
    const allowed = ['/opt', '/root', '/home/user/nodejs', '/var/log'];
    if (!allowed.some(p => dir === p || dir.startsWith(p + '/'))) throw new Error('dir nao permitido');
    if (/[;&|`$.]\./.test(dir) || /[;&|`$]/.test(dir)) throw new Error('caracteres invalidos');
    return `ls -lah ${dir}`;
  }
  if (action === 'cat_file') {
    const file = String(params.file || '').trim();
    const allowed = ['/opt/hairtech-executor', '/opt/hairtech-openclaw', '/home/user/nodejs', '/var/log'];
    if (!allowed.some(p => file === p || file.startsWith(p + '/'))) throw new Error('arquivo fora dos paths');
    if (file.endsWith('.env')) throw new Error('.env bloqueado');
    if (/[;&|`$]/.test(file) || file.includes('..')) throw new Error('caracteres invalidos');
    const ext = ['.js', '.json', '.yml', '.yaml', '.md', '.txt', '.log', '.sh'];
    if (!ext.some(e => file.endsWith(e))) throw new Error('extensao nao permitida');
    return `cat ${file}`;
  }
  if (action === 'pg_query_read') {
    // SELECT somente, contra hairtechdb
    const sql = String(params.sql || '').trim();
    if (!/^SELECT /i.test(sql)) throw new Error('apenas SELECT permitido');
    if (sql.length > 500) throw new Error('SQL muito longa');
    if (/[;]/.test(sql.slice(0, -1))) throw new Error('multiplos statements bloqueados');
    if (/(DROP|DELETE|UPDATE|INSERT|ALTER|GRANT|TRUNCATE|CREATE)/i.test(sql)) throw new Error('SQL destrutiva bloqueada');
    const esc = sql.replace(/'/g, "'\\''");
    return `docker exec hairtech-postgres psql -U hairtech -d hairtechdb -t -c '${esc}'`;
  }

  throw new Error(`acao nao permitida: ${action}`);
}

function auth(req, res, next) {
  const a = req.headers.authorization || '';
  if (a !== `Bearer ${TOKEN}`) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  next();
}

app.get('/', (req, res) => {
  res.json({
    ok: true, service: 'hairtech-executor', status: 'online',
    actions: Object.keys(COMMANDS).concat(['docker_logs', 'docker_inspect', 'docker_exec_read', 'list_dir', 'cat_file', 'pg_query_read'])
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/run', auth, (req, res) => {
  const t0 = new Date().toISOString();
  try {
    const { action, params } = req.body || {};
    if (!action) return res.status(400).json({ ok: false, error: 'action ausente' });
    const command = buildCommand(action, params || {});
    exec(command, { timeout: 30000, maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
      const t1 = new Date().toISOString();
      if (err) return res.status(500).json({ ok: false, action, startedAt: t0, finishedAt: t1, error: err.message, stdout, stderr });
      return res.json({ ok: true, action, startedAt: t0, finishedAt: t1, stdout, stderr });
    });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Executor online porta ${PORT}`));
EOFJS

cat > docker-compose.yml <<'DEOF'
services:
  hairtech-executor:
    image: node:20-alpine
    container_name: hairtech-executor
    restart: unless-stopped
    working_dir: /app
    command: sh -c "npm install --omit=dev && npm start"
    env_file: [.env]
    volumes:
      - /opt/hairtech-executor:/app
      - /var/run/docker.sock:/var/run/docker.sock
      - /opt:/host_opt:ro
      - /home/user/nodejs:/host_nodejs:ro
      - /var/log:/host_log:ro
    ports: ["3099:3099"]
DEOF

docker compose down 2>/dev/null || true
docker compose up -d

sleep 5

echo ""
echo "============================================================"
echo "EXECUTOR INSTALADO"
echo "============================================================"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep hairtech-executor || true
echo ""
echo "TOKEN (anote e mande pra Claude Code Web):"
echo "${EXECUTOR_TOKEN}"
echo ""
echo "URL pra testar localmente:"
echo "curl http://127.0.0.1:3099/health"
echo ""
echo "URL externa (se firewall permite porta 3099):"
echo "http://72.62.100.6:3099/run"
echo ""
echo "ABRIR FIREWALL PRA 3099 (opcional, expor pra internet):"
echo "ufw allow 3099/tcp"
echo ""
echo "============================================================"
echo "PROXIMO PASSO"
echo "============================================================"
echo "Mande pra Claude Code Web no chat:"
echo ""
echo "EXECUTOR_URL=http://72.62.100.6:3099"
echo "EXECUTOR_TOKEN=${EXECUTOR_TOKEN}"
echo ""
echo "Claude vai poder rodar diagnostico, ver logs, etc"
echo "============================================================"
