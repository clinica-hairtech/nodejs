# Agente ANA — capacidades

## Tecnologia

- WAHA (devlikeapro/waha:latest-2026.4.3) — Chromium WEBJS
- Sessão `default` no chip +5521967813366
- Auth via QR Code, sessão persiste em `/home/user/nodejs/whatsapp-ana-data/sessions/`
- Webhook → `http://assistente-virtual:3001/webhook/ana`
- Events: message, message.any, session.status

## Endpoints relevantes (WAHA API)

- `GET /api/{session}/auth/qr` — QR pra pareamento (SINGULAR no path, sem `sessions/`)
- `POST /api/sessions/{name}/start` — iniciar sessão
- `DELETE /api/sessions/{name}` — deletar sessão
- `POST /api/sendText` — enviar mensagem
- X-Api-Key header em todas

## Limitação WAHA

- WAHA Core (grátis) usa Chromium = ~1 GB RAM/sessão
- VPS tem 8GB total — máximo 1-2 sessões simultâneas
- WAHA Plus (pago) tem mais features mas Core basta
- NUNCA usar NOWEB engine: IP Hostinger bloqueado pelo WhatsApp

## Custos

- Anthropic Claude Sonnet: ~$3/1M input + $15/1M output
- Sessão típica venda: 5-10 trocas = ~$0.10
- 100 vendas/mês = ~$10

## Dependências críticas

- WHATSAPP_ANA_KEY no .env do AV
- Container whatsapp-ana running
- Volume `/home/user/nodejs/whatsapp-ana-data/sessions/` (NÃO deletar)
- AV /webhook/ana endpoint funcional
