'use strict';
const http = require('http');
const { exec } = require('child_process');
const fs   = require('fs');

const PORT           = 3099;
const LOG_FILE       = '/root/hairtech-executor/executor.log';
const APPROVAL_TOKEN = process.env.APPROVAL_TOKEN || 'hairtech-exec-2026';

// ─── ALLOWLIST ────────────────────────────────────────────────────────────────
const ALLOWLIST = [
  /^docker ps(\s+--format\s+[^\s;|&]+)?$/,
  /^docker logs\s+[\w-]+((\s+--tail\s+\d+)?(\s+2>&1)?)?$/,
  /^docker inspect\s+[\w-]+$/,
  /^docker restart assistente-virtual$/,
  /^docker exec assistente-virtual (ls|cat|head|grep|sed -n)\s+[\w\s./"-]+$/,
  /^curl\s+-s\s+https?:\/\/hairtech\.org\/(health|webhook(\?[^\s;|&]*)?)$/,
];

// ─── BLOCKLIST (sempre bloqueado, independente da allowlist) ──────────────────
const BLOCKLIST = [
  /\brm\b/i,
  /\bprune\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\bformat\b/i,
  /chmod\s+777/i,
  /--volumes/i,
  /\btruncate\b/i,
  /\bmkfs\b/i,
  /\bdd\b.*\bif=/i,
  /[;|&`$()]/,          // impede encadeamento de comandos
  /\.\.\//,             // impede path traversal
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  process.stdout.write(line);
}

function check(cmd) {
  for (const b of BLOCKLIST) {
    if (b.test(cmd)) return { ok: false, reason: `BLOQUEADO pela blocklist: ${b}` };
  }
  for (const a of ALLOWLIST) {
    if (a.test(cmd.trim())) return { ok: true };
  }
  return { ok: false, reason: 'BLOQUEADO: comando não está na allowlist' };
}

// ─── SERVIDOR ─────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET' && req.url === '/health') {
    return send(200, { status: 'online', port: PORT });
  }

  if (req.method !== 'POST' || req.url !== '/run') {
    return send(404, { error: 'Not found' });
  }

  // Verificar token
  if (req.headers['x-approval-token'] !== APPROVAL_TOKEN) {
    log(`REJEITADO token invalido — IP: ${req.socket.remoteAddress}`);
    return send(401, { error: 'Token de aprovação inválido' });
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let command;
    try { command = JSON.parse(body).command; } catch {
      return send(400, { error: 'JSON inválido' });
    }
    if (!command || typeof command !== 'string') {
      return send(400, { error: 'Campo "command" obrigatório' });
    }

    const result = check(command);
    if (!result.ok) {
      log(`BLOQUEADO: "${command}" — ${result.reason}`);
      return send(403, { error: result.reason, command });
    }

    log(`EXECUTANDO: "${command}"`);
    exec(command, { timeout: 30000, shell: '/bin/sh' }, (err, stdout, stderr) => {
      const output = (stdout + stderr).slice(0, 8000);
      const status = err ? 'ERRO' : 'OK';
      log(`${status} (exit ${err ? err.code : 0}): "${command}"`);
      send(200, { command, status, output, exitCode: err ? (err.code || 1) : 0 });
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`HairTech Executor ONLINE — porta ${PORT} — apenas localhost`);
});

process.on('uncaughtException', err => log(`ERRO FATAL: ${err.message}`));
