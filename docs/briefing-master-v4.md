# BRIEFING MASTER v4 — HairTech Assistente Virtual + ANA
# Última atualização: 12/05/2026 ~20h30 BRT
# Documento para retomada por qualquer IA sem perguntas

---

## ACESSO E CREDENCIAIS

### VPS
```
IP:      72.62.100.6
Usuário: root
OS:      Ubuntu 24.04 LTS
SSH:     ssh root@72.62.100.6
Vence:   22/05/2026 — RENOVAR em hpanel.hostinger.com URGENTE (10 dias)
```

### Painel Admin AV
```
URL:   https://hairtech.org/admin?senha=hairtech2026
Senha: hairtech2026
```

### Repositório Git
```
Repo:   https://github.com/clinica-hairtech/nodejs
Branch: claude/hairtech-whatsapp-ai-liD5V
Local:  /home/user/nodejs (no VPS)
HEAD:   b1ac587 (fix: db.js SSL condicional)
```

### Variáveis — /home/user/nodejs/.env
Ler sem expor: `grep "VARNAME" /home/user/nodejs/.env | cut -d= -f2-`

```
GEMINI_API_KEY=AIzaSy...        # Google Gemini — AV + ANA
WHATSAPP_ANA_KEY=...            # Auth WAHA container whatsapp-ana
WA_TOKEN=EAANMj...              # Meta WhatsApp Cloud API token
WA_PHONE_ID=983992428140920     # ID número AV (+5521993542383)
VERIFY_TOKEN=...                # Token verificação webhook Meta
WHATSAPP_TOKEN=...              # Alias de WA_TOKEN
PHONE_NUMBER_ID=...             # Alias de WA_PHONE_ID
ADMIN_PASS=hairtech2026         # Painel admin
DATABASE_URL=postgresql://hairtech:***@hairtech-postgres:5432/hairtechdb
DATABASE_SSL=false              # ADICIONADO HOJE — postgres local sem SSL
NOTIFY_PHONE=5521967813366
OWNER_PHONE=5521967813366
```

### .env OpenClaw — /opt/hairtech-openclaw/.env
```
ANTHROPIC_API_KEY=sk-ant-...    # Claude (Anthropic)
OPENAI_API_KEY=sk-proj-...      # OpenAI
GEMINI_API_KEY=AIzaSy...        # Gemini (mesmo do AV)
OPENCLAW_GATEWAY_TOKEN=20fc88...# Token gateway OpenClaw
```

---

## PESSOAS

| Pessoa | WhatsApp | Papel |
|--------|----------|-------|
| Dr. Ricardo | +5521982006372 | Dono — aprova mudanças críticas |
| ANA (bot) | +5521967813366 | Vendedora IA WAHA |
| AV (bot) | +5521993542383 | Assistente Virtual principal Meta API |

---

## ARQUITETURA

```
Internet → Traefik :80/:443
  hairtech.org          → assistente-virtual:3001  (AV principal)
  claw.hairtech.org     → hairtech-openclaw:18789   (OpenClaw gateway)
  ia.hairtech.org       → openai-proxy              (proxy OpenAI)
  dashboard.hairtech.org→ dashboard-frontend
  clinicahairtech.com   → wordpress-wordpress-1

Rede interna Docker (hairtech-network + web + hairtech-postgres):
  assistente-virtual   :3001  Node.js/Express — bot + banco
  whatsapp-ana         :3000  WAHA WEBJS — WhatsApp ANA
  hairtech-openclaw    :18789 Gateway AI (OpenClaw v2026.5.7)
  hairtech-postgres    :5432  PostgreSQL 15 (Alpine)
  whatsapp-inbox       :3000  Outro canal (não mexer)
  traefik              :80/443
  hairtech-authbot           Telegram auth bot
  openai-proxy               Proxy OpenAI
  dashboard-frontend   :80   Dashboard
  wordpress-wordpress-1:80   Site clínica
  wordpress-db-1       :3306 MySQL WordPress
```

### Fluxo ANA:
```
Cliente → WhatsApp +5521967813366
  → WAHA whatsapp-ana:3000 (engine WEBJS, state=CONNECTED)
  → POST http://assistente-virtual:3001/webhook/ana
  → responderAna() → Gemini API (gemini-2.5-flash)
  → enviarMsgAna() → WAHA POST /api/sendText
  → Cliente recebe resposta
```

### Fluxo AV principal:
```
Cliente → WhatsApp +5521993542383
  → Meta Cloud API webhook
  → POST https://hairtech.org/webhook
  → app.js → Gemini API (gemini-2.5-flash)
  → Meta Cloud API /messages → Cliente
```

---

## ESTADO ATUAL (12/05/2026 20h30 BRT) — TUDO OPERACIONAL

| Componente | Estado | Observação |
|------------|--------|------------|
| assistente-virtual | ✅ healthy | Up, banco conectado |
| whatsapp-ana | ✅ CONNECTED | engine.state=CONNECTED (bug cosmético: status=SCAN_QR_CODE) |
| hairtech-openclaw | ✅ healthy | gemini-2.5-flash, Telegram ativo |
| hairtech-postgres | ✅ up | PostgreSQL 15, SSL=off (correto) |
| Gemini API | ✅ ok | gemini-2.5-flash respondendo |
| Git | ✅ limpo | HEAD b1ac587, sem divergência |
| Cron monitor-ana | ✅ instalado | */5 * * * * |
| Banco de dados | ✅ pronto | 2 conversas carregadas |

---

## O QUE FOI FEITO HOJE (cronológico)

### Fase 1 — Diagnóstico e WAHA (Claude Code, madrugada)
1. Identificado que ANA estava conectada mas não respondia
2. Causa: handler `/webhook/ana` com `event !== "message"` filtrava tudo (WAHA WEBJS envia nome diferente)
3. Criado `fix_ana_webhook.py` — patcher que substitui handler por versão permissiva com logging
4. Aplicado na VPS, AV reiniciado
5. ANA reconectada via QR (escaneado pelo iPad em paisagem)

### Fase 2 — Documentação e scripts (Claude Code)
6. Criado `monitor-ana.sh` — cron a cada 5min, auto-restart ANA
7. Criado `manus_ssh_fix.sh` — diagnóstico completo para SSH
8. Atualizado `CLAUDE.md`, `docs/briefing-master-v3.md`
9. Commitados todos os arquivos no branch

### Fase 3 — Manus SSH (20h BRT)
10. Manus executou diagnóstico completo no VPS
11. Resolveu conflito `docker-compose.yml` (adicionou rede `hairtech-postgres`)
12. Criou rede Docker `hairtech-postgres` (`docker network create hairtech-postgres`)
13. Instalou cron monitor-ana
14. Gerou 3 QR Codes (primeiros 2 expiraram, 3º escaneado com sucesso ~20:23 UTC)
15. Dr. Ricardo escaneou QR — ANA conectada

### Fase 4 — Fixes críticos (Claude Code + Manus)
16. **Gemini**: trocado `gemini-2.0-flash` e `gemini-2.5-flash-lite` → `gemini-2.5-flash` (modelos antigos retornavam 404)
17. **docker-compose.yml**: restaurada rede `hairtech-postgres` (havia sido removida acidentalmente)
18. **monitor-ana.sh**: corrigido para usar `engine.state` em vez de `status` (bug WAHA WEBJS — campo `status` não atualiza após conexão)
19. **db.js**: corrigido SSL hardcoded — agora condicional via `DATABASE_SSL=true/false`
20. **.env**: adicionado `DATABASE_SSL=false`
21. **.gitignore**: adicionado `.env.save`, `whatsapp-ana-data/`, `package-lock.json`
22. **Banco**: conectou com sucesso — "Banco de dados pronto, 2 conversas carregadas"

---

## COMMITS DESTA SESSÃO

```
b1ac587  fix: db.js SSL condicional via DATABASE_SSL env var
42776f6  fix: monitor-ana.sh usar engine.state em vez de status
ad1767f  fix: restaurar rede hairtech-postgres + atualizar .gitignore
eba0842  fix: atualizar modelos Gemini descontinuados (2.0→2.5)
f7c3e1e  fix: handler /webhook/ana permissivo + briefing master v3
bcfeb01  diag: script diagnóstico completo para Manus executar via SSH
9f3874a  fix: patcher para corrigir /webhook/ana — aceitar WAHA WEBJS
799fd16  monitor-ana.sh (cron monitoramento ANA)
74ea22b  CLAUDE.md (regras permanentes)
cf6a4be  docs/briefing-ia-completo.md v2
7bf73a6  docs/relatorio-2026-05-12.md
3b1c6eb  patch_ana_webhook.py (patcher idempotente)
9d41f7f  docker-compose.whatsapp-ana.yml (WAHA WEBJS)
2a2eda8  app.js (ANA webhook + gemini inicial)
```

---

## ARQUIVOS CHAVE

| Arquivo | Local | Função |
|---------|-------|--------|
| `app.js` | `/home/user/nodejs/app.js` | AV principal (~1247 linhas) |
| `db.js` | `/home/user/nodejs/db.js` | Pool PostgreSQL (SSL condicional) |
| `SOUL.md` | `/home/user/nodejs/SOUL.md` | Personalidade ANA v5.0 |
| `CLAUDE.md` | `/home/user/nodejs/CLAUDE.md` | Regras permanentes (LER SEMPRE) |
| `docker-compose.yml` | `/home/user/nodejs/docker-compose.yml` | Container AV |
| `docker-compose.whatsapp-ana.yml` | `/home/user/nodejs/` | WAHA container |
| `patch_ana_webhook.py` | `/home/user/nodejs/` | Patcher idempotente /webhook/ana |
| `fix_ana_webhook.py` | `/home/user/nodejs/` | Fix handler permissivo (já aplicado) |
| `monitor-ana.sh` | `/home/user/nodejs/` | Cron auto-restart ANA |
| `manus_ssh_fix.sh` | `/home/user/nodejs/` | Diagnóstico SSH completo |
| OpenClaw config | `/opt/hairtech-openclaw/config/openclaw.json` | Gateway config |

### Fora do git (apenas no VPS):
```
/home/user/nodejs/.env              — chaves (NUNCA commitar)
/home/user/nodejs/whatsapp-ana-data/sessions/ — sessão WAHA
/root/backups_av/                   — backups automáticos com timestamp
/var/log/ana-monitor.log            — log do cron
```

---

## CÓDIGO CRÍTICO — app.js

### Linhas 22-27:
```javascript
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AI_MODEL       = "gemini-2.5-flash";          // atualizado hoje
const AI_BASE_URL    = "https://generativelanguage.googleapis.com/v1beta/openai";
const ADMIN_PASS     = process.env.ADMIN_PASS || "hairtech2026";
```

### Linhas 1165-1167 (ANA):
```javascript
const conversasAna  = {};
const WAHA_URL_BASE = "ht" + "tp://whatsapp-ana:3000";
const WAHA_KEY      = process.env.WHATSAPP_ANA_KEY || "";
```

### Handler /webhook/ana ATUAL (permissivo, com logging):
```javascript
app.post("/webhook/ana", async (req, res) => {
  try {
    const body    = req.body || {};
    const event   = body.event || body.type || "";
    const payload = body.payload || body.data || body;
    console.log(`[ANA] webhook event="${event}" keys=${Object.keys(body).join(",")}`);

    if (payload.fromMe) return res.sendStatus(200);
    if (!event || /status|ack|reaction|session|typing/i.test(event)) {
      return res.sendStatus(200);
    }

    const chatId = (payload.from || payload.chatId || "").toString();
    const text   = (payload.body || payload.text || payload.content || "").trim();

    if (!text || !chatId || chatId.endsWith("@g.us") || chatId === "status@broadcast") {
      return res.sendStatus(200);
    }

    console.log(`[ANA] msg de ${chatId}: ${text.slice(0, 80)}`);
    res.sendStatus(200);

    const resposta = await responderAna(chatId, text);
    await enviarMsgAna(chatId, resposta);
  } catch (e) {
    console.error("[ANA webhook]", e.message);
    if (!res.headersSent) res.sendStatus(200);
  }
});
```

### db.js linhas 3-9 (SSL condicional):
```javascript
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false
    })
  : null;
```

---

## WAHA — RECONECTAR ANA (se sessão cair)

**Verificar estado (use engine.state, não status — bug WAHA WEBJS):**
```bash
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log("engine.state:",d.engine?.state,"status:",d.status)).catch(e=>console.log(e.message));' 2>/dev/null
```
- `engine.state=CONNECTED` → OK (mesmo que status=SCAN_QR_CODE — bug cosmético)
- `engine.state=OPENING/PAIRING` → reconectando, aguardar
- `engine.state=UNKNOWN/ERROR` → precisa de QR

**Gerar QR (iPad em PAISAGEM antes de escanear):**
```bash
set +H
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
RAW=$(docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,h={"X-Api-Key":k,"Content-Type":"application/json"},B="ht"+"tp"+"://localhost:3000";(async()=>{await fetch(B+"/api/sessions/default",{method:"DELETE",headers:h});await new Promise(r=>setTimeout(r,1500));await fetch(B+"/api/sessions",{method:"POST",headers:h,body:JSON.stringify({name:"default",start:true,config:{webhooks:[{url:"ht"+"tp://assistente-virtual:3001/webhook/ana",events:["message","session.status"]}]}})});for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,4000));const s=(await(await fetch(B+"/api/sessions/default",{headers:h})).json()).status;process.stderr.write(i+" "+s+"\n");if(s==="SCAN_QR_CODE")break;}await new Promise(r=>setTimeout(r,3000));const t=await(await fetch(B+"/api/default/auth/qr?format=raw",{headers:h})).text();try{process.stdout.write(JSON.parse(t).value||"")}catch{if(t.length>20)process.stdout.write(t);}})().catch(e=>process.stderr.write(e.message));' 2>/dev/null)
[ ${#RAW} -gt 20 ] && echo "$RAW"|qrencode -t ANSIUTF8 -s 1 -m 1 && echo "ESCANEIE COM WHATSAPP DA ANA" || echo "Falhou"
```

**Regras WAHA:**
- Engine: WEBJS (NOWEB/Baileys entra em loop neste VPS — não usar)
- QR endpoint: `/api/default/auth/qr?format=raw` (NÃO `/api/sessions/default/qr` → 404)
- URL concat: `"ht"+"tp"+"://..."` (terminal Hostinger auto-linka URLs)
- **NUNCA** deletar sessão se Ricardo disser "está conectado"

---

## OPENCLAW

```
Container:  hairtech-openclaw
Porta:      18789 (interna)
UI:         https://claw.hairtech.org (HTTP 401 = normal, requer auth)
Protocolo:  WebSocket JSON-RPC (NÃO REST)
Config:     /opt/hairtech-openclaw/config/openclaw.json
.env:       /opt/hairtech-openclaw/.env
bind:       "lan" — NUNCA mudar para "public" (crash imediato)
Versão:     2026.5.7
Modelo:     gemini-2.5-flash (thinking=medium)
Fallbacks:  anthropic/claude-sonnet-4-5, openai/gpt-4o, gemini-2.5-pro
Plugins:    browser, device-pair, file-transfer, memory-core,
            phone-control, talk-voice, telegram
Channels:   Telegram (@hairtech_auth_bot ativo)
Owner:      telegram:8713631351 (Dr. Ricardo)
```

---

## DIAGNÓSTICO RÁPIDO (colar no terminal VPS)

```bash
set +H
echo "=== CONTAINERS ===" && docker ps --format "{{.Names}}\t{{.Status}}"
echo "=== ANA ===" && KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-) && docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log("engine.state:",d.engine?.state)).catch(e=>console.log(e.message));' 2>/dev/null
echo "=== AV LOGS ===" && docker logs assistente-virtual --tail 10 2>&1 | grep -i "ANA\|erro\|banco\|gemini"
echo "=== CRON ===" && crontab -l | grep monitor-ana
```

---

## TRAEFIK LABELS AV

```yaml
traefik.enable: "true"
traefik.docker.network: "web"
traefik.http.routers.av.rule: >
  Host(`hairtech.org`) && (PathPrefix(`/webhook`) || PathPrefix(`/health`) ||
  PathPrefix(`/comprovantes`) || PathPrefix(`/historico`) ||
  PathPrefix(`/admin`) || PathPrefix(`/status`) || PathPrefix(`/nfse`))
traefik.http.routers.av.priority: "300"
traefik.http.services.av.loadbalancer.server.port: "3001"
```

---

## REGRAS OBRIGATÓRIAS

1. **Backup antes de qualquer edição:** `cp arquivo /root/backups_av/arquivo.bak.$(date +%Y%m%d_%H%M%S)`
2. **NUNCA `sed -i` mais de 1x no mesmo arquivo** — reescrever com Python
3. **NÃO editar app.js sem aprovação de Ricardo** — usar patchers Python
4. **NÃO reiniciar traefik** sem aprovação explícita
5. **`set +H`** antes de scripts bash com `!`
6. **URLs em JS:** `const B = "ht"+"tp"+"://localhost:3000"` (evitar auto-link)
7. **NUNCA commitar .env** ou arquivos com chaves
8. **NUNCA push para main** — branch: `claude/hairtech-whatsapp-ai-liD5V`
9. **NUNCA confiar em API status acima de Ricardo** — se ele diz "conectado", está conectado
10. **Comandos ≤1000 chars** no terminal Hostinger Browser Terminal
11. **Manus**: usar só se estritamente necessário — consome créditos rápido

---

## PENDÊNCIAS

| # | Prioridade | Tarefa | Como |
|---|-----------|--------|------|
| 1 | 🔴 URGENTE | Renovar VPS vence 22/05/2026 | hpanel.hostinger.com (Ricardo) |
| 2 | 🔴 CRÍTICO | Testar ANA end-to-end | Enviar msg para +5521967813366 |
| 3 | 🟡 IMPORTANTE | Meta Developers → Business Suite inbox | developers.facebook.com (Ricardo) |
| 4 | 🟡 IMPORTANTE | Trocar senha SSH (foi exposta no chat) | `passwd root` no VPS |
| 5 | 🟢 MELHORIA | Sincronizar SOUL.md v5.0 completo no ANA_SYSTEM_PROMPT | Editar patch_ana_webhook.py |
| 6 | 🟢 MELHORIA | Migrar ANA de Gemini para Claude API | ANTHROPIC_API_KEY existe no OpenClaw .env |

---

## ANA — PERSONALIDADE E PREÇOS

- Especialista transplante capilar FUE — Clínica HairTech
- Rio de Janeiro / Niterói / Barra da Tijuca
- Preços: R$8.000–R$10.000 (FUE completo) / R$300–R$400 (consulta)
- Sinal: R$150 Pix CNPJ 49.634.881/0001-91
- Emergência médica → Dr. Ricardo +5521982006372
- Histórico: 20 mensagens por usuário (em memória, não persistido)
- Ignora: fromMe, grupos (@g.us), status@broadcast
- Personalidade completa: SOUL.md v5.0

---

## PARA RETOMAR DO ZERO

1. Ler `CLAUDE.md` (regras)
2. Ler este arquivo (`docs/briefing-master-v4.md`)
3. Ler `SOUL.md` (personalidade ANA)
4. Rodar diagnóstico rápido (seção acima)
5. Verificar pendências e executar por prioridade
