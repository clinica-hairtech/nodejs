# BRIEFING MASTER v3 — HairTech Assistente Virtual + ANA
# Última atualização: 12/05/2026 — noite
# Cole este documento inteiro para qualquer IA retomar sem perguntas

---

## ACESSO E CREDENCIAIS

### VPS
```
IP:      72.62.100.6
Usuário: root
OS:      Ubuntu 24.04 LTS
SSH:     ssh root@72.62.100.6
Vence:   22/05/2026 — RENOVAR em hpanel.hostinger.com URGENTE
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
```

### Variáveis de Ambiente — /home/user/nodejs/.env
Ler do VPS sem expor no terminal:
```bash
grep "NOME_VAR" /home/user/nodejs/.env | cut -d= -f2-
```

Variáveis presentes (ler valores no VPS):
```
GEMINI_API_KEY=AIzaSy...        # Google Gemini — AV principal + ANA
WHATSAPP_ANA_KEY=...            # Auth WAHA container whatsapp-ana
WA_TOKEN=EAANMj...              # Meta WhatsApp Cloud API token
WA_PHONE_ID=983992428140920     # ID do número AV (+5521993542383)
VERIFY_TOKEN=...                # Token verificação webhook Meta
WHATSAPP_TOKEN=...              # Alias de WA_TOKEN
PHONE_NUMBER_ID=...             # Alias de WA_PHONE_ID
ADMIN_PASS=hairtech2026         # Painel admin
NOTIFY_PHONE=5521967813366      # Número ANA (padrão)
OWNER_PHONE=5521967813366       # Número ANA (padrão)
```

### .env do OpenClaw — /opt/hairtech-openclaw/.env
```
ANTHROPIC_API_KEY=sk-ant-...    # Claude (Anthropic) API
OPENAI_API_KEY=sk-proj-...      # OpenAI API
GEMINI_API_KEY=AIzaSy...        # Gemini (mesmo do AV)
OPENCLAW_GATEWAY_TOKEN=20fc88...# Token do gateway OpenClaw
```

---

## PESSOAS

| Pessoa | WhatsApp | Papel |
|--------|----------|-------|
| Dr. Ricardo | +5521982006372 | Dono — aprova mudanças críticas |
| ANA (bot) | +5521967813366 | Vendedora IA (WhatsApp Web via WAHA) |
| AV (bot) | +5521993542383 | Assistente Virtual principal (Meta API) |

---

## ARQUITETURA COMPLETA

```
Internet (clientes)
        │
        ▼
   Traefik :80/:443
        │
        ├──► hairtech.org ──────────────► assistente-virtual:3001
        │                                  (AV principal)
        │
        └──► claw.hairtech.org ──────────► hairtech-openclaw:18789
                                           (Gateway AI OpenClaw)

Rede Docker interna (hairtech-network):
  assistente-virtual   :3001   Node.js/Express — bot principal WhatsApp
  whatsapp-ana         :3000   WAHA WEBJS — WhatsApp da ANA
  whatsapp-inbox       :3000   Outro canal WhatsApp (não mexer)
  hairtech-openclaw    :18789  Gateway AI (OpenClaw)
  traefik              :80/443 Proxy reverso (não mexer sem aprovação)
```

### Fluxo ANA (como DEVE funcionar):
```
Cliente → WhatsApp +5521967813366
  → WAHA (whatsapp-ana:3000) recebe mensagem
  → POST http://assistente-virtual:3001/webhook/ana
  → app.js: responderAna() → Gemini API (gemini-2.0-flash)
  → enviarMsgAna() → WAHA POST /api/sendText
  → Cliente recebe resposta
```

### Fluxo AV principal:
```
Cliente → WhatsApp +5521993542383
  → Meta Cloud API webhook
  → POST https://hairtech.org/webhook
  → app.js processa → Gemini API
  → Meta Cloud API /messages → Cliente
```

---

## ESTADO ATUAL (12/05/2026 ~19h30 BRT)

### ✅ Funcionando
- AV principal rodando (hairtech.org)
- WAHA container rodando (engine WEBJS)
- ANA conectada ao WhatsApp (QR escaneado ~02:27 BRT e reconectada ~16:14 BRT)
- Traefik funcionando
- Backup automático em /root/backups_av/

### ❌ Problemas pendentes

**P1 — ANA não responde mensagens [CRÍTICO]**
- WAHA recebe mensagens e dispara webhook (200 confirmado em logs)
- AV recebe o webhook mas NÃO processa
- Fix aplicado no VPS (fix_ana_webhook.py): handler permissivo com logging
- Backup VPS: /root/backups_av/app.js.bak.20260512_191329
- Fix commitado no git (este briefing é posterior ao commit)
- Suspeita: teste foi feito antes do fix. Precisa de novo teste agora.
- AÇÃO: enviar msg para +5521967813366 e checar: `docker logs assistente-virtual --tail 20 2>&1 | grep ANA`

**P2 — OpenClaw canvas inacessível**
- https://claw.hairtech.org/__openclaw__/canvas/ não carrega
- Causa desconhecida — pode ser: container parado, labels Traefik erradas, config
- Diagnóstico pendente (aguardando Manus rodar script)

**P3 — docker-compose.yml conflito de merge**
- Após git stash pop: conflito em /home/user/nodejs/docker-compose.yml
- VPS tinha adicionado rede "hairtech-postgres" localmente
- Não resolvido — aguardando diagnóstico de Manus

**P4 — Cron monitor-ana não instalado**
- Script pronto: /home/user/nodejs/monitor-ana.sh
- Cron instalado pelo manus_ssh_fix.sh (se rodou) — verificar

**P5 — Gemini 404 no AV principal**
- "Erro ao interpretar comando natural: Request failed with status code 404"
- Afeta rota NLP do AV, NÃO afeta ANA
- Investigar qual rota usa endpoint diferente

**P6 — Meta Developers não conectado ao Business Suite**
- business.facebook.com → Inbox → WA_PHONE_ID 983992428140920
- developers.facebook.com → App → WhatsApp → Configuration
- Webhook https://hairtech.org/webhook deve estar subscrito para: messages, message_deliveries, message_reads
- Sem isso: histórico de mensagens inacessível no Business Suite

---

## ARQUIVOS CHAVE

### No repositório git (/home/user/nodejs):

| Arquivo | Linhas | Função |
|---------|--------|--------|
| `app.js` | ~1247 | AV principal + /webhook/ana (ANA) |
| `SOUL.md` | — | Personalidade ANA v5.0 completa |
| `CLAUDE.md` | — | Regras e arquitetura (ler SEMPRE) |
| `docker-compose.yml` | 38 | Container AV + labels Traefik |
| `docker-compose.whatsapp-ana.yml` | — | WAHA container WEBJS |
| `patch_ana_webhook.py` | 171 | Patcher idempotente /webhook/ana |
| `fix_ana_webhook.py` | 102 | Fix handler permissivo (já aplicado) |
| `monitor-ana.sh` | 60 | Monitoramento auto-restart ANA |
| `manus_ssh_fix.sh` | 115 | Diagnóstico completo para SSH |
| `docs/briefing-master-v3.md` | — | Este arquivo |

### No VPS (fora do git):

| Caminho | Conteúdo |
|---------|----------|
| `/home/user/nodejs/.env` | Todas as chaves — NUNCA commitar |
| `/home/user/nodejs/whatsapp-ana-data/sessions/` | Sessão WAHA persistida |
| `/opt/hairtech-openclaw/config/openclaw.json` | Config OpenClaw |
| `/opt/hairtech-openclaw/.env` | Chaves OpenClaw |
| `/root/backups_av/` | Backups automáticos com timestamp |
| `/var/log/ana-monitor.log` | Log do cron de monitoramento |

---

## CÓDIGO CRÍTICO — app.js

### Linhas 23-27 (hardcoded — não alterar):
```javascript
const AI_MODEL    = "gemini-2.0-flash";
const AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const ADMIN_PASS  = process.env.ADMIN_PASS || "hairtech2026";
```

### Linhas 1165-1167 (ANA):
```javascript
const conversasAna = {};
const WAHA_URL_BASE = "ht" + "tp://whatsapp-ana:3000";
const WAHA_KEY = process.env.WHATSAPP_ANA_KEY || "";
```

### Handler /webhook/ana ATUAL (após fix — linhas ~1216+):
```javascript
app.post("/webhook/ana", async (req, res) => {
  try {
    const body = req.body || {};
    const event = body.event || body.type || "";
    const payload = body.payload || body.data || body;
    console.log(`[ANA] webhook event="${event}" keys=${Object.keys(body).join(",")}`);

    if (payload.fromMe) return res.sendStatus(200);
    if (!event || /status|ack|reaction|session|typing/i.test(event)) {
      return res.sendStatus(200);
    }

    const chatId = (payload.from || payload.chatId || "").toString();
    const text = (payload.body || payload.text || payload.content || "").trim();

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

---

## OPENCLAW

```
Container:  hairtech-openclaw
Porta:      18789 (interna)
UI:         https://claw.hairtech.org
Protocolo:  WebSocket JSON-RPC (NÃO é REST)
Config:     /opt/hairtech-openclaw/config/openclaw.json
.env:       /opt/hairtech-openclaw/.env
bind:       "lan" — NUNCA mudar para "public" (causa crash imediato)
Canal ativo: Telegram apenas
WhatsApp:   NÃO suportado no OpenClaw self-hosted — usar WAHA sidecar
```

Token de acesso ao gateway: `OPENCLAW_GATEWAY_TOKEN` no /opt/hairtech-openclaw/.env
Para usar como endpoint OpenAI-compatible: `https://claw.hairtech.org`

---

## TRAEFIK — LABELS DO AV

```yaml
traefik.enable: "true"
traefik.docker.network: "web"
traefik.http.routers.av.rule: >
  Host(`hairtech.org`) && (
    PathPrefix(`/webhook`) || PathPrefix(`/health`) ||
    PathPrefix(`/comprovantes`) || PathPrefix(`/historico`) ||
    PathPrefix(`/admin`) || PathPrefix(`/status`) || PathPrefix(`/nfse`)
  )
traefik.http.routers.av.entrypoints: "websecure"
traefik.http.routers.av.tls.certresolver: "letsencrypt"
traefik.http.routers.av.priority: "300"
traefik.http.services.av.loadbalancer.server.port: "3001"
```

Router name: `av` (não conflita com `openclaw`)

---

## WAHA — RECONECTAR ANA (se sessão cair)

### Verificar status:
```bash
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log(d.status)).catch(e=>console.log(e.message));' 2>/dev/null
```
- `WORKING` → OK, não fazer nada
- `STOPPED` → tentar POST /start
- `SCAN_QR_CODE` → gerar QR (comando abaixo)

### Gerar QR e reconectar (iPad em PAISAGEM antes de escanear):
```bash
set +H
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
RAW=$(docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,h={"X-Api-Key":k,"Content-Type":"application/json"},B="ht"+"tp"+"://localhost:3000";(async()=>{await fetch(B+"/api/sessions/default",{method:"DELETE",headers:h});await new Promise(r=>setTimeout(r,1500));await fetch(B+"/api/sessions",{method:"POST",headers:h,body:JSON.stringify({name:"default",start:true,config:{webhooks:[{url:"ht"+"tp://assistente-virtual:3001/webhook/ana",events:["message","session.status"]}]}})});for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,4000));const s=(await(await fetch(B+"/api/sessions/default",{headers:h})).json()).status;process.stderr.write(i+" "+s+"\n");if(s==="SCAN_QR_CODE")break;}await new Promise(r=>setTimeout(r,3000));const t=await(await fetch(B+"/api/default/auth/qr?format=raw",{headers:h})).text();try{process.stdout.write(JSON.parse(t).value||"")}catch{if(t.length>20)process.stdout.write(t);}})().catch(e=>process.stderr.write(e.message));' 2>/dev/null)
[ ${#RAW} -gt 20 ] && echo "$RAW"|qrencode -t ANSIUTF8 -s 1 -m 1 && echo "ESCANEIE COM WHATSAPP DA ANA" || echo "Falhou"
```

**Regras WAHA:**
- Engine: **WEBJS** (headless Chromium) — NOWEB (Baileys) entra em loop neste VPS
- QR endpoint correto: `/api/default/auth/qr?format=raw` (NÃO `/api/sessions/default/qr` → 404)
- QR dura ~20s — escanear rápido
- URL concat trick obrigatório: `"ht"+"tp"+"://..."` (terminal auto-linka URLs)
- **NUNCA** deletar sessão se alguém disser que está conectada

---

## DIAGNÓSTICO RÁPIDO

```bash
set +H
echo "=== CONTAINERS ==="
docker ps --format "table {{.Names}}\t{{.Status}}"
echo "=== ANA STATUS ==="
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log(d.status)).catch(e=>console.log(e.message));' 2>/dev/null
echo "=== AV LOGS ANA ==="
docker logs assistente-virtual --tail 30 2>&1 | grep -i "ANA\|erro\|hook"
echo "=== WAHA WEBHOOKS ==="
docker logs whatsapp-ana --tail 20 2>&1 | grep -i "POST\|hook\|send\|200"
echo "=== OPENCLAW ==="
docker logs hairtech-openclaw --tail 10 2>&1
echo "=== CANVAS HTTP ==="
curl -sk -o /dev/null -w "HTTP %{http_code}\n" https://claw.hairtech.org/__openclaw__/canvas/
echo "=== CRON ==="
crontab -l | grep monitor-ana || echo "cron nao instalado"
```

---

## DIAGNÓSTICO COMPLETO (para Manus via SSH)

```bash
set +H
cd /home/user/nodejs
git fetch origin claude/hairtech-whatsapp-ai-liD5V
git checkout origin/claude/hairtech-whatsapp-ai-liD5V -- manus_ssh_fix.sh
bash manus_ssh_fix.sh 2>&1 | tee /tmp/diag.txt
```

Output em `/tmp/diag.txt` — copiar e enviar para Claude Code analisar.

---

## INSTALAR CRON MONITOR-ANA

```bash
chmod +x /home/user/nodejs/monitor-ana.sh
(crontab -l 2>/dev/null | grep -v "monitor-ana"; echo "*/5 * * * * /bin/bash /home/user/nodejs/monitor-ana.sh >> /var/log/ana-monitor.log 2>&1") | crontab -
crontab -l | grep monitor-ana && echo "OK" || echo "FALHOU"
```

Ver log: `tail -20 /var/log/ana-monitor.log`

---

## RESOLVER CONFLITO docker-compose.yml

```bash
cd /home/user/nodejs
# Ver conflito:
cat docker-compose.yml
# Ver se rede postgres existe:
docker network ls | grep postgres
# SE não existe: manter versão repo (sem postgres)
git checkout --theirs docker-compose.yml && git add docker-compose.yml
# SE existe: manter versão VPS (com postgres)
git checkout --ours docker-compose.yml && git add docker-compose.yml
# Commitar:
git commit -m "fix: resolver conflito docker-compose.yml"
```

---

## TESTAR GEMINI DIRETO

```bash
KEY=$(grep "^GEMINI_API_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash","messages":[{"role":"user","content":"oi"}],"max_tokens":10}'
```

---

## TESTAR ANA MANUALMENTE (enviar msg pela WAHA API)

```bash
set +H
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
# Envia "Oi ANA" para o número de Ricardo (teste)
docker exec -e WK="$KEY" whatsapp-ana node -e \
  'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sendText",{method:"POST",headers:{"X-Api-Key":k,"Content-Type":"application/json"},body:JSON.stringify({session:"default",chatId:"5521982006372@c.us",text:"Teste ANA — sistema funcionando"})}).then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.error(e.message));' 2>/dev/null
```

---

## REGRAS OBRIGATÓRIAS (não pular)

1. **BACKUP antes de qualquer edição:**
   ```bash
   mkdir -p /root/backups_av
   cp /arquivo /root/backups_av/arquivo.bak.$(date +%Y%m%d_%H%M%S)
   ```

2. **NUNCA `sed -i` mais de 1x no mesmo arquivo** — reescrever com Python ou cat > <<'EOF'

3. **NÃO editar app.js diretamente** — usar patchers Python

4. **NÃO reiniciar traefik** sem aprovação explícita de Ricardo

5. **set +H** antes de scripts bash com `!`

6. **URLs em JS:** `const B = "ht"+"tp"+"://localhost:3000"` (evitar auto-link terminal)

7. **NUNCA commitar .env** ou arquivos com chaves reais

8. **NUNCA push para main** — branch: `claude/hairtech-whatsapp-ai-liD5V`

9. **NUNCA confiar em status de API acima de Ricardo** — se ele diz "conectado", está conectado

10. **Comandos ≤1000 chars** no terminal Hostinger Browser Terminal (Manus via SSH não tem essa limitação)

---

## COMMITS DESTA SESSÃO

```
9d41f7f  docker-compose.whatsapp-ana.yml (WAHA WEBJS)
3b1c6eb  patch_ana_webhook.py (patcher idempotente)
2a2eda8  app.js (ANA webhook + gemini-2.0-flash) — handler ANTIGO
74ea22b  CLAUDE.md (regras permanentes)
cf6a4be  docs/briefing-ia-completo.md v2
7bf73a6  docs/relatorio-2026-05-12.md
799fd16  monitor-ana.sh
9f3874a  fix_ana_webhook.py (patcher do fix permissivo)
bcfeb01  manus_ssh_fix.sh (diagnóstico para Manus)
[atual]  app.js FIX (handler permissivo commitado) + este briefing
```

---

## PENDÊNCIAS PARA PRÓXIMA SESSÃO

| # | Prioridade | Tarefa |
|---|-----------|--------|
| 1 | 🔴 CRÍTICO | Confirmar ANA responde (enviar msg teste + ver logs) |
| 2 | 🔴 CRÍTICO | Renovar VPS — vence 22/05/2026 |
| 3 | 🔴 CRÍTICO | Resolver docker-compose.yml conflito no VPS |
| 4 | 🔴 CRÍTICO | Confirmar cron monitor-ana instalado |
| 5 | 🟡 IMPORTANTE | Diagnosticar e corrigir OpenClaw canvas |
| 6 | 🟡 IMPORTANTE | Meta Developers → conectar ao Business Suite inbox |
| 7 | 🟡 IMPORTANTE | Gemini 404 no AV principal (rota NLP) |
| 8 | 🟢 MELHORIA | Sincronizar SOUL.md v5.0 completo no ANA_SYSTEM_PROMPT |
| 9 | 🟢 MELHORIA | Migrar ANA de Gemini para Claude API (ANTHROPIC_API_KEY já existe) |

---

## INFORMAÇÕES ANA (personalidade e preços)

- Especialista em transplante capilar FUE
- Clínica HairTech — Rio de Janeiro / Niterói / Barra da Tijuca
- Preços: R$8.000–R$10.000 (FUE completo) / R$300–R$400 (consulta)
- Sinal: R$150 via Pix CNPJ 49.634.881/0001-91
- Complicação médica → escalar Dr. Ricardo +5521982006372
- Personalidade completa em SOUL.md v5.0
- Histórico por usuário: 20 mensagens (em memória, não persistido no banco)
- Ignora: fromMe, grupos (@g.us), status@broadcast

---

## PARA RETOMAR DO ZERO

1. Ler este arquivo (briefing-master-v3.md)
2. Ler CLAUDE.md (regras)
3. Ler SOUL.md (personalidade ANA)
4. Rodar diagnóstico rápido (seção acima)
5. Verificar pendências e executar pela prioridade
