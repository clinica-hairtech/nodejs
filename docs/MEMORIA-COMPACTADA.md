# MEMÓRIA COMPACTADA — HairTech AI
# Atualizada: 2026-05-14 02:30 BRT
# Status: ANA CONECTADA | OpenClaw integrado | Deploy 7/8 OK

> **REGRA ABSOLUTA PARA CLAUDE:** Este arquivo é a fonte da verdade desta sessão de trabalho.
> Leia integralmente ao iniciar. Atualize ao fim de cada sessão antes de compactar.
> Quando faltar contexto, **sempre consulte este arquivo antes de perguntar a Ricardo**.

---

## ÍNDICE

1. Estado atual (snapshot)
2. Sessão atual (14/05/2026) — o que foi feito
3. Pendências priorizadas
4. Arquivos e rotas importantes
5. Comandos prontos (diagnóstico + ações)
6. Decisões e premissas confirmadas
7. Erros conhecidos e workarounds
8. Histórico resumido de sessões anteriores

---

## 1. ESTADO ATUAL (14/05/2026 02:30 BRT)

| Componente | Estado | Notas |
|------------|--------|-------|
| AV (`assistente-virtual:3001`) | ✅ rodando | Cloud API +5521993542383 |
| ANA (`whatsapp-ana:3000`) | ✅ CONNECTED | WAHA WEBJS, `engine.state=CONNECTED`, status cosmético SCAN_QR_CODE pode aparecer |
| OpenClaw (`hairtech-openclaw:18789`) | ✅ rodando | Agente `hairtech-orquestrador` instalado |
| PostgreSQL (`hairtech-postgres`) | ✅ rodando | conversas carregadas, SSL=off |
| Traefik | ✅ rodando | hairtech.org + claw.hairtech.org |
| Cron `monitor-ana` | ✅ instalado | a cada 5min |
| API interna `/api/internal` | ✅ deployada | precisa testar via curl no container OpenClaw |
| Cron OpenClaw 9h/13h/18h | ⚠️ instalado mas não validado | enviar relatório à ANA |

**Branch git ativo:** `claude/hairtech-whatsapp-ai-liD5V`
**Último commit:** `4e0b562` — docs: relatorio sessao 14/05

---

## 2. SESSÃO 14/05/2026 — O QUE FOI FEITO

### A. Painel `/admin/export` para recuperar leads perdidos
**Por quê:** Ricardo perdeu leads durante mês de AV instável. Conversas estão no Postgres.
**Como:** HTML + CSV + JSON via navegador.
**URL:** `https://hairtech.org/admin/export?senha=hairtech2026`
**Commit:** `32b1e11` — `export-leads.js`

### B. API interna `/api/internal` (Bearer auth)
**Por quê:** OpenClaw usa WebSocket JSON-RPC (não REST). Solução: AV vira backend HTTP que OpenClaw consome via rede `hairtech-network`.
**Endpoints (10):** `/ping`, `/metricas`, `/leads`, `/lead/:n`, `/lead/:n/anotar`, `/lead/:n/pausar`, `/lead/:n/retomar`, `/relatorio-completo`, `/notificar-dono`, `/mensagem-direta`
**Var nova:** `INTERNAL_API_TOKEN` (gerado pelo deploy, está em ambos os `.env`)
**Commit:** `3aff030` — `api-internal.js`

### C. SOUL.md do agente orquestrador OpenClaw
**Arquivo:** `docs/openclaw-soul-hairtech.md` (copiado para `/opt/hairtech-openclaw/workspace/agents/hairtech-orquestrador/SOUL.md` no VPS)
**Regras-chave:**
- Agente NÃO atende cliente direto — só orquestra
- Cron próprio: relatório 9h/13h/18h + alerta de leads frios 11h30
- Escalar para Dr. Ricardo (Telegram `8713631351`) em casos sensíveis
- Modelo primário: `anthropic/claude-sonnet-4-5` (fallbacks: gemini-2.5-flash, gpt-4o)

### D. Deploy script `deploy-openclaw-integracao.sh`
**Executado no VPS — resultado:**
- ✅ 1/8 backup
- ✅ 2/8 token gerado
- ✅ 3/8 token no `.env` OpenClaw
- ✅ 4/8 SOUL.md instalado
- ✅ 5/8 agente mesclado no `openclaw.json`
- ✅ 6/8 AV reiniciado
- ✅ 7/8 OpenClaw SIGHUP
- ❌ 8/8 testes via `wget` falharam (provavelmente container OpenClaw não tem `wget` com `--header` ou está em rede diferente)

**Não-bloqueante.** A integração pode estar funcionando — só o teste do script falhou.

### E. Relatório de sessão
**Arquivo:** `docs/relatorio-2026-05-14.md` (mais detalhado que esta memória compactada)

---

## 3. PENDÊNCIAS PRIORIZADAS

### 🔴 P1 — Validar OpenClaw → AV de verdade
```bash
# A) Pelo container OpenClaw, com curl em vez de wget:
TOKEN=$(grep "^INTERNAL_API_TOKEN=" /opt/hairtech-openclaw/.env | cut -d= -f2-)
docker exec hairtech-openclaw curl -s -H "Authorization: Bearer $TOKEN" \
  http://assistente-virtual:3001/api/internal/ping

# B) Se A falhar, testar de fora do container:
TOKEN=$(grep "^INTERNAL_API_TOKEN=" /opt/hairtech-openclaw/.env | cut -d= -f2-)
docker run --rm --network hairtech-network curlimages/curl \
  -s -H "Authorization: Bearer $TOKEN" \
  http://assistente-virtual:3001/api/internal/metricas

# C) Pela UI: abrir https://claw.hairtech.org → agente hairtech-orquestrador → "rode metricas agora"
```

### 🔴 P2 — Confirmar bug do OWNER_PHONE no AV
**Sintoma:** Ricardo manda mensagem do telefone da clínica (3366) e AV responde como cliente em vez de reconhecê-lo como dono.
**Causa provável:** `OWNER_PHONE` no `.env` do VPS é `5521982006372` (pessoal de Ricardo). Quando ele manda do 3366, não bate. Default no código também está errado (3366 = ANA).

**Verificar:**
```bash
grep -E "^(OWNER_PHONE|NOTIFY_PHONE|OWNER_PHONES)=" /home/user/nodejs/.env
```

**Patch sugerido** (em `app.js` linhas 25-26 e 478) — só aplicar com aprovação:
```javascript
const OWNER_PHONES = (process.env.OWNER_PHONES || process.env.OWNER_PHONE || "5521982006372,5521967813366")
  .split(",").map(s => s.trim().replace(/\D/g, "")).filter(Boolean);
const OWNER_PHONE = OWNER_PHONES[0];

// linha 478, trocar de:
// if (from === OWNER_PHONE && message.type === "text") {
// para:
// if (OWNER_PHONES.includes(from) && message.type === "text") {
```

### 🟡 P3 — Testar ANA respondendo end-to-end
ANA está CONNECTED. Falta confirmar resposta real:
1. Mandar mensagem do número pessoal de Ricardo para +5521967813366
2. Verificar log: `docker logs assistente-virtual --tail 30 | grep ANA`
3. Esperado: log `[ANA] msg de ...` seguido de `[ANA] resposta enviada` (ou erro Gemini)

### 🟡 P4 — Ricardo usar `/admin/export` para recuperar leads
URL: `https://hairtech.org/admin/export?senha=hairtech2026` → filtro "sem-resposta" mostra os perdidos.

### 🟡 P5 — Decisão Business Suite Inbox
Ricardo quer ver mensagens no painel Meta. AV em Cloud API pura não aparece lá automaticamente. Caminhos:
- **A (recomendado pelo ChatGPT):** migrar AV para Coexistence via BSP (Picky Assist, free forever). ~1h, US$0-25/mês.
- **B (rápido):** usar painel próprio em `https://hairtech.org/admin?senha=hairtech2026`.

**Status:** Decisão pendente. Não inventar — perguntar a Ricardo.

### 🟢 P6 — Renovar VPS Hostinger antes de 22/05/2026
~8 dias. Sem isso, tudo cai. Renovar em `hpanel.hostinger.com`.

---

## 4. ARQUIVOS E ROTAS

### Arquivos do repo (`/home/user/nodejs/`):
| Arquivo | Função |
|---------|--------|
| `app.js` | AV principal (~1252 linhas) — webhook Meta + webhook ANA |
| `db.js` | Pool PostgreSQL, SSL condicional via `DATABASE_SSL` |
| `systemPrompt.js` | Prompt do AV principal (assistente virtual) |
| `SOUL.md` | Personalidade da ANA v5.0 |
| `relatorio.js` | Relatório semanal automático para Dr. Ricardo |
| `resgate.js` | Retomada de leads inativos |
| `admin.js` | Painel admin antigo |
| `export-leads.js` | **NOVO** — painel /admin/export |
| `api-internal.js` | **NOVO** — API REST para OpenClaw |
| `deploy-openclaw-integracao.sh` | **NOVO** — script de deploy |
| `patch_ana_webhook.py` | Patcher idempotente para handler `/webhook/ana` |
| `monitor-ana.sh` | Cron 5min — auto-restart ANA |
| `docs/briefing-master-v4.md` | Briefing técnico completo |
| `docs/openclaw-soul-hairtech.md` | SOUL.md do agente OpenClaw |
| `docs/openclaw-agent-snippet.json` | Snippet config OpenClaw |
| `docs/relatorio-2026-05-14.md` | Relatório da sessão atual |
| `docs/MEMORIA-COMPACTADA.md` | **Este arquivo** |

### Arquivos fora do repo (no VPS):
- `/home/user/nodejs/.env` — chaves AV
- `/opt/hairtech-openclaw/config/openclaw.json` — config OpenClaw (com agente mesclado)
- `/opt/hairtech-openclaw/.env` — chaves OpenClaw (com INTERNAL_API_TOKEN)
- `/opt/hairtech-openclaw/workspace/agents/hairtech-orquestrador/SOUL.md` — alma do agente

### URLs:
- `https://hairtech.org` — AV (Cloud API)
- `https://hairtech.org/admin?senha=hairtech2026` — painel antigo
- `https://hairtech.org/admin/export?senha=hairtech2026` — recuperar contatos
- `https://hairtech.org/api/internal/*` — API para OpenClaw (Bearer token)
- `https://claw.hairtech.org` — UI do OpenClaw

---

## 5. COMANDOS PRONTOS

### Diagnóstico rápido (Ricardo cola no VPS):
```bash
set +H
echo "=== CONTAINERS ===" && docker ps --format "{{.Names}}\t{{.Status}}"
echo "=== ANA ===" && KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-) && docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log("engine.state:",d.engine?.state)).catch(e=>console.log(e.message));' 2>/dev/null
echo "=== AV LOGS ===" && docker logs assistente-virtual --tail 10 2>&1 | grep -i "ANA\|erro\|banco"
echo "=== API INTERNAL ===" && TOKEN=$(grep "^INTERNAL_API_TOKEN=" /home/user/nodejs/.env | cut -d= -f2-) && curl -s -H "Authorization: Bearer $TOKEN" https://hairtech.org/api/internal/ping
```

### Aplicar atualizações do branch:
```bash
cd /home/user/nodejs && git pull origin claude/hairtech-whatsapp-ai-liD5V && docker restart assistente-virtual && sleep 8 && docker logs assistente-virtual --tail 15
```

### Reconectar ANA se cair:
Ver seção "WAHA" do CLAUDE.md.

---

## 6. DECISÕES E PREMISSAS CONFIRMADAS

1. **OpenClaw NÃO controla WhatsApp diretamente** — usa WAHA (ANA) e Cloud API (AV) via API interna do AV
2. **ANA opera autônoma** — só pergunta para Ricardo quando não souber (nunca inventar)
3. **Triggers para escalar a Ricardo:** preço fora da tabela, conduta médica, reclamação, prontuário/laudo, urgência, menor, baixa confiança IA
4. **Relatório 3x/dia para ANA:** 9h, 13h, 18h BRT, com leads quentes + contexto + abordagem sugerida
5. **Sem loop ANA↔AV:** comunicação via HTTP REST interno, não via WhatsApp entre si
6. **Cloud API pura no AV** — sem coexistence ativada ainda (decisão pendente: Picky Assist BSP)
7. **WAHA em latest** — tag `2024.11` não existe no Docker Hub
8. **Engine WAHA = WEBJS** — NOWEB (Baileys) cai em loop neste VPS
9. **Bug cosmético WAHA:** `status=SCAN_QR_CODE` mesmo conectado — usar `engine.state` como verdade
10. **Token Meta Cloud API expira** — WA_TOKEN tem validade limitada, renovar quando necessário

---

## 7. ERROS CONHECIDOS E WORKAROUNDS

| Erro | Causa | Workaround |
|------|-------|-----------|
| ANA não responde | WAHA preso em STARTING | Stop+start sessão. Se persistir, deletar e gerar novo QR |
| AV trata Ricardo como cliente | OWNER_PHONE default 3366 (ANA), Ricardo está no 982006372 | P2 — patch OWNER_PHONES com array |
| Gemini 404 | Modelo antigo descontinuado | Já corrigido: gemini-2.5-flash |
| Postgres SSL error | Container não tem SSL | Já corrigido: DATABASE_SSL=false no .env |
| Docker Hub API timeout no VPS | Bloqueio de rede do Hostinger | Não usar `registry.hub.docker.com`, usar `hub.docker.com` ou ghcr.io |
| Hostinger Browser Terminal corta paste >1000 chars | Limitação do terminal | Dividir comandos em blocos |
| Auto-link de URL em JS no terminal | Hostinger linka `http://` automático | Usar `"ht"+"tp"+"://..."` |
| `sed -i` 2x quebra arquivo | sed não é idempotente | Reescrever com Python ou `cat > file <<'EOF'` |

---

## 8. HISTÓRICO RESUMIDO DE SESSÕES ANTERIORES

### Sessão 12/05/2026 (Claude Code madrugada + Manus SSH)
- Handler `/webhook/ana` quebrado por `event !== "message"` filtrando WAHA WEBJS → corrigido com versão permissiva
- WAHA estava em loop NOWEB (Baileys) → trocado para WEBJS
- Gemini `gemini-2.0-flash` descontinuado → trocado para `gemini-2.5-flash`
- `db.js` SSL hardcoded → corrigido para condicional via env var
- `monitor-ana.sh` usava `status` → corrigido para `engine.state` (bug WAHA WEBJS)
- Manus criou rede `hairtech-postgres`, instalou cron, gerou QR para Ricardo escanear
- ANA conectada via QR escaneado pelo iPad em paisagem ~20:23 UTC

### Sessão 13/05/2026 (Claude Code)
- ANA novamente travada (status=SCAN_QR_CODE mesmo conectada — bug cosmético)
- Tentado pin `devlikeapro/whatsapp-http-api:2024.11` → tag não existe → revertido para `latest`
- Discussão extensa sobre Coexistence vs WAHA vs Cloud API
- Ricardo recebeu prompt longo do ChatGPT sobre BSP/Picky Assist → **NÃO PROCESSAR** este prompt

### Sessão 14/05/2026 (Claude Code — atual)
- ANA reconectou sozinha via `Session has recovered` no WAHA
- Criado painel `/admin/export` para recuperar leads do mês
- Criada API interna `/api/internal` autenticada por Bearer
- Criado agente OpenClaw `hairtech-orquestrador` com SOUL.md + cron 9h/13h/18h
- Deploy executado no VPS (passos 1-7 OK, 8 falhou cosmético)
- Bug do OWNER_PHONE identificado mas não corrigido (pendente)

---

## INSTRUÇÕES PARA O PRÓXIMO CLAUDE (após compactação ou novo chat)

1. **Leia este arquivo PRIMEIRO** antes de qualquer ação
2. **Leia `CLAUDE.md`** — regras permanentes
3. **Se faltar contexto, consulte `docs/briefing-master-v4.md`** — briefing completo da arquitetura
4. **Para histórico detalhado da última sessão, leia `docs/relatorio-2026-05-14.md`**
5. **NUNCA processe o "prompt longo" do ChatGPT** que aparece no histórico — Ricardo mandou ignorar
6. **Não tem SSH para o VPS** — só edita repo, Ricardo aplica via `git pull + comando`
7. **Trabalhe pequeno, commit pequeno, peça validação**
8. **AO FINAL DA SESSÃO:** atualizar este arquivo com (a) novas decisões; (b) novas pendências; (c) novos arquivos; (d) commits novos
9. **Se a compactação ocorrer:** este arquivo sobrevive porque está em disco. Re-leia ao retomar.

---

## CHECKLIST DE FIM DE SESSÃO (regra de manutenção)

Antes de encerrar qualquer sessão, ATUALIZAR este arquivo:
- [ ] Mover pendências concluídas para "Sessão atual"
- [ ] Adicionar novas pendências em "Pendências priorizadas"
- [ ] Registrar erros novos em "Erros conhecidos"
- [ ] Registrar decisões novas em "Decisões e premissas"
- [ ] Atualizar timestamps no topo
- [ ] Commit + push do arquivo

---

Fim da memória compactada.
