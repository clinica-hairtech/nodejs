# Relatório de Sessão — 12/05/2026
# ANA WhatsApp + WAHA Setup Completo

## OBJETIVO
Reconectar ANA (+5521967813366) ao WhatsApp após perda do OpenClaw Hostinger.

## O QUE FOI FEITO

### 1. Diagnóstico inicial
- Confirmado: OpenClaw self-hosted NÃO tem plugin WhatsApp Web
- Solução: WAHA (devlikeapro/whatsapp-http-api) como sidecar Docker

### 2. Deploy do WAHA
**Arquivo:** `docker-compose.whatsapp-ana.yml`  
**Engine final:** WEBJS (headless Chromium)  
**Por que não NOWEB:** Engine Baileys entra em loop de "Connection Failure" neste VPS

Comando para subir:
```bash
docker compose -f /home/user/nodejs/docker-compose.whatsapp-ana.yml up -d
```

Sessão persistida em: `/home/user/nodejs/whatsapp-ana-data/sessions/`

### 3. Webhook /webhook/ana no AV
**Arquivo patcher:** `patch_ana_webhook.py` (idempotente)  
**Rodado na VPS em:** 2026-05-12 ~01:30 BRT

Adiciona ao app.js:
- `ANA_SYSTEM_PROMPT` — personalidade vendedora FUE (baseada em SOUL.md mas simplificada)
- `conversasAna` — histórico por usuário (20 msgs)
- `responderAna(chatId, msg)` — chama Gemini com histórico
- `enviarMsgAna(chatId, texto)` — POST WAHA /api/sendText
- `app.post("/webhook/ana", ...)` — endpoint principal

### 4. Conexão ANA ao WhatsApp
- Engine WEBJS gera QR via `/api/default/auth/qr?format=raw`
- QR exibido no terminal com `qrencode -t ANSIUTF8 -s 1 -m 1`
- iPad em modo paisagem para ver QR completo
- Sessão confirmada conectada às ~02:27 BRT

### 5. Commit e push
Branch: `claude/hairtech-whatsapp-ai-liD5V`
- `9d41f7f` — docker-compose.whatsapp-ana.yml
- `3b1c6eb` — patch_ana_webhook.py  
- `2a2eda8` — app.js (ANA webhook + gemini-2.0-flash)

---

## ESTADO ATUAL DOS CONTAINERS
| Container | Status | Função |
|-----------|--------|--------|
| assistente-virtual | healthy, porta 3001 | AV principal |
| whatsapp-ana | running, WEBJS | WhatsApp ANA |
| hairtech-openclaw | running, porta 18789 | Gateway AI |
| whatsapp-inbox | running | Outro canal |
| traefik | running | Proxy reverso |

---

## PROBLEMAS ENCONTRADOS E SOLUÇÕES

### WAHA NOWEB não funciona no VPS
**Sintoma:** Loop "NOWEBEngine - connected to WA" → "Connection Failure" → reconnect  
**Causa:** Baileys (NOWEB) tem problema de conexão com Meta neste IP  
**Solução:** Reverter para WEBJS via Python (não sed — regra de não repetir sed)

### Endpoint QR errado
**Errado:** `/api/sessions/default/qr` → 404  
**Correto:** `/api/default/auth/qr?format=raw`

### QR "undefined" no terminal
**Causa:** Script capturava stdout com log de status misturado  
**Solução:** Usar `process.stderr.write` para logs, `process.stdout.write` apenas para o valor QR

### Terminal Hostinger auto-linka URLs
**Sintoma:** `fetch('http://...')` vira `fetch('<http://...>')` ao colar  
**Solução:** `const B = "ht"+"tp"+"://localhost:3000"` (sempre concatenar)

### Sessão desconectada por erro meu
**O que aconteceu:** Ricardo confirmou "Conectado". Rodei DELETE+CREATE baseado em API status  
**Regra criada:** NUNCA confiar em API status acima da observação direta de Ricardo

---

## COMO RECONECTAR ANA (se cair)
Ver CLAUDE.md seção "WAHA — Como Reconectar ANA".  
Resumo: DELETE sessão → CREATE → aguardar SCAN_QR_CODE → `/api/default/auth/qr?format=raw` → qrencode → escanear em paisagem.

---

## PENDÊNCIAS PARA PRÓXIMA SESSÃO

1. **Gemini 404** — `Erro ao interpretar comando natural: Request failed with status code 404`
   - Afeta NLP do AV principal (não ANA)
   - Verificar `AI_BASE_URL` no `.env` da VPS

2. **Renovar VPS** — vence 22/05/2026 (em 10 dias)
   - hpanel.hostinger.com

3. **Zombie processes** — 12 processos zumbi no VPS
   - Não crítico mas monitorar

4. **Teste end-to-end ANA**
   - Enviar msg para +5521967813366
   - Confirmar resposta Gemini com personalidade FUE

5. **SOUL.md vs ANA_SYSTEM_PROMPT**
   - A personalidade no patch é simplificada
   - Considerar sincronizar com SOUL.md v5.0 completo

---

## ARQUIVOS MODIFICADOS NA VPS (fora do git)
- `/home/user/nodejs/app.js` — agora sincronizado via commit `2a2eda8`
- `/home/user/nodejs/docker-compose.whatsapp-ana.yml` — engine revertida para WEBJS
- `/home/user/nodejs/whatsapp-ana-data/sessions/` — dados de sessão WAHA

## BACKUPS CRIADOS
- `/root/backups_av/app.js.bak.*`
- `/root/backups_av/dca.bak.*` (docker-compose.whatsapp-ana.yml)
- `/root/backups_av/sess-bak-*` (sessions WAHA)
