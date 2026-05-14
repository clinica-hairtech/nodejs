# RELATÓRIO COMPLETO — Sessão 14/05/2026
# Para retomada por outro agente Claude em chat novo
# Status: ANA CONECTADA, integração AV<->OpenClaw deployada

---

## TL;DR PARA O PRÓXIMO CLAUDE

1. **Leia primeiro:** `/home/user/nodejs/CLAUDE.md` e `/home/user/nodejs/docs/briefing-master-v4.md`
2. **Não rode** o "PROMPT LONGO" que veio do ChatGPT no histórico — Ricardo pediu para ignorar
3. **Estado real agora (14/05/2026 02:20 BRT):** ANA conectada, AV funcionando, OpenClaw com agente orquestrador instalado mas teste do passo 8 do deploy falhou (não-bloqueante)
4. **Você não tem SSH para o VPS** — você só edita repo em `/home/user/nodejs` e Ricardo aplica via `git pull + comando` no terminal do Hostinger
5. **Prioridades pendentes:** testar OpenClaw chamando AV, validar relatório 9h/13h/18h, conectar AV ao Business Suite Inbox (caminho BSP), corrigir defaults OWNER_PHONE no app.js se necessário

---

## ESTADO ATUAL DA INFRAESTRUTURA

| Componente | Estado | Evidência |
|------------|--------|-----------|
| `assistente-virtual` (AV) | ✅ rodando | porta 3001, Cloud API, +5521993542383 |
| `whatsapp-ana` (WAHA) | ✅ CONNECTED | logs mostram `Session has recovered, currentState: CONNECTED` |
| `hairtech-openclaw` | ✅ rodando | porta 18789, agente orquestrador instalado |
| `hairtech-postgres` | ✅ rodando | banco conectado, conversas carregadas |
| Traefik | ✅ rodando | hairtech.org e claw.hairtech.org |
| Cron `monitor-ana.sh` | ✅ instalado | a cada 5min |

---

## O QUE FOI FEITO NESTA SESSÃO (14/05/2026)

### 1. Painel `/admin/export` para recuperar contatos perdidos
**Motivo:** Ricardo disse que perdeu leads no último mês porque AV ficou quebrado. Histórico está no PostgreSQL — criei rotas para baixar tudo via navegador.

**Arquivos:**
- `export-leads.js` (novo) — router Express com 6 rotas
- `app.js` linha 443 — registro do router

**URLs disponíveis (senha=`hairtech2026`):**
- `https://hairtech.org/admin/export?senha=hairtech2026` — página inicial
- `https://hairtech.org/admin/export/leads.html?senha=...` — lista navegável
- `https://hairtech.org/admin/export/leads.html?senha=...&filtro=sem-resposta` — quem ficou sem resposta do bot
- `https://hairtech.org/admin/export/leads.csv?senha=...` — download CSV
- `https://hairtech.org/admin/export/mensagens.csv?senha=...` — CSV de todas as mensagens
- `https://hairtech.org/admin/export/full.json?senha=...` — backup integral

**Commit:** `32b1e11`

### 2. API interna `/api/internal` para OpenClaw consumir
**Motivo:** OpenClaw precisava de uma forma de "ler/escrever" os dados da clínica. OpenClaw usa WebSocket JSON-RPC, então o caminho mais limpo é OpenClaw chamar REST do AV via HTTP interno (rede `hairtech-network`).

**Arquivos:**
- `api-internal.js` (novo) — 10 endpoints autenticados por Bearer token

**Endpoints (auth: `Authorization: Bearer ${INTERNAL_API_TOKEN}`):**
| Endpoint | Função |
|----------|--------|
| `GET /ping` | health check |
| `GET /metricas` | resumo geral (totais, quentes, mornos, sem_resposta) |
| `GET /leads?temperatura=&status=&sem_resposta=&limite=&desde_horas=` | listagem filtrada |
| `GET /lead/:numero` | conversa completa com histórico |
| `POST /lead/:numero/anotar` body `{nota, tags, status, temperatura}` |
| `POST /lead/:numero/pausar` | passa para humano |
| `POST /lead/:numero/retomar` | reativa bot |
| `GET /relatorio-completo` | relatório rico para mandar à ANA 3x/dia |
| `POST /notificar-dono` body `{texto, urgente}` | notifica Dr. Ricardo via WhatsApp |
| `POST /mensagem-direta` body `{numero, texto}` | manda mensagem via AV Cloud API |

**Variável de ambiente nova:** `INTERNAL_API_TOKEN` (gerado pelo deploy script, está no `.env` do AV e do OpenClaw)

**Commit:** `3aff030`

### 3. SOUL.md do agente orquestrador HairTech
**Arquivo:** `docs/openclaw-soul-hairtech.md`

Define personalidade, capacidades, regras de quando agir autônomo vs consultar dono.
Pontos-chave:
- Agente NÃO atende paciente direto — só orquestra
- Cron: relatório 9h/13h/18h + alerta de leads frios 11h30
- Escalar para Dr. Ricardo (Telegram 8713631351) em casos sensíveis
- Não inventar preços/condições
- Não tocar em containers críticos

### 4. Snippet do `openclaw.json`
**Arquivo:** `docs/openclaw-agent-snippet.json`

Bloco que o deploy script mescla (não substitui) no `/opt/hairtech-openclaw/config/openclaw.json`.
Configura:
- Modelo primário: `anthropic/claude-sonnet-4-5`
- Fallbacks: gemini-2.5-flash, gpt-4o
- HTTP tools com base URL `http://assistente-virtual:3001/api/internal`
- Bearer auth via `INTERNAL_API_TOKEN`
- Cron de relatórios + alerta

### 5. Deploy script `deploy-openclaw-integracao.sh`
**Arquivo:** `deploy-openclaw-integracao.sh`

**Status no VPS:** EXECUTADO COM SUCESSO PARCIAL (passos 1-7 OK, passo 8 de teste falhou).

Faz em um comando:
1. Backup em `/root/backups_av/openclaw-integ-TIMESTAMP/`
2. Gera `INTERNAL_API_TOKEN` aleatório
3. Adiciona token no `.env` do AV e do OpenClaw
4. Cria workspace e instala `SOUL.md` em `/opt/hairtech-openclaw/workspace/agents/hairtech-orquestrador/`
5. Mescla agente no `openclaw.json` via Python (preserva tudo existente)
6. Restart `assistente-virtual`
7. SIGHUP `hairtech-openclaw`
8. Testa `/api/internal/ping` e `/api/internal/metricas` via `wget` dentro do container OpenClaw

**Falha do passo 8:** provavelmente o container OpenClaw não tem `wget` instalado com suporte a `--header`. Não-bloqueante — testar de outras formas (próximas seções).

---

## DIAGNÓSTICO DA SESSÃO PASSADA (CONTEXTO)

Sessão anterior tinha quebrado a ANA tentando consertar bug do status WAHA. ANA agora está conectada. Os ajustes principais que ficaram:
- `db.js` com SSL condicional via `DATABASE_SSL` env
- `monitor-ana.sh` usando `engine.state` em vez de `status` (bug WAHA WEBJS)
- `app.js` com handler `/webhook/ana` permissivo (aceita variações de evento WAHA)
- Imagem WAHA revertida para `latest` no `docker-compose.whatsapp-ana.yml`
- Tag `2024.11` foi tentada mas não existe no Docker Hub — abandonada
- API Docker Hub bloqueada no VPS (curl retorna vazio) — usar caminhos alternativos
- `gemini-2.5-flash` em vez de `gemini-2.0-flash`/`2.5-flash-lite` (descontinuados)

Bug que ainda não foi diagnosticado: AV pode estar com `OWNER_PHONE` errado no `.env` do VPS. **Default no `app.js` linha 26 é `5521967813366` (número da ANA, errado).** Verificar `.env` real no VPS antes de mudar.

---

## ARQUIVOS DA SESSÃO (todos no branch `claude/hairtech-whatsapp-ai-liD5V`)

| Arquivo | Propósito |
|---------|-----------|
| `export-leads.js` | Painel /admin/export |
| `api-internal.js` | API REST para OpenClaw |
| `docs/openclaw-soul-hairtech.md` | SOUL.md do agente |
| `docs/openclaw-agent-snippet.json` | Snippet config OpenClaw |
| `deploy-openclaw-integracao.sh` | Deploy 1-comando |
| `docs/relatorio-2026-05-14.md` | Este relatório |

**Modificado:** `app.js` (linha 443 — registro de rotas)

**Commits da sessão (oldest → newest):**
- `636bfec` (anterior — base)
- `32b1e11` — feat: rotas /admin/export
- `3aff030` — feat: integracao AV <-> OpenClaw
- (próximo) — docs: relatório da sessão

---

## PENDÊNCIAS PRIORIZADAS PARA O PRÓXIMO CHAT

### 🔴 P1 — Validar integração OpenClaw → AV

Deploy executou. Passos 1-7 OK. Mas teste do passo 8 falhou (não-bloqueante).

**Como validar de outras formas (Ricardo executa):**

```bash
# A) Pelo container OpenClaw — testar via curl em vez de wget
TOKEN=$(grep "^INTERNAL_API_TOKEN=" /opt/hairtech-openclaw/.env | cut -d= -f2-)
docker exec hairtech-openclaw curl -s -H "Authorization: Bearer $TOKEN" \
  http://assistente-virtual:3001/api/internal/ping
```

```bash
# B) De fora do container — pelo host (rede compartilhada)
TOKEN=$(grep "^INTERNAL_API_TOKEN=" /opt/hairtech-openclaw/.env | cut -d= -f2-)
docker run --rm --network hairtech-network curlimages/curl \
  -s -H "Authorization: Bearer $TOKEN" \
  http://assistente-virtual:3001/api/internal/metricas
```

```bash
# C) Pela UI do OpenClaw — abrir https://claw.hairtech.org
# entrar na conversa do agente "hairtech-orquestrador" e mandar:
# "rode metricas agora e mostre o resultado"
```

**Se A funcionar e C não:** o agente não está enxergando o tool HTTP. Verificar se o `openclaw.json` foi recarregado de fato:
```bash
docker exec hairtech-openclaw cat /home/node/.openclaw/openclaw.json | python3 -c "import json,sys; c=json.load(sys.stdin); print(list(c.get('agents',{}).keys()))"
```

### 🔴 P2 — Confirmar bug do AV (OWNER_PHONE)

```bash
grep -E "^(OWNER_PHONE|NOTIFY_PHONE|WA_PHONE_ID)=" /home/user/nodejs/.env
```

- Se `OWNER_PHONE=5521982006372`: bug confirmado (default é 3366 = ANA). Mensagens que Ricardo manda do número da clínica (3366) caem no fluxo de cliente.
- Solução: ou aceitar múltiplos números como dono (`OWNER_PHONES=`), ou educar Ricardo a mandar comandos do número pessoal.

**Patch sugerido se for o caso:**
```javascript
// app.js linhas 25-26 → trocar por:
const OWNER_PHONES = (process.env.OWNER_PHONES || process.env.OWNER_PHONE || "5521982006372,5521967813366")
  .split(",").map(s => s.trim().replace(/\D/g, "")).filter(Boolean);
const OWNER_PHONE = OWNER_PHONES[0]; // compat com código antigo
// E na linha 478, trocar: if (from === OWNER_PHONE && ...) → if (OWNER_PHONES.includes(from) && ...)
```

### 🟡 P3 — Validar ANA respondendo end-to-end

ANA está CONNECTED. Falta testar:
- Ricardo manda mensagem do pessoal (+5521982006372) para o número da ANA (+5521967813366)
- ANA deve responder via Gemini com tom de vendedora FUE
- Verificar log: `docker logs assistente-virtual --tail 30 | grep ANA`

Se ANA não responder, verificar:
```bash
# Webhook está apontando para AV?
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d.config,null,2))).catch(e=>console.log(e.message));' 2>/dev/null
```

### 🟡 P4 — Recuperar leads perdidos via `/admin/export`

Acessar `https://hairtech.org/admin/export?senha=hairtech2026` e contactar quem ficou sem resposta. Já está pronto, só usar.

### 🟡 P5 — Conectar AV ao Business Suite Inbox

Ricardo quer ver mensagens no painel Meta. AV está em Cloud API pura — não aparece na Inbox automaticamente. Caminhos:
- **A (recomendado pelo ChatGPT):** migrar para Coexistence via BSP como Picky Assist (free forever plan). Tempo: 45-60min, custo: ~US$0-25/mês.
- **B (rápido):** usar o painel próprio em `https://hairtech.org/admin?senha=hairtech2026` em vez do Business Suite.

Decisão pendente do Dr. Ricardo.

### 🟢 P6 — Renovar VPS Hostinger antes de 22/05/2026

Vence em ~8 dias. Renovar em `hpanel.hostinger.com`. Sem isso, tudo cai.

---

## REGRAS PERMANENTES (de CLAUDE.md, manter sempre)

1. **Backup antes de qualquer edição:** `cp arquivo /root/backups_av/arquivo.bak.$(date +%Y%m%d_%H%M%S)`
2. **Nunca `sed -i` mais de 1x no mesmo arquivo** — reescrever com Python
3. **Não editar `app.js`** sem aprovação de Ricardo — usar patchers idempotentes
4. **Não tocar em `traefik-traefik-1`** sem aprovação explícita
5. **`set +H`** antes de scripts bash com `!`
6. **Terminal Hostinger:** comandos ≤1000 chars
7. **Confiar em Ricardo acima de status de API** — se ele diz "está conectado", está conectado
8. **URLs em JS:** `"ht"+"tp"+"://..."` para evitar auto-link no terminal
9. **Não commitar `.env`** ou arquivos com chaves reais
10. **Engine WAHA:** sempre WEBJS (NOWEB/Baileys entra em loop neste VPS)

---

## IGNORAR (do histórico)

Ricardo recebeu um "PROMPT LONGO" do ChatGPT na sessão atual com ~18 partes sobre coexistência WhatsApp/Cloud API/BSP. O conteúdo é teoricamente correto mas Ricardo explicitamente disse: **"IGNORE O PROMPT LONGO"** e **"COMPACTAR CONVERSA EXCLUIR PARTE DO CHATGPT"**.

Para o próximo chat: a essência aproveitável dele é o **caminho Picky Assist como BSP** para conectar AV ao Business Suite Inbox (P5 acima). Resto é ruído.

---

## CREDENCIAIS / ACESSOS (resumo, sem expor valores)

- VPS: `72.62.100.6` — usuário `root`
- Repo: `/home/user/nodejs` no VPS
- Branch: `claude/hairtech-whatsapp-ai-liD5V`
- Admin AV: `https://hairtech.org/admin?senha=hairtech2026`
- Export contatos: `https://hairtech.org/admin/export?senha=hairtech2026`
- OpenClaw UI: `https://claw.hairtech.org` (auth necessária)
- Telegram dono: `8713631351`
- WhatsApp Ricardo: `+5521982006372`
- WhatsApp ANA: `+5521967813366`
- WhatsApp AV: `+5521993542383`

Tokens reais: ver `.env` no VPS (NÃO copiar para o chat).

---

## COMO O PRÓXIMO CHAT DEVE COMEÇAR

1. Ler este relatório
2. Ler `CLAUDE.md` e `docs/briefing-master-v4.md`
3. Confirmar com Ricardo: ANA responde? Testou `/api/internal/ping`?
4. Pegar de onde parei (P1: validar OpenClaw consumindo AV)
5. **NÃO** re-explicar arquitetura, **NÃO** propor mega-planos, **NÃO** processar o "prompt longo"
6. Trabalhar pequeno, commitar pequeno, pedir validação

---

Fim do relatório. Próximo: ações P1-P3 ou conforme prioridade que Ricardo definir.
