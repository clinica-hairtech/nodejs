# BRIEFING COMPLETO — HAIRTECH ASSISTENTE VIRTUAL
# Versão 2 — 12/05/2026 — Atualizado manhã do dia seguinte
# Cole este documento inteiro para qualquer IA retomar o projeto do zero

---

## SITUAÇÃO ATUAL (12/05/2026 manhã)

**ANA está conectada ao WhatsApp mas NÃO responde mensagens.**

- Sessão WAHA: WORKING (QR escaneado)
- Mensagens chegam: sim (Ricardo confirma "visualiza")
- Respostas saem: NÃO

**Causa mais provável:** WAHA não está disparando webhook para o AV, ou o Gemini está falhando silenciosamente. Ver seção "DIAGNÓSTICO E CORREÇÃO ANA" abaixo.

---

## QUEM É VOCÊ AGORA

Você assumiu a manutenção do sistema de atendimento automatizado WhatsApp da **Clínica HairTech** (transplante capilar FUE, Rio de Janeiro/Niterói/Barra).

**Dono:** Dr. Ricardo — WhatsApp +5521982006372 — aprova mudanças críticas.
**Repositório:** `clinica-hairtech/nodejs`
**Branch ativa:** `claude/hairtech-whatsapp-ai-liD5V`
**VPS:** `72.62.100.6` — Ubuntu 24.04 — Hostinger — **VENCE 22/05/2026 — RENOVAR EM hpanel.hostinger.com**
**Painel AV:** https://hairtech.org/admin?senha=hairtech2026
**OpenClaw UI:** https://claw.hairtech.org

---

## OS DOIS BOTS

### AV — Assistente Virtual (bot principal, WhatsApp Business API)
- Número: +5521993542383
- URL pública: https://hairtech.org
- Container: `assistente-virtual` (node:20-alpine, porta 3001)
- Arquivo: `/home/user/nodejs/app.js` (1246 linhas)
- Usa Meta Cloud API (WA_TOKEN + WA_PHONE_ID)
- `WA_PHONE_ID = 983992428140920`

### ANA — Vendedora IA (WhatsApp Web via WAHA)
- Número: +5521967813366
- Personalidade completa: `/home/user/nodejs/SOUL.md` (v5.0)
- Container: `whatsapp-ana` (devlikeapro/whatsapp-http-api:latest)
- Engine: **WEBJS** (headless Chromium) — NOWEB NÃO funciona neste VPS
- Especialista em vendas de transplante FUE
- Preços: R$8.000–R$10.000 FUE / R$300–R$400 consulta / sinal R$150 Pix CNPJ 49.634.881/0001-91

---

## ARQUITETURA COMPLETA

```
Internet
   ↓
Traefik (portas 80/443)
   ├─ hairtech.org      → assistente-virtual:3001
   └─ claw.hairtech.org → hairtech-openclaw:18789

Rede Docker interna (hairtech-network):
   assistente-virtual   :3001   AV principal (Node.js / Express)
   whatsapp-ana         :3000   WAHA — WhatsApp Web da ANA
   whatsapp-inbox       :3000   outro canal WhatsApp (não mexer)
   hairtech-openclaw    :18789  Gateway AI (OpenClaw)
   traefik              :80/443 Proxy reverso (não mexer)
```

### Fluxo ANA (deve funcionar assim):
```
Cliente WhatsApp
  → whatsapp-ana (WAHA WEBJS porta 3000)
  → POST http://assistente-virtual:3001/webhook/ana
  → responderAna() → Gemini API gemini-2.0-flash
  → enviarMsgAna() → WAHA POST /api/sendText
  → Cliente recebe resposta
```

### Fluxo AV principal:
```
Cliente WhatsApp
  → Meta Cloud API webhook
  → POST https://hairtech.org/webhook
  → app.js processa → Gemini API
  → Meta Cloud API /messages → Cliente
```

---

## VARIÁVEIS CHAVE NO app.js (linhas exatas)

```javascript
// linha 23-24 — hardcoded, correto, não alterar
const AI_MODEL    = "gemini-2.0-flash";
const AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

// linha 22 — vem do .env
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// linha 1166-1167 — ANA
const WAHA_URL_BASE = "ht" + "tp://whatsapp-ana:3000";
const WAHA_KEY = process.env.WHATSAPP_ANA_KEY || "";

// linha 1216 — endpoint
app.post("/webhook/ana", async (req, res) => { ... });
```

---

## DIAGNÓSTICO E CORREÇÃO — ANA NÃO RESPONDE

### Passo 1: Rodar diagnóstico completo
```bash
echo "=== CONTAINERS ==="
docker ps --format "table {{.Names}}\t{{.Status}}"
echo "=== WAHA enviando webhook? ==="
docker logs whatsapp-ana --tail 30 2>&1 | grep -i "hook\|POST\|200\|error\|send"
echo "=== AV recebendo msgs? ==="
docker logs assistente-virtual --tail 40 2>&1 | grep -i "\[ANA\]\|webhook\|404\|erro\|gemini"
echo "=== WAHA_KEY no AV ==="
docker exec assistente-virtual env | grep WHATSAPP_ANA
```

### Passo 2: Interpretar resultado

**Se logs do WAHA NÃO mostram POST para /webhook/ana:**
```bash
# Recriar sessão COM webhook configurado explicitamente
set +H
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,h={"X-Api-Key":k,"Content-Type":"application/json"},B="ht"+"tp"+"://localhost:3000";(async()=>{await fetch(B+"/api/sessions/default",{method:"DELETE",headers:h});await new Promise(r=>setTimeout(r,2000));const r=await fetch(B+"/api/sessions",{method:"POST",headers:h,body:JSON.stringify({name:"default",start:true,config:{webhooks:[{url:"ht"+"tp://assistente-virtual:3001/webhook/ana",events:["message","session.status"]}]}})});console.log("CREATE",r.status,await r.text());})().catch(e=>console.error(e.message));' 2>/dev/null
# Depois gerar QR e escanear novamente (ver seção RECONECTAR ANA)
```

**Se logs do AV mostram [ANA] mas sem resposta (Gemini falhando):**
```bash
# Testar Gemini diretamente
KEY=$(grep "^GEMINI_API_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash","messages":[{"role":"user","content":"oi"}],"max_tokens":10}' | head -c 200
```

**Se WAHA_KEY vazio no AV:**
```bash
# Verificar se WHATSAPP_ANA_KEY está no .env
grep "WHATSAPP_ANA_KEY" /home/user/nodejs/.env
# Se não estiver, adicionar:
echo "WHATSAPP_ANA_KEY=VALOR_DA_CHAVE" >> /home/user/nodejs/.env
docker restart assistente-virtual
```

**Se enviarMsgAna falha (AV responde mas WAHA rejeita):**
```bash
# Testar sendText manual
set +H
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sendText",{method:"POST",headers:{"X-Api-Key":k,"Content-Type":"application/json"},body:JSON.stringify({session:"default",chatId:"5521982006372@c.us",text:"Teste ANA"})}).then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.error(e.message));' 2>/dev/null
```
(substitua 5521982006372 pelo número de teste)

---

## COMO RECONECTAR ANA AO WHATSAPP (QR)

**REGRA:** NUNCA deletar sessão se alguém disser que está conectada. Só deletar se confirmado que caiu.

**Verificar status:**
```bash
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log(d.status)).catch(e=>console.log(e.message));' 2>/dev/null
```
- `WORKING` → conectada, não fazer nada
- `STOPPED` → tentar start (comando abaixo)
- `SCAN_QR_CODE` → gerar QR (comando abaixo)

**Gerar QR — iPad em MODO PAISAGEM antes de escanear:**
```bash
set +H
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
RAW=$(docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,h={"X-Api-Key":k,"Content-Type":"application/json"},B="ht"+"tp"+"://localhost:3000";(async()=>{await fetch(B+"/api/sessions/default",{method:"DELETE",headers:h});await new Promise(r=>setTimeout(r,1500));await fetch(B+"/api/sessions",{method:"POST",headers:h,body:JSON.stringify({name:"default",start:true,config:{webhooks:[{url:"ht"+"tp://assistente-virtual:3001/webhook/ana",events:["message","session.status"]}]}})});for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,4000));const s=(await(await fetch(B+"/api/sessions/default",{headers:h})).json()).status;process.stderr.write(i+" "+s+"\n");if(s==="SCAN_QR_CODE")break;}await new Promise(r=>setTimeout(r,3000));const t=await(await fetch(B+"/api/default/auth/qr?format=raw",{headers:h})).text();try{process.stdout.write(JSON.parse(t).value||"")}catch{if(t.length>20)process.stdout.write(t);}})().catch(e=>process.stderr.write(e.message));' 2>/dev/null)
[ ${#RAW} -gt 20 ] && echo "$RAW"|qrencode -t ANSIUTF8 -s 1 -m 1 && echo "ESCANEIE COM WHATSAPP DA ANA" || echo "Falhou"
```
Aguarda ~80s. QR dura 20s — escanear rápido.

**Endpoint QR correto:** `/api/default/auth/qr?format=raw`
**ERRADO (404):** `/api/sessions/default/qr`
**Engine:** WEBJS. NOWEB entra em loop "Connection Failure" neste VPS.

---

## TODOS OS ARQUIVOS E LOCALIZAÇÕES

### Repositório git:
| Arquivo | Função |
|---------|--------|
| `app.js` | AV principal — 1246 linhas — /webhook/ana + gemini-2.0-flash |
| `SOUL.md` | Personalidade ANA v5.0 completa |
| `docker-compose.yml` | Container AV + labels Traefik |
| `docker-compose.whatsapp-ana.yml` | Container WAHA (engine WEBJS) |
| `patch_ana_webhook.py` | Patcher idempotente — adiciona /webhook/ana ao app.js |
| `monitor-ana.sh` | Script monitoramento auto-restart sessão ANA |
| `CLAUDE.md` | Regras e arquitetura para Claude Code |
| `docs/briefing-ia-completo.md` | Este arquivo |
| `docs/relatorio-2026-05-12.md` | Relatório detalhado da sessão |

### VPS (fora do git):
| Caminho | Conteúdo |
|---------|----------|
| `/home/user/nodejs/.env` | Todas as chaves — NÃO commitar |
| `/home/user/nodejs/whatsapp-ana-data/sessions/` | Sessão WAHA persistida |
| `/opt/hairtech-openclaw/config/openclaw.json` | Config OpenClaw |
| `/opt/hairtech-openclaw/.env` | Chaves OpenClaw |
| `/root/backups_av/` | Backups automáticos |
| `/var/log/ana-monitor.log` | Log do cron de monitoramento |

---

## VARIÁVEIS DE AMBIENTE (.env do AV)

```
GEMINI_API_KEY=AIzaSy...              # Google Gemini — usado pelo AV e ANA
WHATSAPP_ANA_KEY=...                  # Chave auth WAHA (container ANA)
WA_TOKEN=EAANMj...                    # WhatsApp Business Cloud API
WA_PHONE_ID=983992428140920           # Phone ID do AV (+5521993542383)
VERIFY_TOKEN=...                      # Token verificação webhook Meta
WHATSAPP_TOKEN=...                    # Mesmo que WA_TOKEN (alias)
PHONE_NUMBER_ID=...                   # Mesmo que WA_PHONE_ID (alias)
ADMIN_PASS=hairtech2026               # Senha painel admin
```

### .env do OpenClaw (/opt/hairtech-openclaw/.env):
```
ANTHROPIC_API_KEY=sk-ant...           # Claude API
OPENAI_API_KEY=sk-proj...             # OpenAI
GEMINI_API_KEY=AIzaSy...              # Gemini (mesmo do AV)
OPENCLAW_GATEWAY_TOKEN=20fc88...      # Token gateway
```

---

## OPENCLAW

- Container: `hairtech-openclaw`, porta 18789
- UI: https://claw.hairtech.org — protocolo **WebSocket JSON-RPC**, NÃO é REST
- `bind: "lan"` — **NUNCA alterar para "public"** (causa crash imediato)
- Canal ativo: Telegram apenas
- WhatsApp Web: NÃO disponível no OpenClaw self-hosted — usar WAHA sidecar
- Para Claude API: ANTHROPIC_API_KEY já configurada

---

## TRAEFIK — LABELS DO AV

```yaml
traefik.http.routers.av.rule: Host(`hairtech.org`) && (
  PathPrefix(`/webhook`) || PathPrefix(`/health`) ||
  PathPrefix(`/comprovantes`) || PathPrefix(`/historico`) ||
  PathPrefix(`/admin`) || PathPrefix(`/status`) || PathPrefix(`/nfse`)
)
traefik.http.routers.av.priority: 300
traefik.http.services.av.loadbalancer.server.port: 3001
Router name: av
```

---

## CRON — MONITORAMENTO AUTOMÁTICO

**O que é:** tarefa Linux que roda a cada 5 minutos automaticamente, verifica se ANA está conectada e tenta reconectar se cair. Salva log em `/var/log/ana-monitor.log`.

**Instalar (1 vez no VPS):**
```bash
chmod +x /home/user/nodejs/monitor-ana.sh
(crontab -l 2>/dev/null; echo "*/5 * * * * /bin/bash /home/user/nodejs/monitor-ana.sh >> /var/log/ana-monitor.log 2>&1") | crontab -
crontab -l
```

**Ver log:**
```bash
tail -20 /var/log/ana-monitor.log
```

---

## DIAGNÓSTICO COMPLETO (estado geral)

```bash
set +H
echo "=== CONTAINERS ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
echo "=== ENGINE WAHA ==="
grep "ENGINE" /home/user/nodejs/docker-compose.whatsapp-ana.yml
echo "=== STATUS ANA ==="
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log(JSON.stringify({status:d.status}))).catch(e=>console.log("ERRO:"+e.message));' 2>/dev/null
echo "=== WEBHOOK WAHA ATIVO? ==="
docker logs whatsapp-ana --tail 20 2>&1 | grep -i "hook\|POST\|200"
echo "=== LOGS AV (ANA) ==="
docker logs assistente-virtual --tail 30 2>&1 | grep -i "\[ANA\]\|404\|erro\|gemini"
echo "=== CRON ==="
crontab -l 2>/dev/null | grep monitor || echo "Cron nao instalado"
```

---

## COMO REINICIAR CONTAINERS

```bash
# AV principal
docker restart assistente-virtual

# WAHA (ANA) — NÃO usar restart, usar down+up para recarregar .env
docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml down
docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml up -d

# Ver logs em tempo real
docker logs -f assistente-virtual
docker logs -f whatsapp-ana
```

---

## COMO REVERTER MUDANÇAS

### Reverter app.js para backup:
```bash
ls /root/backups_av/app.js.bak.*
cp /root/backups_av/app.js.bak.YYYYMMDD_HHMMSS /home/user/nodejs/app.js
docker restart assistente-virtual
```

### Reaplicar patcher (idempotente — pode rodar quantas vezes):
```bash
python3 /home/user/nodejs/patch_ana_webhook.py
docker restart assistente-virtual
```

### Reverter docker-compose.whatsapp-ana.yml (WEBJS ↔ NOWEB):
NUNCA usar `sed -i` duas vezes no mesmo arquivo. Usar Python:
```bash
cp /home/user/nodejs/docker-compose.whatsapp-ana.yml /root/backups_av/dca.bak.$(date +%Y%m%d_%H%M%S)
python3 -c "
f=open('/home/user/nodejs/docker-compose.whatsapp-ana.yml')
c=f.read(); f.close()
c=c.replace('NOWEB','WEBJS')
f=open('/home/user/nodejs/docker-compose.whatsapp-ana.yml','w')
f.write(c); f.close()
print('OK')
"
docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml down
docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml up -d
```

### Aplicar git na VPS:
```bash
cd /home/user/nodejs
git pull origin claude/hairtech-whatsapp-ai-liD5V
docker restart assistente-virtual
```

---

## REGRAS OBRIGATÓRIAS — NÃO VIOLAR

1. **BACKUP ANTES DE QUALQUER MUDANÇA:**
   ```bash
   cp /arquivo /root/backups_av/arquivo.bak.$(date +%Y%m%d_%H%M%S)
   ```

2. **NUNCA `sed -i` mais de 1x no mesmo arquivo** → usar Python para reescrever

3. **NUNCA editar app.js diretamente** → usar `patch_ana_webhook.py`

4. **NUNCA tocar traefik-traefik-1** sem aprovação explícita de Ricardo

5. **NUNCA confiar em status de API acima da palavra de Ricardo**
   Se Ricardo diz "está conectado" → está. Não rodar DELETE.

6. **URLs em JS sempre concatenadas** (terminal Hostinger auto-linka):
   ```js
   const B = "ht"+"tp"+"://localhost:3000";
   ```

7. **`set +H`** antes de qualquer script bash com `!`

8. **Comandos ≤1000 chars** no terminal Hostinger Browser Terminal

9. **NUNCA commitar `.env`** ou arquivos com chaves reais

10. **NUNCA push para main/master** — branch: `claude/hairtech-whatsapp-ai-liD5V`

---

## PENDÊNCIAS (ordem de prioridade)

### 🔴 P0 — CORRIGIR AGORA: ANA não responde
Ver seção "DIAGNÓSTICO E CORREÇÃO ANA" acima.

### 🔴 P1 — Meta Developers + Business Suite
- developers.facebook.com → App → WhatsApp → Configuration
- Webhook: `https://hairtech.org/webhook`
- Subscribir: `messages`, `message_deliveries`, `message_reads`, `message_reactions`
- business.facebook.com → Inbox → conectar WA_PHONE_ID 983992428140920
- Sem isso: histórico de mensagens inacessível

### 🔴 P2 — Renovar VPS até 22/05/2026 (10 dias)
- hpanel.hostinger.com → renovar plano VPS

### 🟡 P3 — Instalar cron monitor-ana.sh
- Comando na seção CRON acima

### 🟡 P4 — Gemini 404 no AV principal
- Erro: `Erro ao interpretar comando natural: Request failed with status code 404`
- Não afeta ANA diretamente (ANA usa mesmo AI_BASE_URL mas endpoint diferente)
- Investigar qual função do AV usa endpoint diferente

### 🟢 P5 — Trocar Gemini por Claude API na ANA
- ANTHROPIC_API_KEY já existe em `/opt/hairtech-openclaw/.env`
- Modelo sugerido: `claude-haiku-4-5` ou `claude-sonnet-4-6`
- Respostas de vendas muito melhores

### 🟢 P6 — Sincronizar SOUL.md completo no prompt da ANA
- ANA_SYSTEM_PROMPT no app.js é simplificado
- SOUL.md v5.0 tem: 8 passos de venda, handoff, briefing diário, objeções

### 🟢 P7 — Claude Projects para memória persistente
- claude.ai → Projects → "HairTech"
- Adicionar CLAUDE.md, SOUL.md, este briefing
- Memória automática entre sessões

---

## HISTÓRICO DE COMMITS

```
e4f8dab  docs: complete AI briefing document
7bf73a6  docs: Meta Developers/Business Suite pending
799fd16  feat: monitor-ana.sh auto-restart
74ea22b  docs: CLAUDE.md + session report
2a2eda8  feat: ANA webhook + gemini-2.0-flash no app.js
3b1c6eb  add: patch_ana_webhook.py
9d41f7f  add: docker-compose.whatsapp-ana.yml (WAHA)
```

---

## O QUE FOI FEITO NA SESSÃO 12/05/2026

1. Confirmado: OpenClaw self-hosted não tem plugin WhatsApp Web
2. Deployado WAHA como sidecar Docker (devlikeapro/whatsapp-http-api)
3. NOWEB engine (Baileys) falhou em loop neste VPS → revertido para WEBJS
4. WEBJS revertido via Python (não sed — regra de nunca repetir sed)
5. Criado `patch_ana_webhook.py` (patcher idempotente)
6. Adicionado `/webhook/ana` ao app.js com personalidade ANA
7. AI_MODEL corrigido: gemini-2.5-flash → gemini-2.0-flash
8. ANA conectada ao WhatsApp via QR (iPad em paisagem) às ~02:27h
9. Endpoint QR descoberto: `/api/default/auth/qr?format=raw` (não `/api/sessions/default/qr`)
10. Criado `monitor-ana.sh` para auto-restart
11. Tudo commitado no branch

---

## CONTATOS E ACESSOS

| Quem/O quê | Contato/URL |
|------------|-------------|
| Dr. Ricardo (dono) | +5521982006372 |
| ANA (bot vendedora) | +5521967813366 |
| AV (bot principal) | +5521993542383 |
| VPS SSH | root@72.62.100.6 |
| Painel AV | https://hairtech.org/admin?senha=hairtech2026 |
| OpenClaw UI | https://claw.hairtech.org |
| Hostinger painel | hpanel.hostinger.com |
| Meta Developers | developers.facebook.com |
| Business Suite | business.facebook.com |

---
*Atualizado: 12/05/2026 — Branch: claude/hairtech-whatsapp-ai-liD5V*
