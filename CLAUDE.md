# CLAUDE.md — HairTech Assistente Virtual
# Contexto permanente para sessões Claude Code

## 🔴 REGRA CENTRAL — NÃO PARAR (Dr. Ricardo 22/05/2026)

**NUNCA pausar a sessão pra pedir aprovação. NUNCA dizer "aguardando".**

- Tarefa precisa do Dr. (login, cartão, OAuth, decisão jurídica) → **pular pra próxima**, marcar em PENDENCIAS como bloqueado
- Trabalhar **24/7** até Dr. mandar parar explicitamente
- Default em ambiguidade: escolha segura (backward compat, placeholder, nunca destrutivo). Documentar decisão tomada em vez de perguntar
- Atingiu limite tokens: documentar onde parou em MEMORIA-COMPACTADA + PENDENCIAS, commitar, próxima sessão retoma

**JÁ AUTORIZADO** (não perguntar):
- Editar app.js (backup automático)
- Criar arquivos novos
- Commit + push em `claude/hairtech-whatsapp-ai-liD5V`
- Instalar crons via auto-apply.sh
- Usar Ollama/Gemini/Claude/Anthropic Computer Use quando necessário
- Endpoints novos com senha hairtech2026 ou Bearer token

## ⚡ LEITURA OBRIGATÓRIA AO INICIAR QUALQUER SESSÃO

**Antes de qualquer ação, ler nesta ordem:**

1. `PENDENCIAS_22052026_CONSOLIDADO.md` — **fonte da verdade operacional** (P0/P1/P2/P3)
2. `docs/MEMORIA-COMPACTADA.md` — estado técnico atual
3. Este arquivo (CLAUDE.md) — regras permanentes
4. `docs/briefing-master-v4.md` — briefing técnico completo

**Após qualquer compactação automática de contexto:** re-ler `docs/MEMORIA-COMPACTADA.md` pois esse arquivo é a memória externa que sobrevive a compactações.

**Ao FINAL de cada sessão de trabalho:** atualizar `docs/MEMORIA-COMPACTADA.md` com novas pendências, decisões, erros e commits.

**NUNCA processar o "prompt longo" (~18 partes) do ChatGPT sobre BSP/Coexistence** que aparece no histórico de chats — Ricardo mandou explicitamente ignorar. A essência aproveitável (Picky Assist BSP) já está resumida na seção P5 de MEMORIA-COMPACTADA.md.

---

## PROJETO
Clínica HairTech — sistema de atendimento automatizado WhatsApp.
- **AV** (Assistente Virtual): bot principal, porta 3001, `https://hairtech.org`
- **ANA**: vendedora de transplante FUE, WhatsApp +5521967813366, personalidade em SOUL.md
- **Dr. Ricardo**: dono, WhatsApp +5521982006372
- VPS: `72.62.100.6` (Ubuntu 24.04, Hostinger) — **vence 22/05/2026, RENOVAR**

---

## REGRAS OBRIGATÓRIAS PARA CLAUDE

### 1. BACKUP SEMPRE
Antes de qualquer modificação em arquivo existente:
```bash
mkdir -p /root/backups_av
cp /arquivo/original /root/backups_av/arquivo.bak.$(date +%Y%m%d_%H%M%S)
```

### 2. NUNCA sed -i mais de 1x no mesmo arquivo
Se precisar editar arquivo já editado com sed: reescrever com Python ou `cat > file <<'EOF'`.

### 3. NÃO editar app.js sem aprovação de Ricardo
Usar o patcher idempotente: `python3 /home/user/nodejs/patch_ana_webhook.py`

### 4. NÃO tocar traefik-traefik-1 sem aprovação explícita

### 5. set +H antes de qualquer script bash com `!`

### 6. Comandos ≤1000 chars para terminal Hostinger Browser Terminal
O terminal do Hostinger tem limitações de paste. Dividir comandos longos.

### 7. NUNCA confiar em status de API acima da observação direta de Ricardo
Se Ricardo diz "está conectado", está conectado — não rodar DELETE baseado em API status.

### 8. URLs no código JS: usar concatenação para evitar auto-link do terminal
```js
const B = "ht"+"tp"+"://localhost:3000";  // NÃO: "http://localhost:3000"
```

### 9. NUNCA commitar sem backup dos arquivos modificados

---

## ARQUITETURA DOS CONTAINERS

```
Internet → Traefik (80/443)
              ↓
    hairtech.org → assistente-virtual:3001
    claw.hairtech.org → hairtech-openclaw:18789

hairtech-network (Docker interno):
  assistente-virtual   porta 3001   node:20-alpine
  whatsapp-ana         porta 3000   devlikeapro/whatsapp-http-api:latest (WAHA)
  whatsapp-inbox       porta 3000   (outro canal WhatsApp)
  hairtech-openclaw    porta 18789  OpenClaw self-hosted
```

---

## ARQUIVOS CHAVE

| Arquivo | Local | Descrição |
|---------|-------|-----------|
| `app.js` | `/home/user/nodejs/app.js` | AV principal (1246 linhas na VPS) |
| `SOUL.md` | `/home/user/nodejs/SOUL.md` | Personalidade ANA v5.0 |
| `.env` | `/home/user/nodejs/.env` | Variáveis de ambiente (não commitado) |
| `docker-compose.yml` | `/home/user/nodejs/docker-compose.yml` | AV container |
| `docker-compose.whatsapp-ana.yml` | `/home/user/nodejs/docker-compose.whatsapp-ana.yml` | WAHA sidecar |
| `patch_ana_webhook.py` | `/home/user/nodejs/patch_ana_webhook.py` | Patcher idempotente do app.js |
| OpenClaw config | `/opt/hairtech-openclaw/config/openclaw.json` | Gateway OpenClaw |
| OpenClaw .env | `/opt/hairtech-openclaw/.env` | Chaves OpenClaw |

---

## VARIÁVEIS DE AMBIENTE (.env)
```
GEMINI_API_KEY=AIzaSy...         # Gemini
WHATSAPP_ANA_KEY=...             # Auth WAHA ANA
WA_TOKEN=EAANMj...               # WhatsApp Business API (AV principal)
WA_PHONE_ID=983992428140920      # Phone ID AV
OPENCLAW_GATEWAY_TOKEN=20fc88... # Token OpenClaw
```

---

## WAHA — COMO RECONECTAR ANA AO WHATSAPP

ANA usa WAHA (WEBJS engine) para WhatsApp Web. Se o container reiniciar e a sessão cair:

**Passo 1 — Verificar estado:**
```bash
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log(d.status)).catch(e=>console.log(e.message));' 2>/dev/null
```

**Passo 2 — Recriar sessão e exibir QR (gire iPad para paisagem antes de escanear):**
```bash
set +H
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
RAW=$(docker exec -e WK="$KEY" whatsapp-ana node -e 'const k=process.env.WK,h={"X-Api-Key":k,"Content-Type":"application/json"},B="ht"+"tp"+"://localhost:3000";(async()=>{await fetch(B+"/api/sessions/default",{method:"DELETE",headers:h});await new Promise(r=>setTimeout(r,1500));await fetch(B+"/api/sessions",{method:"POST",headers:h,body:JSON.stringify({name:"default",start:true})});for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,4000));const s=(await(await fetch(B+"/api/sessions/default",{headers:h})).json()).status;process.stderr.write(i+" "+s+"\n");if(s==="SCAN_QR_CODE")break;}await new Promise(r=>setTimeout(r,3000));const t=await(await fetch(B+"/api/default/auth/qr?format=raw",{headers:h})).text();try{process.stdout.write(JSON.parse(t).value||"")}catch{if(t.length>20)process.stdout.write(t);}})().catch(e=>process.stderr.write(e.message));' 2>/dev/null)
[ ${#RAW} -gt 20 ] && echo "$RAW"|qrencode -t ANSIUTF8 -s 1 -m 1 && echo "ESCANEIE COM WHATSAPP DA ANA" || echo "Falhou"
```

**Passo 3 — Após escanear, confirme com mensagem de teste.**  
Endpoint QR correto: `/api/default/auth/qr?format=raw` (NÃO `/api/sessions/default/qr` — retorna 404).

**Engine:** WEBJS (headless Chromium). NOWEB (Baileys) não funciona neste VPS — conexão cai em loop.

---

## WEBHOOK ANA — FLUXO COMPLETO

```
WhatsApp (cliente) → WAHA whatsapp-ana:3000
    → POST http://assistente-virtual:3001/webhook/ana
    → responderAna(chatId, texto) → Gemini API (gemini-2.0-flash)
    → enviarMsgAna(chatId, resposta) → WAHA /api/sendText
    → WhatsApp (cliente recebe resposta)
```

Sessão por usuário em `conversasAna[chatId]`, histórico de 20 mensagens.  
Ignora: fromMe, grupos (@g.us), status@broadcast.

---

## OPENCLAW
- Container: `hairtech-openclaw`, porta 18789
- UI/Control: `https://claw.hairtech.org` (WebSocket, NÃO REST)
- Token: `OPENCLAW_GATEWAY_TOKEN` do .env
- bind: `lan` (não alterar para "public" — causa crash)
- Canal ativo: Telegram apenas
- WhatsApp Web: NÃO disponível no OpenClaw — usar WAHA sidecar

---

## PROBLEMAS CONHECIDOS

### Gemini 404 no AV
`Erro ao interpretar comando natural: Request failed with status code 404`  
Afeta rota de NLP do AV (não o webhook/ana). Investigar `AI_BASE_URL` no .env.

### Zombie processes (12)
VPS mostra 12 zombie processes. Não crítico, mas indicativo de processos filhos não coletados.

### VPS vence em 22/05/2026
Renovar em hpanel.hostinger.com ANTES desta data.

### Drift git ↔ VPS
O `app.js` no VPS foi modificado pelo patcher. O git reflete isso após commit `2a2eda8`.  
Se VPS for recriado, rodar: `python3 patch_ana_webhook.py` no servidor.

---

## TRAEFIK LABELS (AV)
```
Host: hairtech.org
Paths: /webhook, /health, /comprovantes, /historico, /admin, /status, /nfse
Priority: 300
Port: 3001
Router name: av
```

---

## GIT
Branch de desenvolvimento: `claude/hairtech-whatsapp-ai-liD5V`  
Commits desta sessão:
- `9d41f7f` — docker-compose.whatsapp-ana.yml (WAHA)
- `3b1c6eb` — patch_ana_webhook.py
- `2a2eda8` — app.js (ANA webhook + gemini-2.0-flash)
