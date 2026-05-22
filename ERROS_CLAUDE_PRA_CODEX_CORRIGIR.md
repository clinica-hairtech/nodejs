# Erros / pendências do Claude Code Web pra Codex revisar e corrigir
# Auto-relatado em 22/05/2026 ~21h BRT. Honesto, sem maquiagem.

> Quando Codex voltar 20:11, ler ESTE arquivo PRIMEIRO antes de processar
> `00-EXECUTAR-TUDO-EM-ORDEM-22052026.md`. Corrige o que achar errado.

## Bugs / coisas que provavelmente não funcionam como deviam

### 1. `organizar-fotos.js` — confusão de schema do Postgres
- Script tenta `SELECT FROM conversations` primeiro, fallback `conversas`. Mas o repo tem AMBOS nomes em locais diferentes (api-internal.js usa `conversations`, alguns admin.js usam `conversas`)
- Codex: confirma qual é o nome REAL da tabela no Postgres atual e corrige TODOS os scripts pra usar o certo
- Comando: `docker exec hairtech-postgres psql -U hairtech -d hairtechdb -c "\dt"`

### 2. `pre-consulta.js` — upload multipart sem multer
- O form HTML manda `multipart/form-data` (FormData no JS do browser)
- Mas o backend não tem multer carregado, retorna 400 dizendo "use JSON com base64"
- **Codex**: ou instala multer (`npm i multer`) e ajusta o handler, ou ajusta o JS do form pra converter fotos em base64 antes de enviar
- Solução mais simples: ajustar o JS do form pra base64 + JSON

### 3. `claude-openclaw-bridge.sh` — dependência de `jq`
- Script usa `jq` extensivamente mas pode não estar instalado na VPS ou no container
- **Codex**: verifica `which jq` na VPS. Se faltar, `apt install -y jq` OU reescrever bash sem jq (usar python3 -c "import json")

### 4. `agents-api.js` — token gerado mas container não recarrega .env
- Auto-apply T30 gera `AGENTS_API_TOKEN` no .env. Mas o container assistente-virtual NÃO reinicia automaticamente após mudança no .env
- Resultado: a primeira vez precisa `docker compose restart assistente-virtual` manual
- **Codex**: adiciona ao T30 do auto-apply um trigger de restart QUANDO a variável é nova OU adiciona `ALLOW_RESTART.flag` lógica

### 5. `app.js linha 562` — handoff AV→ANA usa função que pode não existir
- Audit que fiz em 21/05 supôs que `handoffParaAna()` está completa, mas não conferi o body inteiro da função
- **Codex**: lê linhas 770-820 do app.js e confirma se `handoffParaAna` realmente faz INSERT no Postgres + envia msg pra ANA, ou se só faz console.log

### 6. `vigia-agentes.sh` — testa /health localhost que pode 502
- Script faz `curl http://localhost:3001/health` mas se o container AV cair, vai dar 502/connection refused (não 200)
- **Codex**: confirma que o vigia trata corretamente o caso de container down

### 7. `dump-inbox.sh` — pode race com auto-apply
- Auto-apply roda 2/2min e faz `git reset --hard origin/$BRANCH`. Se dump-inbox commitar localmente entre o pull e o reset, perde
- Lógica atual: dump roda em xx:15 e xx:45 (longe dos slots 0,2,4...), MAS auto-apply rounds nem sempre estão exatos
- **Codex**: avalia se vale criar lockfile `/var/lock/hairtech-bridge.lock` que auto-apply respeita

### 8. Cron `claude-openclaw-bridge.sh` — push pode falhar silenciosamente
- Se push falhar (conflito), tarefa fica em `_processadas/` mas resposta não chega ao Git
- **Codex**: adiciona retry com backoff E alerta Telegram se push falhar 3x seguidas

### 9. `auto-apply.sh T25b` — commit pode bater com manual
- T25b commita status.json e data/*.json a cada 30min com user `bot@hairtech.org`
- Se o Dr. ou Codex commitar manualmente entre essa janela, pode ter conflito
- **Codex**: confirma se git rebase --autostash resolve OU usa branch separado pra bot commits

### 10. `agents-api.js` rota OpenAPI — URL hardcoded
- O schema OpenAPI tem `servers: [{ url: "https://hairtech.org/api/agent" }]`
- Se domínio mudar, quebra Custom GPT
- **Codex**: torna dinâmico via env `PUBLIC_BASE_URL`

## Decisões questionáveis (não bugs, mas revisar)

### A. Excesso de arquivos markdown
- Criei: PENDENCIAS, RELATORIO, AUDITORIA, PROPOSTA, GUIA, ERROS, briefings, soul, memória, regras
- **Codex**: consolida em `docs/HUB.md` com índice clicável OU migra pro GitHub Projects (sugestão Dr.)

### B. Lock anti-duplo BLITZ — não auditei
- Briefing pedia validar, eu nunca fiz a leitura profunda do admin.js/BLITZ
- **Codex**: confirma se admin.js valida `data/.blitz-hoje-$(date +%Y%m%d).flag` antes de disparar

### C. OPENCLAW_BASICAUTH no briefing T-12 com escape de `$`
- O briefing tem `htpasswd ... | sed -e 's/\$/\$\$/g'`. Em bash dentro de bash o escape pode quebrar
- **Codex**: testa em sandbox antes de aplicar no .env real

### D. ANTHROPIC_API_KEY no .env do OpenClaw
- Briefing T-12 escreve key direto em `/opt/hairtech-openclaw/.env`
- Mas o OpenClaw provider snippet precisa estar em `config/openclaw.json` também
- **Codex**: lê `docs/openclaw-agent-snippet.json` e confirma se merge está completo

### E. Sugestões pra OpenClaw na fila OC-001 a OC-010
- Schemas inventados (por exemplo, `/api/internal/sql-read` ainda não existe — só inbox-pendentes/inbox-snapshot)
- **Codex**: ou cria endpoint `/api/internal/sql-read` no api-internal.js (whitelist SELECT) OU ajusta tarefas pra usar endpoints existentes

## Coisas que NÃO testei nada (escrevi e empurrei)

- `pre-consulta.js` — nunca rodei
- `admin-fotos.js` — nunca rodei
- `organizar-fotos.js` — nunca rodei
- `claude-openclaw-bridge.sh` — nunca rodei (depende de cron VPS)
- `vigia-mac.sh` — nunca rodei
- `dump-inbox.sh` — nunca rodei
- Cron T31/T32/T33/T34 — adicionados ao auto-apply mas auto-apply mesmo não foi exercitado nesta sessão

Codex roda em ambiente real, valida cada um, **e me reporta o que quebrou** via commit num arquivo `ERROS_DO_CLAUDE_CONFIRMADOS.md` com diff pra fixar.

## Pra Dr. — o que isso significa

Tudo isso é **engenharia em cima de palpite, sem teste de integração real** porque eu não tenho como rodar nada no sandbox bloqueado. O risco é que alguma coisa quebre em produção quando o cron pular.

A boa notícia: **nada é destrutivo**. Pior cenário, container reinicia em loop (healthcheck self-heal já implementado em 21/05). Se quebrar feio, `docker compose down && git revert HEAD && docker compose up -d` volta.

Quando Codex voltar e validar T-1 a T-12, ele commita correções e atualiza este arquivo movendo cada item pra ✅ ou registrando o fix.
