# BRIEFING COMPLETO — HAIRTECH ASSISTENTE VIRTUAL
# Copie e cole este documento inteiro para qualquer IA retomar o projeto
# Última atualização: 12/05/2026 — Sessão Claude Code

---

## QUEM É VOCÊ AGORA

Você está assumindo a manutenção do sistema de atendimento automatizado WhatsApp da **Clínica HairTech** (transplante capilar FUE, Rio de Janeiro/Niterói/Barra).

**Dono:** Dr. Ricardo — WhatsApp +5521982006372 — ele é quem aprova mudanças críticas.

**Repositório Git:** `clinica-hairtech/nodejs`
**Branch ativa:** `claude/hairtech-whatsapp-ai-liD5V`
**VPS:** `72.62.100.6` — Ubuntu 24.04 — Hostinger — **VENCE 22/05/2026 — RENOVAR EM hpanel.hostinger.com**

---

## OS DOIS BOTS

### AV — Assistente Virtual (bot principal)
- Número: +5521993542383
- URL: https://hairtech.org
- Container: `assistente-virtual` (node:20-alpine, porta 3001)
- Arquivo principal: `/home/user/nodejs/app.js` (1246 linhas)
- Recebe mensagens via WhatsApp Business API (Meta Cloud API)
- `WA_PHONE_ID=983992428140920`
- Faz triagem, agenda, handoff para ANA

### ANA — Vendedora IA (WhatsApp Web via WAHA)
- Número: +5521967813366
- Personalidade completa: `/home/user/nodejs/SOUL.md` (v5.0)
- Container: `whatsapp-ana` (devlikeapro/whatsapp-http-api:latest, WEBJS engine)
- Conectada via QR code escaneado em 12/05/2026 ~02:27 BRT
- Especialista em vendas de transplante FUE
- Preços: R$8.500–R$10.000 FUE / R$300–R$400 consulta / sinal R$150 Pix CNPJ 49.634.881/0001-91

---

## ARQUITETURA COMPLETA

```
Internet
   ↓
Traefik (portas 80/443)
   ├─ hairtech.org → assistente-virtual:3001
   └─ claw.hairtech.org → hairtech-openclaw:18789

Rede Docker interna (hairtech-network):
   assistente-virtual   :3001   AV principal (Node.js)
   whatsapp-ana         :3000   WAHA — WhatsApp Web da ANA
   whatsapp-inbox       :3000   outro canal WhatsApp
   hairtech-openclaw    :18789  Gateway AI (OpenClaw)
   traefik              :80/443 Proxy reverso
```

### Fluxo ANA completo:
```
Cliente WhatsApp → whatsapp-ana (WAHA WEBJS)
  → POST http://assistente-virtual:3001/webhook/ana
  → responderAna(chatId, texto) → Gemini API gemini-2.0-flash
  → enviarMsgAna(chatId, resposta) → WAHA POST /api/sendText
  → Cliente recebe resposta
```

### Fluxo AV principal:
```
Cliente WhatsApp → Meta Cloud API webhook
  → POST https://hairtech.org/webhook
  → app.js processa → Gemini API
  → Meta Cloud API /messages → Cliente
```

---

## ARQUIVOS E LOCALIZAÇÕES

### No repositório (git):
| Arquivo | Função |
|---------|--------|
| `app.js` | AV principal — 1246 linhas — tem /webhook/ana, gemini-2.0-flash |
| `SOUL.md` | Personalidade ANA v5.0 completa |
| `docker-compose.yml` | Container assistente-virtual + Traefik labels |
| `docker-compose.whatsapp-ana.yml` | Container WAHA (engine WEBJS) |
| `patch_ana_webhook.py` | Patcher idempotente — adiciona /webhook/ana ao app.js |
| `monitor-ana.sh` | Script de monitoramento automático da sessão ANA |
| `CLAUDE.md` | Regras e arquitetura para Claude Code |
| `docs/relatorio-2026-05-12.md` | Relatório detalhado desta sessão |
| `docs/briefing-ia-completo.md` | Este arquivo |

### No VPS (fora do git):
| Arquivo | Função |
|---------|--------|
| `/home/user/nodejs/.env` | Variáveis de ambiente — NÃO commitado |
| `/home/user/nodejs/whatsapp-ana-data/sessions/` | Sessão WAHA persistida (QR salvo) |
| `/opt/hairtech-openclaw/config/openclaw.json` | Configuração OpenClaw |
| `/opt/hairtech-openclaw/.env` | Chaves OpenClaw |
| `/root/backups_av/` | Backups automáticos de cada modificação |

---

## VARIÁVEIS DE AMBIENTE (.env do AV)
```
GEMINI_API_KEY=AIzaSy...              # Google Gemini
WHATSAPP_ANA_KEY=...                  # Auth WAHA container ANA
WA_TOKEN=EAANMj...                    # WhatsApp Business Cloud API
WA_PHONE_ID=983992428140920           # Phone ID do AV (+5521993542383)
OPENCLAW_GATEWAY_TOKEN=20fc88...      # Token gateway OpenClaw
ANTHROPIC_API_KEY=sk-ant...           # Claude API (no OpenClaw .env)
OPENAI_API_KEY=sk-proj...             # OpenAI (no OpenClaw .env)
```

---

## OPENCLAW
- Container: `hairtech-openclaw`, porta 18789
- UI: https://claw.hairtech.org (protocolo WebSocket JSON-RPC — NÃO é REST)
- bind: `lan` — NÃO alterar para "public" (causa crash do container)
- Canal ativo: apenas Telegram
- WhatsApp Web: NÃO disponível no OpenClaw self-hosted — por isso existe o WAHA sidecar
- Modelos disponíveis: Gemini, Claude (Anthropic), OpenAI
- Para acessar via API: o gateway não tem endpoints REST convencionais — usa WebSocket

---

## COMO RECONECTAR ANA SE A SESSÃO CAIR

**IMPORTANTE:** NUNCA deletar sessão se alguém disser que está conectado. Confiar na observação humana, não no status da API.

**Passo 1 — Verificar estado atual:**
```bash
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log(d.status)).catch(e=>console.log(e.message));' 2>/dev/null
```
- Se `WORKING` → ANA está conectada, não fazer nada
- Se `STOPPED` → tentar `POST /api/sessions/default/start`
- Se `SCAN_QR_CODE` → gerar QR abaixo

**Passo 2 — Recriar sessão e gerar QR (iPad em modo PAISAGEM antes de escanear):**
```bash
set +H
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
RAW=$(docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,h={"X-Api-Key":k,"Content-Type":"application/json"},B="ht"+"tp"+"://localhost:3000";(async()=>{await fetch(B+"/api/sessions/default",{method:"DELETE",headers:h});await new Promise(r=>setTimeout(r,1500));await fetch(B+"/api/sessions",{method:"POST",headers:h,body:JSON.stringify({name:"default",start:true})});for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,4000));const s=(await(await fetch(B+"/api/sessions/default",{headers:h})).json()).status;process.stderr.write(i+" "+s+"\n");if(s==="SCAN_QR_CODE")break;}await new Promise(r=>setTimeout(r,3000));const t=await(await fetch(B+"/api/default/auth/qr?format=raw",{headers:h})).text();try{process.stdout.write(JSON.parse(t).value||"")}catch{if(t.length>20)process.stdout.write(t);}})().catch(e=>process.stderr.write(e.message));' 2>/dev/null)
[ ${#RAW} -gt 20 ] && echo "$RAW"|qrencode -t ANSIUTF8 -s 1 -m 1 && echo "ESCANEIE COM WHATSAPP DA ANA" || echo "Falhou"
```
Aguarda ~80 segundos. Escanear com WhatsApp do celular da ANA em modo paisagem.

**ATENÇÃO — Endpoint QR correto:**
- ✅ `/api/default/auth/qr?format=raw`
- ❌ `/api/sessions/default/qr` → retorna 404 nesta versão do WAHA

**Engine:** usar WEBJS. NOWEB (Baileys) NÃO funciona neste VPS — entra em loop de "Connection Failure".

---

## COMO REVERTER MUDANÇAS NO APP.JS

O `app.js` não deve ser editado diretamente. Usar o patcher:
```bash
python3 /home/user/nodejs/patch_ana_webhook.py
```
O patcher é idempotente — pode rodar quantas vezes quiser sem duplicar código.

Para restaurar um backup:
```bash
ls /root/backups_av/app.js.bak.*
cp /root/backups_av/app.js.bak.YYYYMMDD_HHMMSS /home/user/nodejs/app.js
docker restart assistente-virtual
```

---

## COMO REVERTER docker-compose.whatsapp-ana.yml

NUNCA usar `sed -i` duas vezes no mesmo arquivo. Usar Python:
```bash
cp /home/user/nodejs/docker-compose.whatsapp-ana.yml /root/backups_av/dca.bak.$(date +%Y%m%d_%H%M%S)
python3 -c "
f=open('/home/user/nodejs/docker-compose.whatsapp-ana.yml')
c=f.read(); f.close()
c=c.replace('NOWEB','WEBJS')  # ou vice-versa
f=open('/home/user/nodejs/docker-compose.whatsapp-ana.yml','w')
f.write(c); f.close()
print('OK')
"
docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml down
docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml up -d
```

---

## COMO REINICIAR CONTAINERS

```bash
# AV principal
docker restart assistente-virtual

# WAHA (ANA)
docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml down
docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml up -d

# Ver logs
docker logs assistente-virtual --tail 30
docker logs whatsapp-ana --tail 30

# Status de todos
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
```

---

## COMO APLICAR MUDANÇAS DO GIT NA VPS

O AV usa volume bind mount — arquivos do git são usados diretamente:
```bash
cd /home/user/nodejs
git pull origin claude/hairtech-whatsapp-ai-liD5V
docker restart assistente-virtual
```

---

## DIAGNÓSTICO COMPLETO (rodar para ver estado geral)

```bash
set +H
echo "=== CONTAINERS ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
echo "=== ENGINE WAHA ==="
grep "ENGINE" /home/user/nodejs/docker-compose.whatsapp-ana.yml
echo "=== STATUS ANA ==="
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log(JSON.stringify({status:d.status,engine:d.engine}))).catch(e=>console.log("ERRO:"+e.message));' 2>/dev/null
echo "=== LOGS AV (10 linhas) ==="
docker logs assistente-virtual --tail 10 2>&1
echo "=== LOGS WAHA (10 linhas) ==="
docker logs whatsapp-ana --tail 10 2>&1
```

---

## MONITORAMENTO AUTOMÁTICO

Script: `/home/user/nodejs/monitor-ana.sh`
Instalar cron (rodar 1x no VPS):
```bash
chmod +x /home/user/nodejs/monitor-ana.sh
(crontab -l 2>/dev/null; echo "*/5 * * * * /bin/bash /home/user/nodejs/monitor-ana.sh >> /var/log/ana-monitor.log 2>&1") | crontab -
```
Ver log: `tail -f /var/log/ana-monitor.log`

---

## REGRAS OBRIGATÓRIAS — NÃO VIOLAR

1. **BACKUP ANTES DE QUALQUER MUDANÇA:**
   ```bash
   cp /arquivo /root/backups_av/arquivo.bak.$(date +%Y%m%d_%H%M%S)
   ```

2. **NUNCA sed -i mais de 1x no mesmo arquivo** → usar Python para reescrever

3. **NUNCA editar app.js diretamente** → usar `patch_ana_webhook.py`

4. **NUNCA tocar traefik-traefik-1** sem aprovação explícita de Ricardo

5. **NUNCA confiar em status de API acima da palavra de Ricardo**
   - Se Ricardo diz "está conectado" → está conectado
   - Não rodar DELETE baseado em API status

6. **URLs em JS sempre concatenadas** para evitar auto-link do terminal Hostinger:
   ```js
   const B = "ht"+"tp"+"://localhost:3000";
   ```

7. **set +H** antes de qualquer script bash que contém `!`

8. **Comandos ≤1000 chars** no terminal Hostinger Browser Terminal

9. **NUNCA commitar .env** ou arquivos com chaves reais

10. **NUNCA fazer push para main/master** — trabalhar na branch `claude/hairtech-whatsapp-ai-liD5V`

---

## PENDÊNCIAS CRÍTICAS (em ordem de prioridade)

### P0 — Meta Developers + Business Suite [FAZER PRIMEIRO]
- Acessar: developers.facebook.com → App → WhatsApp → Configuration
- Webhook URL: `https://hairtech.org/webhook`
- Subscribir: `messages`, `message_deliveries`, `message_reads`, `message_reactions`
- Acessar: business.facebook.com → Inbox → conectar número WA_PHONE_ID 983992428140920
- Sem isso: histórico de mensagens desde criação da conta inacessível

### P1 — Renovar VPS [ATÉ 22/05/2026]
- hpanel.hostinger.com → renovar plano VPS
- Suspensão = todos os serviços offline

### P2 — Gemini 404 no AV principal
- Erro: `Erro ao interpretar comando natural: Request failed with status code 404`
- Não afeta ANA (usa endpoint diferente)
- Verificar `AI_BASE_URL` no `/home/user/nodejs/.env`

### P3 — Instalar cron do monitor-ana.sh
- Comando acima na seção Monitoramento

### P4 — Teste end-to-end ANA
- Enviar mensagem para +5521967813366
- Confirmar resposta com personalidade FUE/vendas

### P5 — Sincronizar SOUL.md com ANA_SYSTEM_PROMPT
- O prompt no patch é simplificado
- SOUL.md v5.0 tem regras completas de handoff, briefing diário, 8 passos de venda

### P6 — Trocar Gemini por Claude API na ANA
- Anthropic API key já existe em `/opt/hairtech-openclaw/.env`
- Modelo: `claude-haiku-4-5` ou `claude-sonnet-4-6`
- Melhor qualidade de resposta de vendas

### P7 — Claude Projects para memória persistente
- Criar projeto em claude.ai → Projects
- Adicionar CLAUDE.md, SOUL.md, este briefing como arquivos do projeto
- Toda sessão nova começa com contexto completo

---

## TRAEFIK — LABELS DO AV

```yaml
- "traefik.enable=true"
- "traefik.docker.network=web"
- "traefik.http.routers.av.rule=Host(`hairtech.org`) && (PathPrefix(`/webhook`) || PathPrefix(`/health`) || PathPrefix(`/comprovantes`) || PathPrefix(`/historico`) || PathPrefix(`/admin`) || PathPrefix(`/status`) || PathPrefix(`/nfse`))"
- "traefik.http.routers.av.entrypoints=websecure"
- "traefik.http.routers.av.tls.certresolver=letsencrypt"
- "traefik.http.routers.av.priority=300"
- "traefik.http.services.av.loadbalancer.server.port=3001"
```

---

## HISTÓRICO DE COMMITS DESTA SESSÃO

```
7bf73a6  docs: add Meta Developers/Business Suite inbox as critical pending task
799fd16  feat: add monitor-ana.sh — auto-restart WAHA session if ANA drops
74ea22b  docs: add CLAUDE.md and session report 2026-05-12
2a2eda8  feat: add ANA WhatsApp webhook + fix Gemini model
3b1c6eb  add: patch_ana_webhook.py - inserts /webhook/ana endpoint in app.js
9d41f7f  add: WAHA whatsapp-http-api compose for ANA reconnect
```

---

## O QUE FOI FEITO NESTA SESSÃO (12/05/2026)

1. Diagnosticado que OpenClaw self-hosted não tem plugin WhatsApp Web
2. Deployado WAHA (devlikeapro/whatsapp-http-api) como sidecar Docker
3. Tentado NOWEB engine (Baileys) → falhou em loop neste VPS
4. Revertido para WEBJS engine (headless Chromium) → funcionou
5. Criado `patch_ana_webhook.py` — patcher idempotente para app.js
6. Adicionado endpoint `/webhook/ana` ao app.js com personalidade ANA
7. Corrigido AI_MODEL de gemini-2.5-flash para gemini-2.0-flash
8. Gerado QR code no terminal (ANSIUTF8, iPad em paisagem)
9. ANA conectada ao WhatsApp às ~02:27 BRT
10. Criado `monitor-ana.sh` para auto-restart da sessão
11. Criado `CLAUDE.md` com regras permanentes
12. Tudo commitado e pushado no branch

---

## CONTATOS

- **Dr. Ricardo** (dono): +5521982006372
- **ANA** (bot vendedora): +5521967813366  
- **AV** (bot principal): +5521993542383
- **VPS**: 72.62.100.6
- **Painel AV**: https://hairtech.org/admin?senha=hairtech2026
- **OpenClaw UI**: https://claw.hairtech.org

---
*Gerado em 12/05/2026 — Sessão Claude Code claude/hairtech-whatsapp-ai-liD5V*
