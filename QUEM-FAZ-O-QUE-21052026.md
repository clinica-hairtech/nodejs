# Divisão de responsabilidades — 21/05/2026 madrugada

Pra Dr. Ricardo (vai ler quando acordar). Sem rodeio.

## Hierarquia operacional

```
DR. RICARDO (decisor)
    ↓
CODEX no Mac (executor com browser + filesystem) ← VOCÊ COLA prompt
    ↓
CLAUDE CODE WEB (eu, escreve código + briefings) ← VOCÊ MANDA mensagem
    ↓
SISTEMA AUTÔNOMO (cron VPS + agente noturno)    ← roda sozinho 24/7
    ↓
ANA + AV bots                                    ← atendimento WhatsApp
```

## Quem faz o quê — sem ambiguidade

| Agente | O que faz BEM | Como invocar |
|---|---|---|
| **Dr. Ricardo** | Decisões clínicas, ligações pra pacientes, autorizar dialogs | sua intuição médica |
| **Codex** (no Mac) | Bash, mv arquivos, instala apps, browser via Chrome, AppleScript | Dr. cola prompt |
| **Claude Code Web** (eu) | Escreve código, commits Git, MCP Drive/Gmail/GitHub | Dr. manda mensagem |
| **Agente noturno** (na VPS 24/7) | Responde Telegram, decide IA, executa tarefas | Telegram bot |
| **AV bot** | WhatsApp Cloud +5521993542383 | automático 24/7 |
| **ANA bot** | WhatsApp pessoal +5521967813366 (vendas) | automático 24/7 |
| **Cron VPS** | vasculhar, backup, relatório, BLITZ | horário agendado |
| **Manus** | Browser real, computer use, tarefas complexas externas | $$ — só último recurso |
| **ChatGPT** (web) | conversa Dr. via chat.openai.com | Dr. abre browser |
| **Gemini** | fallback IA quando outras pagam caro | API |

## Comunicação entre agentes (blackboard)

```
┌─ Git ───────── todos leem briefings, código, status
├─ Drive ───── memória central, credenciais, exports
├─ Telegram ── @HairTechBot avisa Dr. + recebe comandos
├─ Postgres ── conversas, agendamentos, pacientes
└─ Webhook Mac ─ Claude → Codex (quando Codex configurar)
```

**NÃO existe comunicação direta entre IAs de empresas diferentes.**
Coordenação só via blackboard acima.

## O que EU (Claude Code Web) NÃO POSSO fazer

- ❌ Ser "chamado" automaticamente
- ❌ Acessar Mac do Dr.
- ❌ Acessar iPhone
- ❌ Login em ChatGPT/Google/qualquer site
- ❌ Histórico do ChatGPT do Dr. (precisa Export Data manual ou Codex)
- ❌ Acordar Codex remotamente

## O que EU FAÇO BEM (e estou fazendo agora)

- ✅ Escrever código → push Git → cron VPS aplica
- ✅ MCP Drive (criar/ler arquivos)
- ✅ MCP GitHub
- ✅ Coordenar briefings pros outros agentes
- ✅ Sintetizar info de várias fontes

## Prioridade NÚMERO 1 — Super endividamento

```
Dinheiro entrando → BLITZ 9h (pacientes despertados) → 2 cirurgias = R$16-20k
Dinheiro NÃO saindo → vasculhar cobranças → bloquear/responder padrão
```

## Vasculhar histórico ChatGPT (dos anos da clínica)

ChatGPT NÃO tem API que liste conversas históricas do chat.openai.com.
Caminhos reais:

1. **Export Data** (recomendado): Dr. abre chatgpt.com → Settings → Data Controls → Export Data → recebe ZIP por email em 24-48h
2. **Codex via Chrome** (amanhã): Codex automatiza navegação no chatgpt.com com cookies cacheados do Dr.
3. **ChatGPT Memory API** (limitada): só lê "Memory" persistente, não conversas

A real: **só Export Data é confiável.** Vou criar tarefa no Codex pra disparar export amanhã.

## ANA funcionando — confirmação

ANA tá pareada via WAHA (confirmado MEMORIA_CENTRAL v4.2 19/05):
- engine.state: CONNECTED
- Sessão default WORKING
- Número +5521967813366

Próxima manhã 7h45 — relatório Telegram vai dizer se algo mudou.
