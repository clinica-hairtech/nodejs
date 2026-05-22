# Ponte ASSÍNCRONA Claude ↔ OpenClaw via Git

## Como funciona

Claude Code Web cria arquivos `*.req.json` aqui. Cron VPS roda
`scripts/cron/claude-openclaw-bridge.sh` a cada 1min, processa cada req,
escreve resposta em `data/openclaw-to-claude/*.res.json`, commita.

Claude lê resposta na próxima sessão (ou via Git pull).

## Tipos de request

### 1. sql_read (SELECT no Postgres)
```json
{
  "tipo": "sql_read",
  "query": "SELECT numero, nome, status FROM conversations WHERE updated_at > NOW() - INTERVAL '24 hours' LIMIT 50"
}
```
Bloqueio: só SELECT, sem verbos destrutivos.

### 2. shell_read (whitelist read-only)
```json
{ "tipo": "shell_read", "cmd": "ls -la /home/user/nodejs/data" }
{ "tipo": "shell_read", "cmd": "docker ps" }
{ "tipo": "shell_read", "cmd": "docker logs --tail 50 assistente-virtual" }
```
Whitelist: `ls cat head tail wc grep find du df hostname date uname uptime docker (logs/ps/inspect/exec read-only)`

### 3. ollama_query (chat com Ollama VPS, R$0)
```json
{
  "tipo": "ollama_query",
  "model": "qwen2.5:7b-instruct",
  "prompt": "Resume estes leads em 3 linhas: ..."
}
```

### 4. api_internal (GET no /api/internal/)
```json
{ "tipo": "api_internal", "path": "/inbox-pendentes?limite=20" }
{ "tipo": "api_internal", "path": "/metricas" }
{ "tipo": "api_internal", "path": "/relatorio-completo" }
```

### 5. waha_query (WAHA da ANA)
```json
{ "tipo": "waha_query", "endpoint": "/api/sessions/default" }
{ "tipo": "waha_query", "endpoint": "/api/default/chats?limit=20" }
```

### 6. openclaw_chat (chat com hairtech-orquestrador via API interna OpenClaw)
```json
{
  "tipo": "openclaw_chat",
  "prompt": "Processa fila data/openclaw-fila/tarefas-22052026.json"
}
```

## Latência

- 1min (cron rate) + 30s (rebuild/commit/push) = **~1.5min round-trip**
- Comparado com sessões Claude que custam tokens: ✅ R$0 e desbloqueia trabalho

## Naming convention

`<timestamp>-<descricao-curta>.req.json`

Exemplo: `20260522-2105-listar-leads-quentes.req.json` →
`data/openclaw-to-claude/20260522-2105-listar-leads-quentes.res.json`
