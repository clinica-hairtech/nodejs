# Protocolo de comunicação multi-agentes — HairTech

Como Claude (Code Web) + Codex + ChatGPT + Gemini + Manus + OpenClaw se coordenam SEM precisar conversar diretamente.

## A verdade técnica

**Nenhum produto de IA permite chat direto entre sessões de outro produto.** Anthropic não conversa com OpenAI, Codex não chama Gemini etc. Cada um roda isolado por design (segurança/comercial).

**Mas todos podem ler/escrever no mesmo lugar.** Esse lugar é o **blackboard compartilhado**:

```
                    BLACKBOARD COMPARTILHADO
                    ─────────────────────────
                              ↓
      ┌─────────┬─────────┬─────────┬─────────┐
      │         │         │         │         │
   Google      Git       Telegram  Webhook  Postgres
   Drive      Repo       Bot      Mac/VPS    DB
   (MCP)      (HTTPS)    (Bot)    (HTTPS)   (TCP)
      ↑         ↑         ↑         ↑         ↑
      │         │         │         │         │
   Claude    Claude     TODOS     Claude    AV/ANA
   Code      Code Web   leem/     Code Web   bot
   Web                  escrevem
              ↑         ↑                     ↑
              │         │                     │
            Codex      Codex                Codex
              ↑         ↑                     ↑
              │         │                     │
            ChatGPT  ChatGPT
            (web)    (web)
              ↑
              │
            Gemini
              ↑
              │
            Manus
```

## Quem lê/escreve o quê

| Agente | Onde mora | Lê | Escreve | Como coordena |
|---|---|---|---|---|
| **Claude Code Web** (eu) | Sandbox Anthropic | Drive MCP, Git, MCP github, webhook Mac, Postgres via AV | Git commits, Drive, Telegram | Lê briefings, escreve códigos |
| **Codex** | Mac do Dr. | Filesystem Mac, Drive, Git | Mac files, Drive, Git, webhook Mac | Recebe briefing via Git, executa local |
| **ChatGPT (web)** | chat.openai.com | Memória dele, Drive (via Manus), web | Web (manual cola) | Dr. é ponte humana hoje |
| **Gemini (web)** | gemini.google.com | Drive (autorizado), web | Web | Mesmo modelo de ChatGPT |
| **Manus** | Cloud Manus | Web, browser, Drive, GitHub | Anywhere | Recebe briefing tight, executa |
| **OpenClaw VPS** | claw.hairtech.org | Postgres, AV, ANA, Telegram | DB, WhatsApp, Telegram | Orquestra agentes da clínica |
| **OpenClaw Mac** | localhost:18790 do Mac | Mac files, Ollama local, Drive | Mac files, Telegram, peer VPS | Roda agentes locais grátis |
| **AV bot** | container assistente-virtual VPS | DB, WhatsApp Cloud API | DB, WhatsApp | Atende pacientes 24/7 |
| **ANA bot** | container whatsapp-ana VPS | DB, WAHA | WhatsApp ANA | Vendas/follow-up |

## Mensagens entre agentes — convenções

### 1. Briefing (humano → agente)

```
/home/user/nodejs/codex-briefings/YYYYMMDD-HHMM-tarefa.md
/home/user/nodejs/manus-briefings/YYYYMMDD-HHMM-tarefa.md
```

Formato: TAREFA + OBJETIVO + COMANDOS numerados + RETORNAR. Sem contexto narrativo.

### 2. Status compartilhado (agente → todos)

```
status.json no repo Git (atualizado a cada execução do auto-apply.sh)
+
data/vasculhamento.json (Ollama gera)
+
data/incidentes.json
+
data/handoff-queue.json
+
crm-fila.json
```

Todos os agentes podem ler estes arquivos para saber estado atual.

### 3. Mensagem efêmera (agente → Dr.)

Telegram bot `@HairTechBot`. Token + chat_id no .env. Qualquer agente pode `curl POST` pra avisar Dr.

### 4. Comando remoto (Claude Code Web → Mac)

Webhook Mac instalado pelo Codex (briefing `20260521-0145-organizar-mac.md`):
- URL: `https://<aleatorio>.trycloudflare.com/exec`
- Secret: gerado por Codex, salvo no Drive
- Whitelist: 11 comandos read-only/move
- Claude Code Web chama via axios → executa no Mac → retorna JSON

### 5. Trabalho em conjunto Claude + ChatGPT

Implementado em `/admin/dual-ai` (HTTP endpoint):
- Recebe pergunta crítica
- Chama Claude API (Anthropic) + GPT-4o API (OpenAI) em paralelo
- 3º modelo sintetiza
- Retorna 3 visões + consenso

Útil pra decisões CFM/LGPD/copy de venda. Custa R$0.05-0.15 por consulta.

### 6. Trabalho com Gemini

`integrations/gemini` já existe (Gemini 2.5 Flash usado no fallback do AV). Pra consulta avulsa: `/admin/dual-ai` pode ser estendido pra incluir Gemini também (tri-AI consult).

## Fluxos típicos coordenados

### Fluxo A — Captação noturna autônoma

```
02:00 BRT → Cron VPS dispara vasculhar-ollama.js
         → Ollama VPS analisa 200 chats do WhatsApp pessoal
         → Escreve data/vasculhamento.json
         → Telegram avisa Dr.
03:30 BRT → pg_dump do Postgres
07:45 BRT → relatorio-matinal.js lê vasculhamento.json
         → Telegram com TOP 10 priorizado
09:00 BRT → BLITZ dispara → mensagens saem
09:30 BRT → Telegram com resumo BLITZ
```

Nenhum humano envolvido. 4 agentes coordenando via arquivos JSON.

### Fluxo B — Decisão crítica multi-AI

```
Dr. tem dúvida CFM sobre uma copy
↓
Abre /admin/dual-ai e cola texto
↓
Sistema chama: Claude API + ChatGPT API simultâneo
↓
Sintetizador (Claude) analisa convergência/divergência
↓
Dr. vê 3 colunas: Claude, ChatGPT, Síntese
↓
Decide com base em consenso ou divergência
```

### Fluxo C — Codex no Mac executa briefing de Claude

```
Claude Code Web cria briefing em codex-briefings/
↓
Commit + push pro Git
↓
Dr. copia link do Git e cola no Codex (aberto no Mac)
↓
Codex lê do Git raw, executa bash local
↓
Codex commita resultado em git (ou Drive)
↓
Claude Code Web lê resultado na próxima sessão
```

### Fluxo D — Computer Use pra cadastros externos

```
Dr. pede pra criar conta em algum site
↓
Claude Code Web chama Anthropic Computer Use API
↓
Anthropic abre VM Linux + Firefox na nuvem deles
↓
Claude (no VM) navega, preenche, submete
↓
Se CAPTCHA/2FA: marca HANDOFF_NEEDED
↓
Telegram avisa Dr. pra resolver no celular
↓
Claude continua de onde parou
```

## O que NÃO existe (vamos parar de tentar)

❌ **Claude Code Web não tem navegador** → não acessa chat.openai.com diretamente
❌ **Sessões ChatGPT não persistem entre chamadas Computer Use** → cada login é fresco
❌ **Não dá pra "subscrever" eventos de chat de outro agente** → cada IA é caixa-preta
❌ **Não tem protocolo MCP universal** ainda → cada produto tem MCP separado

## Roadmap pra completar a malha de comunicação

| Quem instala | O quê | Quando | Bloqueio |
|---|---|---|---|
| Codex | Webhook Mac (briefing 0145) | Hoje à noite | Dr. cola no Codex |
| Codex | OpenClaw Mac (briefing 0200) | Hoje à noite | Idem |
| Claude Code Web | Integração tri-AI (Claude+ChatGPT+Gemini) em /admin/dual-ai | Próxima sessão | Sem bloqueio |
| Codex | Atualizar ChatGPT memória via web + Drive | Quando rodar | Sem bloqueio (Codex tem Chrome) |

Após esses 4 passos, todos podem se coordenar via blackboard (Drive + Telegram + Git + webhook).

## Acessar histórico ChatGPT do Dr.

Você pediu pra "ver histórico ChatGPT via navegador". Caminhos reais:

### A) Codex faz (tem Chrome no Mac com login dele cacheado)

Codex roda no Mac, abre `chat.openai.com` no Chrome via AppleScript, navega no histórico, exporta como JSON, salva no Drive. Eu leio depois.

Adicionar isso no briefing Codex: ver passo 11 abaixo.

### B) Manus faz

Browser remoto, login OpenAI, exporta. Custa crédito Manus.

### C) ChatGPT API com Memory

OpenAI tem API pra ler "Memory" do usuário (configurável no chat). Mas requer login OAuth interativo separado.

**Recomendação: Codex no Mac via Chrome do Dr. (cacheado). R$0.**

## Próximo passo executivo

1. Dr. cola briefings no Codex (organizar Mac + OpenClaw + webhook + extrair ChatGPT history)
2. Codex executa tudo em paralelo durante a noite
3. Manhã: Mac organizado, OpenClaw Mac up, webhook funcionando, ChatGPT history no Drive
4. Claude Code Web (eu) na próxima sessão: tenho acesso ao Mac via webhook + leio Drive

A partir daí, **eu deixo de ser inútil** porque tenho mãos no Mac via webhook.
