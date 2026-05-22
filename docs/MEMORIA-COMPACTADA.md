# MEMÓRIA COMPACTADA — HairTech AI
# Atualizada: 2026-05-22 (sessão Claude Code Web pós-compactação)

> **PARA O PRÓXIMO CLAUDE / CODEX / MANUS:** ler nesta ordem:
> 1. **`PENDENCIAS_22052026_CONSOLIDADO.md`** — fonte única do que falta fazer
> 2. Este arquivo (memória técnica)
> 3. `CLAUDE.md` (regras permanentes)
> 4. `AUDITORIA_AV_ANA_P0_RESPOSTA.md` (estado clínico/jurídico do AV)
> 5. `docs/PROTOCOLO_MULTI_AGENTES.md` (como agentes coordenam via blackboard)

---

## SNAPSHOT 22/05/2026

### Infra
| Componente | Estado | Notas |
|---|---|---|
| VPS Hostinger KVM 4 | UP | 4 vCPU, 16GB RAM, 200GB. Vence 17/06 auto-renew |
| AV `assistente-virtual` | UP em prod (verificar via vigia) | Porta 3001, Cloud API +5521993542383 |
| ANA `whatsapp-ana` | CONNECTED | WAHA WEBJS, +5521967813366 |
| OpenClaw `hairtech-openclaw` | UP | claw.hairtech.org, agente hairtech-orquestrador instalado |
| Postgres `hairtech-postgres` | UP | DB `hairtech`, SSL=off |
| Traefik | UP | hairtech.org + claw.hairtech.org |
| Ollama VPS | UP | qwen2.5:7b-instruct + 3b + 14b |
| Ollama Mac (Dr.) | UP | gemma3:4b (3.2GB) |

### Branch ativa
`claude/hairtech-whatsapp-ai-liD5V` — cron auto-apply pulla a cada 2min e roda `auto-apply.sh`.

### Cron VPS instalado (status 22/05)
- **2/2min**: auto-apply.sh (git pull + rebuild se mudou) → escreve status.json
- **02h**: vasculhar-ollama.js (analisa WhatsApp pessoal, gera vasculhamento.json)
- **03h**: backup snapshot
- **09h**: BLITZ disparos pacientes existentes
- **09h/13h/18h**: relatório matinal + relatórios proativos
- **30/30min**: vigia-agentes.sh (vigilância contínua) **NOVO 22/05**
- **xx:15 / xx:45**: dump-inbox.sh (snapshot inbox AV pro repo) **NOVO 22/05**

### Endpoints públicos
- `hairtech.org` — AV (webhook Cloud API)
- `hairtech.org/admin?senha=hairtech2026` — painel completo (conversas, kanban, export)
- `hairtech.org/admin/export?senha=hairtech2026` — export leads
- `hairtech.org/admin/investigacao?senha=hairtech2026` — vasculhar WhatsApp pessoal
- `hairtech.org/api/internal/*` — Bearer `INTERNAL_API_TOKEN` (10+ rotas REST)
- `hairtech.org/api/agent/chat` — **ponte multi-agente** Bearer `AGENTS_API_TOKEN` **NOVO 22/05**
- `hairtech.org/api/agent/openapi.json` — schema pra ChatGPT Custom GPT
- `claw.hairtech.org` — OpenClaw UI (Dr. abre)

### Endpoints novos da inbox 22/05
- `GET /api/internal/inbox-pendentes?limite=50` — conversas com última msg do cliente sem resposta
- `GET /api/internal/inbox-snapshot` — snapshot compacto de até 500 conversas
- `data/inbox-pendentes.json` no repo — atualizado a cada 1h pelo dump-inbox.sh (Claude/Codex leem do Git)
- `data/inbox-snapshot.json` no repo — idem

---

## CORREÇÕES DE AUDITORIAS ANTERIORES

A `AUDITORIA_AV_ANA_P0_RESPOSTA.md` (21/05) listava como gaps:
- Handoff AV → ANA estruturado → **JÁ EXISTE** em app.js linha 562 (`[HANDOFF_ANA]`) + função `handoffParaAna` linha 775
- Regex transplante incompleto (coroa/enxerto/folículos) → **JÁ EXISTE** em app.js linha 358 (regex completo)
- POS-FUE D+1/D+30 → **JÁ EXISTE** em `scripts/proactive-pos.js`

Gaps REAIS pendentes:
- Lock distribuído AV ↔ ANA (evitar duplo-envio) — baixa prioridade
- Detector "foto incompleta" via Gemini Vision comparativo — média prioridade
- Pré-consulta inteligente (form + foto + IA) — pendente, não iniciado

---

## VARIÁVEIS DE AMBIENTE CRÍTICAS

```
WA_TOKEN=...                  # WhatsApp Cloud API (AV) - renovar quando expirar
WA_PHONE_ID=983992428140920   # Phone ID AV
WHATSAPP_ANA_KEY=...          # Auth WAHA ANA
GEMINI_API_KEY=...            # Fallback IA (billing fix pendente)
OPENAI_API_KEY=...            # Fallback 2 (no .env)
ANTHROPIC_API_KEY=...         # OpenClaw + Claude pesado (precisa Dr. adicionar)
INTERNAL_API_TOKEN=...        # API interna AV-OpenClaw (Bearer)
AGENTS_API_TOKEN=...          # Ponte multi-agente (auto-gerado T30) NOVO 22/05
AGENTS_API_LIMITE=10          # BRL/dia limite, default R$10
OPENCLAW_GATEWAY_TOKEN=...    # OpenClaw HTTP
TELEGRAM_BOT_TOKEN=8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ
TELEGRAM_CHAT_ID=8713631351
```

---

## REGRAS PERMANENTES (resumo CLAUDE.md)

1. **Backup antes de modificar** arquivo crítico
2. **NUNCA sed -i 2x** no mesmo arquivo (usar Python ou cat << EOF)
3. **NUNCA push pra main** — só `claude/hairtech-whatsapp-ai-liD5V`
4. **NUNCA commitar .env**
5. **Engine WAHA = WEBJS** (NOWEB cai em loop)
6. **set +H** antes de scripts bash com `!`
7. **URLs em JS**: `"ht"+"tp"+"://..."` pra evitar auto-link terminal
8. **Não tocar traefik** sem aprovação
9. **Hostinger terminal**: comandos ≤1000 chars

---

## OBSERVAÇÃO PERMANENTE — LIMITAÇÃO CLAUDE CODE WEB

Eu (Claude Code Web do sandbox Anthropic) **não tenho navegador funcional**.
- WebFetch a hairtech.org / claw.hairtech.org / api.openai.com → **403 Forbidden** (allowlist do sandbox)
- Não consigo "ver pelo navegador" o `/admin` do AV nem o OpenClaw
- **Solução em vigor**: tudo que precisar ser visto, dumpar pra Git via API interna
  - Inbox AV → `data/inbox-pendentes.json` (dump-inbox.sh)
  - Status sistema → `status.json` (auto-apply.sh)
  - Vasculhamento WhatsApp → `data/vasculhamento.json`
  - Crm fila → `data/crm-fila.json`

Quem TEM navegador: **Dr. Ricardo** (qualquer browser) + **Codex** (Chrome no Mac com login cacheado) + **Manus** (Computer Use cloud).

---

## HISTÓRICO RESUMIDO

### 12/05 — handler webhook ANA quebrado, WAHA WEBJS, db.js SSL, monitor-ana
### 13/05 — ANA reconectada via QR, Gemini 2.5-flash
### 14/05 — `/admin/export`, API interna 10 endpoints, OpenClaw integrado
### 17/05 — auto-apply v1-v8, Rounds 9-18 (workspaces 13 agentes, CFM compliance, integrações skeleton, ambiente virtual, OpenClaw architecture viz, agentes pró-ativos)
### 19/05 — Codex instalou Ollama+gemma3:4b no Mac, Manus tentou integrar Ollama OpenClaw (rollback)
### 20/05 — Codex criou DOCX contrato/reembolso, corrigiu valores
### 21/05 — auditoria P0 clínico/jurídico/doc implementada, agente noturno 24/7, watchdog
### 22/05 (hoje) — Dossiê superendividamento, Executor HTTP, **ponte multi-agente** `/api/agent/chat`, **vigia-agentes** + **vigia-mac**, **dump-inbox**, **notificação extrajudicial template**, briefing Manus envio, MEMORIA atualizada

### Commits 22/05
- `725e0cc` — dossiê + triagem-cobranças
- `182125c` — Executor HTTP
- `c28eb2f` — ponte multi-agente
- `e7577df` — auto-apply T30 (AGENTS_API_TOKEN)
- `7dbf565` — vigia + notificação + inbox dump + PENDENCIAS
- (próximo) — vigia-mac + dump-inbox cron + memoria atualizada
