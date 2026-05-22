# PENDÊNCIAS CONSOLIDADAS — HairTech 22/05/2026
# Fonte única da verdade. Todo agente lê DAQUI antes de agir.
# Atualizado: 2026-05-22 (sessão Claude Code Web continuando após compactação)

> **Regra:** quando uma tarefa for concluída, mover pra `# ✅ FEITO` no final.
> NÃO apagar — manter histórico pra auditoria.

---

## ÍNDICE RÁPIDO

- [P0 — DINHEIRO + JURÍDICO (próximas 72h)](#p0)
- [P1 — DEFESA SUPERENDIVIDAMENTO (essa semana)](#p1)
- [P2 — TRIAGEM + RECEITA RECORRENTE (próximas 2 semanas)](#p2)
- [P3 — ARQUITETURA + ESCALA (mês)](#p3)
- [QUEM FAZ O QUÊ](#quem)
- [BLOQUEADO POR DR. RICARDO (só ele clica)](#bloqueado-dr)
- [FEITO HOJE 22/05](#feito-hoje)

---

<a id="p0"></a>
## P0 — DINHEIRO + JURÍDICO (próximas 72h)

### P0.1 Reativar Meta Ads (Dr. Ricardo)
- **Por quê**: Pausada desde 04/05 por pagamento. Sem ela = leads zerados = ciclo dívida.
- **Como**: business.facebook.com → Cobrança → trocar método (Pix ou outro cartão) → Reativar campanhas existentes
- **Orçamento mínimo viável**: R$50-100/dia já capta lead
- **Tempo estimado**: 10 min
- **Status**: aguardando Dr.

### P0.2 Reativar Google Ads (Dr. Ricardo)
- **Por quê**: Pagamento recusado em 20/05.
- **Como**: ads.google.com → Cobrança → trocar método → retomar campanhas
- **Tempo**: 10 min
- **Status**: aguardando Dr.

### P0.3 Notificação extrajudicial Lei 14.181/2021 (Claude + Dr. → Manus envia)
- **Por quê**: Bloquear cobrança vexatória/horário inadequado + abrir prazo de 30d pra plano de pagamento global (CDC art. 54-A a 54-G)
- **Para quem**: TODOS os credores listados na MATRIZ EVIDENCIAS (XP, BB, Bradesco, Serasa, Lívia Imobiliária, Itaú, Caixa, etc — confirmar lista exata no Drive)
- **Template**: `docs/legal/NOTIFICACAO_EXTRAJUDICIAL_SUPERENDIVIDAMENTO_TEMPLATE.md` (commit nesta sessão)
- **Envio**: Manus via Computer Use (browser → portal cliente do credor) OU AR Correios OU email registrado
- **Briefing Manus**: `manus-briefings/20260522-enviar-notificacoes-extrajudiciais.md`
- **Status**: template pronto. Falta Dr. confirmar lista final de credores + autorizar Manus.

### P0.4 BLITZ pacientes existentes (automático 9h diário)
- **Status**: agendado e rodando. Verificar resumo Telegram às 9h30.
- **Se não rodou**: investigar `docker logs assistente-virtual --tail 50 | grep BLITZ`

### P0.4-b Caixa de entrada AV — ler mensagens retidas (NOVO commit nesta sessão)
- **Pedido Dr.**: "tem mensagens retidas na caixa de entrada do AV, corrigir e ver pelo navegador"
- **Limitação real**: Claude Code Web não tem navegador, sandbox bloqueia hairtech.org (403)
- **Solução implementada**: dois endpoints novos no `api-internal.js`:
  - `GET /api/internal/inbox-pendentes?limite=50` — conversas com última mensagem do cliente SEM resposta (Bearer auth)
  - `GET /api/internal/inbox-snapshot` — snapshot compacto de até 500 conversas
- **Como Dr. acessa**: pelo navegador, https://hairtech.org/admin?senha=hairtech2026 → aba conversas (já existe)
- **Como Claude/Codex/Manus acessa** (sem browser): curl via Bearer `INTERNAL_API_TOKEN`
- **Como ver pendentes via cron**: a partir de agora, vigia-agentes.sh pode pingar `/inbox-pendentes` e avisar Dr. se ≥ 5 conversas estão sem resposta há > 1h
- **Próximo passo Dr.**: confirmar se /admin abre normal pelo celular; se não, problema é de auth/login, eu ajudo a debugar

### P0.5 Vigia de agentes 24/7 (NOVO — commit nesta sessão)
- **Por quê**: Dr. perguntou "configura alguma coisa pra estar sempre vendo se vocês estão trabalhando"
- **O quê**: `scripts/cron/vigia-agentes.sh` roda a cada 30min na VPS, manda Telegram se: container down, git idle >24h, status.json velho, vasculhamento.json velho, AV /health != 200, BLITZ não rodou
- **Cooldown**: 3h por categoria (não inunda)
- **Heartbeat**: 1x/dia confirmando vivo
- **Instalação**: auto-apply.sh T31 (commit nesta sessão)
- **Mesmo no Mac**: briefing `codex-briefings/20260522-vigia-mac.md` pro Codex instalar

---

<a id="p1"></a>
## P1 — DEFESA SUPERENDIVIDAMENTO (essa semana)

### P1.1 Processo Procon-RJ online (Dr. Ricardo)
- **Como**: procon.rj.gov.br → tipo: superendividamento (Lei 14.181/2021)
- **Petição pré-preenchida**: Drive `PETICAO_PROCON_SUPERENDIVIDAMENTO_HAIRTECH_2026-05-22`
- **Anexos**: MATRIZ EVIDENCIAS + comprovantes
- **Pedido**: audiência conciliatória global

### P1.2 Emitir Registrato BCB (Dr. Ricardo)
- **Como**: bcb.gov.br/cidadaniafinanceira/registrato (gov.br nível ouro)
- **Relatórios**: SCR (todas dívidas em bancos) + CCS (contas/relacionamentos)
- **Por quê**: prova oficial de superendividamento

### P1.3 Triagem 2 das 984 cobranças (Codex roda no Mac)
- **Script**: `codex-scripts/triagem-2-cobrancas-ollama.py`
- **Modelo**: gemma3:4b local (R$0)
- **Output**: COBRANCA_REAL.csv / DDA.csv / SPAM.csv / OTP.csv + relatório
- **Tempo**: ~50min
- **Status**: script pronto desde commit `725e0cc`. Aguardando Codex disponível.

### P1.4 Defensoria Pública RJ (Dr. Ricardo)
- **Caso superendividamento PF + PJ vinculada**
- **Como**: defensoria.rj.def.br → CEDH → Núcleo Consumidor
- **Levar**: Registrato + MATRIZ EVIDENCIAS + RG/CPF/CRM/CNPJ

### P1.5 Auditoria Gmail cobranças (precisa Dr. reautorizar)
- **Por quê**: Gmail MCP token expirou
- **Como Dr.**: claude.ai/settings → reautorizar Gmail
- **Depois**: eu mapeio todos emails de cobrança últimos 6 meses

### P1.6 Vasculhar WhatsApp pessoal (`/admin/investigacao`)
- **Por quê**: leads esquecidos + cobranças não respondidas
- **Status**: rota existe, depende de AV estar UP
- **Confirmar**: vigia avisa se AV cair

---

<a id="p2"></a>
## P2 — TRIAGEM + RECEITA RECORRENTE (próximas 2 semanas)

### P2.1 ChatGPT history export (Dr. Ricardo OU Codex)
- **Por quê**: anos de conversas da clínica + decisões
- **Como Dr.**: chatgpt.com → Settings → Data Controls → Export Data → recebe ZIP em 24-48h
- **Alternativa Codex**: AppleScript abre Chrome do Dr., navega no histórico, exporta JSON

### P2.2 Pré-consulta inteligente (Claude implementa quando Dr. pedir)
- Formulário + fotos + IA resumo → Dr. recebe sumário no Telegram
- Reduz consulta de 30min pra 15min
- **Status**: não iniciado

### P2.3 Reauthorize Gmail MCP + Drive MCP (Dr.)
- Tokens expirados precisam clique do Dr. em claude.ai/settings

### P2.4 ~~ANA follow-up estruturado~~ — **JÁ EXISTE**
- Verificado em `scripts/proactive-pos.js`: D+1/D+3/D+7/D+15/D+30 implementado
- Auditoria 21/05 estava desatualizada

### P2.5 ~~Handoff AV ↔ ANA estruturado~~ — **JÁ EXISTE**
- Verificado em `app.js:562` (`[HANDOFF_ANA]`) + função `handoffParaAna` linha 775
- AV detecta venda complexa e empurra pra ANA via fila
- Auditoria 21/05 estava desatualizada

### P2.6 Custom GPT ChatGPT (Dr. configura uma vez)
- Connect ChatGPT à ponte multi-agente
- Passos detalhados em: resposta anterior desta sessão (commit `c28eb2f`)
- Endpoint: `https://hairtech.org/api/agent/openapi.json`
- Auth: Bearer token gerado por auto-apply T30

---

<a id="p3"></a>
## P3 — ARQUITETURA + ESCALA (mês)

### P3.1 Multi-canal Picky Assist BSP (decisão Dr.)
- Migrar AV pra Coexistence (mensagens aparecem no Business Suite Inbox)
- Status: aguardando decisão final (P5 da memória antiga)

### P3.2 Memed + CFM Prescrição Eletrônica (Dr. configura)
- Memed é GRÁTIS pra médicos
- CFM Prescrição Eletrônica também grátis e certificada

### P3.3 Feegow integration (Dr. assina Pro R$149/mês)
- Prontuário médico + agenda médica
- ENV: `FEEGOW_API_KEY`, `FEEGOW_WEBHOOK_SECRET`

### P3.4 Backup Backblaze B2 (Dr. assina ~$5/mês)
- Off-site backup do Postgres + repo + Drive
- Scripts já prontos: `scripts/install-rclone-b2.sh`

### P3.5 ICP-Brasil e-CPF A1 (Dr., presencial, ~R$300)
- Pra assinar prescrições com validade legal

### P3.6 ZapSign / DocuSign (Dr. decide)
- TCLE FUE assinatura digital
- DocuSign tem 3 IDs já / D4Sign possível / ZapSign R$80/mês

### P3.7 InfinityPay Pix (Dr. tem conta — só pegar credenciais)
- `INFINITYPAY_CLIENT_ID/SECRET/WEBHOOK_SECRET` em painel.infinitypay.io
- Habilita: Pix recebimento automático + conciliação

### P3.8 OpenClaw Mac (briefing pronto, Codex executa)
- briefing: `codex-briefings/20260521-0200-openclaw-mac.md`
- Roda agentes locais grátis no Mac do Dr.

---

<a id="quem"></a>
## QUEM FAZ O QUÊ — SEM AMBIGUIDADE

| Agente | Habilidades únicas | Como acionar |
|---|---|---|
| **Dr. Ricardo** | Decisões clínicas/financeiras, ligações, autorizar dialogs, login em sites | Sua intuição |
| **Claude Code Web (eu)** | Código, commits Git, briefings, MCP Drive/Gmail/GitHub | Mensagem neste chat |
| **Codex** (Mac) | Bash local, mv arquivos, browser Chrome, AppleScript, Ollama gemma3:4b | Dr. cola briefing em codex |
| **Manus** | Browser real + Computer Use externo, envio formulários portal credor | Dr. cola briefing em manus.app (custa créditos) |
| **ChatGPT** (web) | Conversa, brainstorm, copy | Dr. abre chatgpt.com (Custom GPT conecta na ponte multi-agente) |
| **Gemini** | Fallback IA, multimodal (Vision) | API automática |
| **OpenClaw VPS** | Orquestra agentes da clínica, Telegram bot, cron 9h/13h/18h | claw.hairtech.org (Dr. abre) |
| **AV bot** | WhatsApp Cloud +5521993542383 | 24/7 automático |
| **ANA bot** | WhatsApp pessoal +5521967813366 (vendas FUE) | 24/7 automático |
| **Cron VPS** | auto-apply (2/2min), vasculhar (02h), backup (03h), BLITZ (09h), vigia (30/30min) | systemd |
| **Vigia agentes** (novo) | Avisa Telegram se algum agente parar | automático |

---

<a id="bloqueado-dr"></a>
## BLOQUEADO POR DR. RICARDO (só ele clica)

Lista do que SÓ ele pode fazer (eu não tenho como):

1. ⏳ Reativar Meta Ads (cartão dele)
2. ⏳ Reativar Google Ads (cartão dele)
3. ⏳ Reautorizar Gmail MCP em claude.ai/settings
4. ⏳ Reautorizar Drive MCP (se também caiu)
5. ⏳ Renovar VPS Hostinger antes 17/06 (auto-renew ativo, mas conferir)
6. ⏳ Cartão Gemini billing (console.cloud.google.com/billing)
7. ⏳ Abrir Procon-RJ (gov.br login)
8. ⏳ Emitir Registrato BCB (gov.br login)
9. ⏳ Defensoria RJ (gov.br + presença)
10. ⏳ Confirmar lista FINAL de credores pra notificação extrajudicial
11. ⏳ Configurar Custom GPT no ChatGPT (Plus required)
12. ⏳ ChatGPT export data (clica em Settings → Data Controls)
13. ⏳ Comprar e-CPF A1 ICP-Brasil (presencial AR)
14. ⏳ Designar DPO LGPD (decisão organizacional)
15. ⏳ Comissão IA & Telemedicina CFM 2.454/2026 (formal)

---

<a id="feito-hoje"></a>
## ✅ FEITO HOJE 22/05/2026

### Sessão Claude Code Web (esta)
- ✅ commit `182125c` — Executor HTTP allowlisted VPS (scripts/instalar-executor-vps.sh)
- ✅ commit `725e0cc` — Dossiê defesa superendividamento (Drive) + triagem-2-cobrancas-ollama.py
- ✅ commit `c28eb2f` — **Ponte multi-agente** `/api/agent/chat` (ChatGPT/Manus/scripts)
- ✅ commit `e7577df` — auto-apply T30: gera `AGENTS_API_TOKEN` automático no .env
- ⏳ commit pendente nesta sessão — vigia-agentes + PENDENCIAS_CONSOLIDADO + notificação extrajudicial + briefing Manus

### Drive (compilado anteriormente)
- ✅ DEFESA_SUPERENDIVIDAMENTO_TEMPLATES_RESPOSTA_2026-05-22
- ✅ PETICAO_PROCON_SUPERENDIVIDAMENTO_HAIRTECH_2026-05-22
- ✅ FILA_TAREFAS_HAIRTECH_LIVE (blackboard multi-agente)
- ✅ MATRIZ EVIDENCIAS SUPERENDIVIDAMENTO 2026-05-22

---

---

## REVISÃO DOS ÚLTIMOS 3 DIAS (pedido Dr. 22/05)

### 19/05 (segunda)
- **Codex**: instalou Ollama+Gemma3:4b no Mac do Dr. (`PATCH_v7.1_IA_LOCAL_INSTALADA`)
- **Codex**: rodou benchmark Ollama vs API, decidiu manter IA local pra triagem barata
- **Manus**: tentou integrar Ollama no OpenClaw VPS — schema rejeitou, rollback em 6s. NÃO repetir sem schema fix.
- **Manus**: confirmou Ollama UP na VPS (`SMOKE_TEST_OLLAMA`)

### 20/05 (terça)
- **Codex**: criou DOCX `contrato_paciente_modelo_transplante_capilar.docx`
- **Codex**: criou DOCX `termo_reembolso_quitacao.docx`
- **Codex**: corrigiu valores R$8.000 → R$8.500/R$9.000 em vários arquivos
- **Codex**: estado AV confirmado UP, ANA WAHA CONNECTED, OpenClaw rodando
- **Claude**: pediu auditoria P0 (AUDITORIA_AV_ANA_P0_2026-05-20.md)

### 21/05 (quarta)
- **Claude (eu)**: auditoria CÓDIGO completa (AUDITORIA_AV_ANA_P0_RESPOSTA.md) — implementou P0 clínico/jurídico/doc, fix dep CFM no package.json, cooldown Telegram healthcheck
- **Claude**: agente noturno 24/7 + watchdog + auto-aprovar dialogs (commit `8665197`)
- **Claude**: trigger imediato vasculhamento (commit `fb5efaf`)
- **Codex**: briefings preparados: organizar-mac, openclaw-mac, docusign-4-chaves, limpar-duplicatas, validar-av-pos-fix
- **Codex**: começou organizar Mac mas PAROU (motivo: Codex/Cowork credit exhausted ou ChatGPT free travou)

### 22/05 (hoje, sexta)
- **Claude (eu, sessão atual)**:
  - commit `725e0cc` — dossiê superendividamento + script triagem 984 cobranças via Ollama
  - commit `182125c` — Executor HTTP allowlisted VPS (scripts/instalar-executor-vps.sh)
  - commit `c28eb2f` — ponte multi-agente `/api/agent/chat` (ChatGPT/Manus/scripts)
  - commit `e7577df` — auto-apply T30 gera AGENTS_API_TOKEN automático
  - commit pendente — vigia-agentes 30/30min + PENDENCIAS_CONSOLIDADO + notificação extrajudicial template + briefing Manus + inbox-pendentes endpoint + auto-apply T31

### O QUE TRAVOU NESSES 3 DIAS
1. **Codex parou** — provavelmente após "limpar-duplicatas-mac" ou "openclaw-mac" porque consumiu créditos / ChatGPT free travou
2. **Manus não foi acionado** — briefings prontos mas Dr. ainda não rodou
3. **Gmail MCP token** — expirou, precisa Dr. reautorizar (não consigo fazer)
4. **Browser/visual** — limitação permanente do sandbox Anthropic Web. Solução: tudo via Git/repo/API interna

---

## REGRA OPERACIONAL

Toda sessão Claude/Codex/Manus que iniciar:
1. Ler ESTE arquivo primeiro
2. Pegar a tarefa P0/P1 não-feita atribuída ao seu role
3. Executar
4. Marcar como ✅ FEITO no final do arquivo
5. Commitar + push
6. Próxima sessão sabe o que falta sem perguntar
