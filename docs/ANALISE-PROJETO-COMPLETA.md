# ANÁLISE PROFUNDA — Projeto HairTech AI
# Data: 14/05/2026 03:25 BRT
# Autor: Claude (sessão sandbox + repo)
# Para: continuação em qualquer chat/instância

---

## 1. BACKUP — TUDO SALVO?

✅ **Tudo no git** branch `claude/hairtech-whatsapp-ai-liD5V`, push validado.
✅ **Backups timestampados no VPS** em `/root/backups_av/` — o `deploy-openclaw-integracao.sh` salva antes de qualquer alteração crítica (visto no print: `/root/backups_av/openclaw-integ-20260514_051942/`).
✅ **Regra CLAUDE.md item 1**: backup antes de qualquer edição.

**O que NÃO está backuped** (responsabilidade externa):
- `.env` do AV no VPS (contém WA_TOKEN, GEMINI_API_KEY, INTERNAL_API_TOKEN) — só existe no servidor
- `.env` do OpenClaw — só no servidor
- Sessão WAHA WEBJS (`/home/user/nodejs/whatsapp-ana-data/sessions/`) — recriada a cada QR
- Dump completo do PostgreSQL — script `snapshot.sh` existe em `/opt/hairtech-openclaw/scripts/` mas **ainda não foi validado se está rodando no cron 3h** (P pendente)

**Ação recomendada (alta prioridade):** validar que `snapshot.sh` está no crontab e funciona.

---

## 2. POR QUE ANA NÃO RESPONDE — DIAGNÓSTICO COMPLETO

Dados observados nos prints anteriores:

| Camada | Estado | Evidência |
|--------|--------|-----------|
| WhatsApp Web (multi-device) | ✅ pareada | `me.id = 5521967813366@c.us`, `pushName = "Clínica HairTech"` |
| Engine WAHA WEBJS | ✅ CONNECTED | `engine.state: CONNECTED` |
| Webhook configurado | ✅ URL OK | `http://assistente-virtual:3001/webhook/ana` |
| Eventos chegando ao AV | ⚠️ só `session.status` | logs mostram `[ANA] webhook event="session.status"` repetido |
| Eventos `message` ao AV | ❌ zero | nenhum log `[ANA] msg de ...` |

**Hipótese principal:** a lista `events` do webhook está `["message","session.status"]`, mas o WAHA versão atual (latest) usa `message.any` como nome do evento de inbound. O AV não está recebendo notificação de mensagem real porque o WAHA não dispara `message` — só `session.status`.

**Outras hipóteses (em ordem de probabilidade):**
1. **Nome do evento errado** — lista deveria incluir `message.any`, `message`, `message.waiting`
2. WAHA recebe a mensagem mas filtro interno descarta antes do webhook
3. WhatsApp não está entregando para o linked device WAHA (raro, mas possível em multi-device)
4. Handler `/webhook/ana` em `app.js` tem regex que filtra demais (mas é permissivo: `if (!event || /status|ack|reaction|session|typing/i.test(event))` — `message.any` não bate nesse filtro, então passaria)

**Plano de correção (para o Claude do VPS executar):**

```bash
# 1. Verificar evento exato que WAHA dispara em logs detalhados
docker exec whatsapp-ana sh -c 'echo "WHATSAPP_HOOK_EVENTS=$WHATSAPP_HOOK_EVENTS"; echo "WHATSAPP_LOG_LEVEL=$WHATSAPP_LOG_LEVEL"'

# 2. Atualizar lista de eventos no webhook via PUT
set +H
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e \
'const k=process.env.WK,h={"X-Api-Key":k,"Content-Type":"application/json"},B="ht"+"tp"+"://localhost:3000";
const body=JSON.stringify({config:{webhooks:[{url:"ht"+"tp://assistente-virtual:3001/webhook/ana",
events:["message","message.any","message.waiting","session.status"]}]}});
fetch(B+"/api/sessions/default",{method:"PUT",headers:h,body}).then(r=>console.log("PUT",r.status));'

# 3. Atualizar também env vars do container WAHA para futuras criações de sessão
# Editar docker-compose.whatsapp-ana.yml acrescentando WHATSAPP_HOOK_EVENTS="message.any,message,session.status"

# 4. Testar mandando mensagem real
```

**Risco do PUT:** já vimos antes que ele recria a sessão (me=null). Se acontecer de novo, precisará escanear QR. Alternativa segura é editar o compose e reiniciar — mas isso também perde sessão.

**Solução robusta** (sem perder sessão a cada reinício): mover config para `docker-compose.whatsapp-ana.yml` como env var `WHATSAPP_HOOK_EVENTS` e `WHATSAPP_HOOK_URL` (que já estão lá, só falta listar `message.any` no `WHATSAPP_HOOK_EVENTS`).

---

## 3. ESTADO COMPLETO DO PROJETO

### 3.1 INFRAESTRUTURA (✅ OK)

| Componente | Status | Notas |
|------------|--------|-------|
| VPS Hostinger 72.62.100.6 | ✅ | **vence 22/05/2026 — renovar** |
| Ubuntu 24.04 | ✅ | 12 zombie processes (não crítico) |
| Docker | ✅ | 7+ containers ativos |
| Traefik | ✅ | HTTPS Let's Encrypt OK |
| PostgreSQL 15 | ✅ | `hairtech-postgres`, SSL=off |
| Rede `hairtech-network` | ✅ | containers se comunicam |
| Cron `monitor-ana` 5min | ✅ | watchdog ANA |

### 3.2 BOTS / AGENTES

| Bot | Canal | IA | Status |
|-----|-------|----|----|
| **AV** assistente-virtual | Meta Cloud API (+5521993542383) | Gemini 2.5-flash | ✅ responde, 1252 linhas de código |
| **ANA** vendedora FUE | WAHA WEBJS (+5521967813366) | Gemini 2.5-flash | ⚠️ conectada mas não recebe `message` events |
| **OpenClaw orquestrador** | Telegram + API interna | Claude Sonnet 4.5 (fallbacks Gemini/GPT-4o) | ⚠️ instalado, não validado consumindo `/api/internal` |
| **AuthBot Telegram** | Telegram | — | ✅ existe (visto no briefing) |
| **whatsapp-inbox** | WAHA | — | ⚠️ outro canal, não está em uso ativo |

### 3.3 INTEGRAÇÕES

| Integração | Status |
|------------|--------|
| Meta Cloud API → AV `/webhook` | ✅ funciona |
| WAHA → AV `/webhook/ana` | ⚠️ só session.status chegando |
| AV → Gemini API | ✅ |
| AV → PostgreSQL | ✅ |
| AV → WhatsApp Cloud (envio para cliente) | ✅ |
| OpenClaw → AV `/api/internal` | ❌ token não carregado, precisa restart AV |
| OpenClaw → Telegram (8713631351) | ✅ |
| AV → Meta Business Suite Inbox | ❌ não conectado (precisa Coexistence / BSP) |
| AV → Google Agenda | ❌ não implementado |
| AV → Google Drive | ❌ não implementado |
| Backup automático banco → S3/Drive | ❌ apenas local `/root/backups_av/` |

### 3.4 PENDÊNCIAS PRIORIZADAS

**🔴 CRÍTICO (esta semana):**
1. **ANA receber `message` events** — adicionar `message.any` no `WHATSAPP_HOOK_EVENTS` do compose, reiniciar
2. **Renovar VPS antes de 22/05/2026** (8 dias)
3. **Validar backup automático do banco** (snapshot.sh + cron)
4. **Restart AV** para carregar `INTERNAL_API_TOKEN` e permitir OpenClaw orquestrar

**🟡 IMPORTANTE (próximas 2 semanas):**
5. Fix `OWNER_PHONE` → aceitar múltiplos números (pessoal + clínica)
6. Validar cron 9h/13h/18h do OpenClaw enviando relatório à ANA
7. Implementar fluxo "ANA pergunta ao Ricardo quando não souber"
8. Conectar AV ao Business Suite Inbox (caminho Picky Assist BSP — decisão pendente)
9. Recuperar leads perdidos via `/admin/export` (manual, Ricardo executa)
10. Testar fluxo end-to-end: lead novo → AV → triagem → handoff humano → ANA → conversão

**🟢 EVOLUÇÃO (próximo mês):**
11. Integrar Google Agenda (agendamento direto pelo AV/ANA)
12. Painel próprio em substituição ao Business Suite (se BSP for caro)
13. Métricas / dashboard de conversão
14. Backup automático para Google Drive / S3 / B2
15. Migrar IA de Gemini para Claude (consistência com OpenClaw orquestrador)
16. Implementar OWASP top 10 hardening no AV (especialmente `/admin`)
17. Substituir senha `hairtech2026` do admin por OAuth ou key rotativa

### 3.5 DÍVIDA TÉCNICA

- `app.js` com 1252 linhas — falta separar em módulos (handlers, repos, services)
- Status WAHA cosmético em `SCAN_QR_CODE` quando engine.state=CONNECTED (bug WAHA WEBJS)
- Gemini 404 em rota `/diagnostico` do AV (não afeta webhook)
- Sem testes automatizados
- Sem CI/CD
- Drift entre git e VPS (`app.js` foi editado por patcher Python em algumas sessões)
- Sem rate-limiting nos endpoints públicos
- Sem rotação de logs (containers podem encher disco a longo prazo)

---

## 4. FERRAMENTAS DISPONÍVEIS — PESQUISA E USO

### 4.1 Você JÁ TEM instalado/configurado

| Ferramenta | O que faz | Como usar agora |
|------------|-----------|-----------------|
| **Claude Code (CLI)** | Agente IA com acesso a docker, arquivos, terminal | `clinica` no SSH do VPS — acabou de instalar |
| **WAHA** (`devlikeapro/whatsapp-http-api`) | WhatsApp via Web JS (multi-device) | Container `whatsapp-ana`, API em `localhost:3000` |
| **OpenClaw** | Orquestrador de agentes IA self-hosted | UI em `https://claw.hairtech.org`, Telegram bot |
| **Meta Cloud API** (WA Business Platform) | API oficial WhatsApp | Webhook AV em `/webhook` |
| **Gemini API** (Google) | LLM principal AV/ANA | `gemini-2.5-flash`, key em `GEMINI_API_KEY` |
| **OpenAI API** | Tem key no .env do OpenClaw | Fallback do agente OpenClaw |
| **Anthropic API** | Tem key no .env do OpenClaw | Modelo primário OpenClaw orquestrador |
| **PostgreSQL** | Banco operacional | `hairtech-postgres:5432/hairtechdb` |
| **Traefik** | Reverse proxy + HTTPS automático | Já configurado, não tocar sem aprovação |
| **Cron** | Agendador | `monitor-ana` a cada 5min |

### 4.2 GitHub Copilot Cloud Agent (o e-mail que você recebeu)

**Resumo prático para HairTech:**

GitHub Copilot Cloud Agent = "estagiário de TI" que recebe issues no seu repositório GitHub e abre Pull Requests com a correção/implementação. Funciona assim:

1. Você abre uma issue: *"Adicionar endpoint /api/lead/:numero/agendar no api-internal.js"*
2. Você atribui (`@github-copilot`) ao agente
3. Ele lê o repo, entende padrões, escreve o código, abre PR
4. Você revisa e dá merge

**Capacidades 2026:**
- **Multi-modelo:** alterna entre GPT-5, Claude Sonnet 4.5, Gemini Pro
- **MCP (Model Context Protocol):** conecta a fontes externas (banco, docs, APIs)
- **agent.md no repo:** arquivo de regras que o agente segue (tipo seu CLAUDE.md)
- **Autonomia real:** roda testes, corrige bugs, abre PRs sem intervenção

**Aplicação direta no HairTech:**
- Mover este branch `claude/hairtech-whatsapp-ai-liD5V` para GitHub e atribuir issues ao Copilot Cloud Agent
- Cada nova feature (agenda, dashboard, métricas) vira issue → PR automático
- Você só revisa código pronto

**Vantagem sobre Claude Code (CLI):** ele roda 24/7 sem você precisar abrir terminal. Tipo um Pull Request Bot autônomo.

**Custo:** GitHub Copilot Business ~US$19/mês por usuário (já inclui Cloud Agent).

**Recomendação:** vale a pena ativar para acelerar evolução do projeto. Combinar:
- **Claude Code no VPS** → trabalho operacional (logs, deploy, debugging)
- **GitHub Copilot Cloud Agent** → desenvolvimento de features no código

### 4.3 MCP Servers (extensão do Claude Code)

MCP = "plug-ins" do Claude. Já tem alguns instalados no OpenClaw:
- `filesystem` (ler/escrever arquivos workspace)
- `memory` (memória persistente do agente)
- `sequential-thinking` (raciocínio passo-a-passo)
- `postgres` (consultar banco read-only)
- `playwright` (controlar navegador)

**Outros MCPs úteis que poderiam ser adicionados:**
- `google-drive` — backup automático e acesso a docs
- `google-calendar` — agenda direto
- `gmail` — comunicação automática
- `meta-graph-api` — gerenciar WhatsApp/Instagram pela Meta
- `slack` — alertas para equipe

### 4.4 Ferramentas alternativas que você poderia avaliar

| Ferramenta | Por que considerar |
|------------|-------------------|
| **Picky Assist BSP** | Coexistence oficial WhatsApp + Inbox no Business Suite (US$ 0 plan free) |
| **n8n** | Automação visual sem código (alternativa a OpenClaw para fluxos simples) |
| **Make (ex-Integromat)** | Integrações cloud (sem precisar VPS para automações) |
| **Cal.com self-hosted** | Agenda própria sem Google Calendar |
| **Supabase / Neon** | PostgreSQL gerenciado caso queira sair do self-hosted |
| **Cloudflare R2 / Backblaze B2** | Backup off-site barato (US$ 6/TB/mês) |
| **Sentry self-hosted** | Monitoramento de erros do código |
| **Uptime Kuma** | Monitor 24/7 dos containers e endpoints (alerta se cair) |

### 4.5 Recomendação estratégica

Para uma clínica média (não escala SaaS), eu recomendaria estabilizar primeiro o que está em pé:

1. **Resolver ANA não responder** (esta semana)
2. **Validar OpenClaw orquestrando** (esta semana)
3. **Backup automático off-site** (próxima semana)
4. **Monitor Uptime Kuma** (próxima semana) — alerta no Telegram se cair
5. **Avaliar GitHub Copilot Cloud Agent** para evolução paralela

Não introduzir mais ferramentas até essas 5 estarem sólidas. Cada ferramenta nova = mais complexidade e mais ponto de falha.

---

## 5. COMO RETOMAR (próximas sessões / outros chats)

**Para qualquer Claude novo (chat web, Claude Code local, Claude do VPS, GitHub Copilot Agent):**

1. Ler nesta ordem:
   - `/home/user/nodejs/CLAUDE.md`
   - `/home/user/nodejs/docs/MEMORIA-COMPACTADA.md`
   - `/home/user/nodejs/docs/ANALISE-PROJETO-COMPLETA.md` (este arquivo)
   - `/home/user/nodejs/docs/relatorio-2026-05-14.md`

2. Antes de qualquer ação:
   - Verificar `docker ps` para entender estado real dos containers
   - Verificar `git log` no branch `claude/hairtech-whatsapp-ai-liD5V`

3. **NUNCA** processar o "prompt longo" (~18 partes) do ChatGPT — Ricardo mandou ignorar

4. Atualizar `MEMORIA-COMPACTADA.md` no fim da sessão

---

## 6. STATUS FINAL DESTA SESSÃO (14/05/2026 03:25 BRT)

**Feito:**
- ✅ `/admin/export` (recuperar leads do banco)
- ✅ `/api/internal` (REST autenticada para OpenClaw)
- ✅ SOUL.md do agente orquestrador
- ✅ Deploy script aplicado no VPS (7/8 OK)
- ✅ ANA reconectada com webhook (PUT manual + QR novo)
- ✅ Memória externa permanente (`MEMORIA-COMPACTADA.md`)
- ✅ Claude Code instalado no VPS (`clinica`)
- ✅ Esta análise

**Aguardando ação humana (Ricardo):**
- Adicionar `message.any` no `WHATSAPP_HOOK_EVENTS` (via `clinica` ou aqui)
- Restart AV para carregar `INTERNAL_API_TOKEN`
- Validar ANA responde teste end-to-end
- Login no `clinica` (OAuth código completo ou API key)
- Renovar VPS Hostinger

**Bloqueado por:**
- ANA não receber `message` events (próxima ação clara)

---

Fim da análise. Atualizado em `docs/ANALISE-PROJETO-COMPLETA.md`.
