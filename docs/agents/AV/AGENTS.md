# Agente AV — capacidades

## Endpoints expostos

- POST /webhook — recebe mensagens Meta Cloud API
- GET /health — healthcheck
- GET /status — métricas em tempo real
- POST /consulta — registrar consulta agendada (auth via ADMIN_PASS)
- /admin?senha= — painel CRM (HTML)
- /admin/export?senha= — exportação CSV/JSON
- /api/internal — endpoints autenticados pra OpenClaw consumir
- /nfse, /nfse/lote — emissão NFS-e (ver agente NF)

## Modelos AI utilizados

- `gemini-2.5-flash` (default) — respostas aos pacientes, classificação de imagem
- `gpt-4o-mini` (fallback automático, ver `chamarIAComFallback`) — quando Gemini 429/billing/down
- Custo médio por conversa: ~$0.002

## Persistência

- PostgreSQL `hairtech-postgres` / db `hairtechdb` / user `hairtech`
- Tabelas: conversas, mensagens, leads, contatos
- Snapshot a cada 2 min (`db.salvarConversa`)
- Backup nightly via `scripts/snapshot.sh`

## Tools / actions disponíveis

- `enviarMensagem(to, mensagem)` — envia texto WhatsApp
- `enviarMenuInicial(to)` — menu interativo de 4 opções
- `enviarBotaoEspecialista(to)` — CTA pra wa.me/message/AYEFKCOTY24ZC1
- `enviarGuiaFotos(to, genero)` — imagem referência fotos
- `enviarPdfOrientacaoFotos(to)` — PDF orientação
- `notificarClinica(numero, motivo)` — notifica Dr. Ricardo
- `enviarVideoPersonalizado(from, tipo)` — HeyGen video
- `enviarSinalPix()` — fluxo cobrança R$150
- `marcarComoLido(messageId)` — ack Meta

## Limites de uso

- Meta Cloud API: ~1.000 conversas/24h tier 1
- Rate limit per Business-Consumer pair: ~80 msg/min (error #131056 quando estoura)
- Gemini Free: 5 req/min (atual hoje — billing precisa ativar)

## Dependências críticas

- Traefik routing `hairtech.org`
- DATABASE_URL + DATABASE_SSL=false
- WHATSAPP_TOKEN (perma Meta)
- GEMINI_API_KEY + OPENAI_API_KEY (fallback)
- PHONE_NUMBER_ID (NÃO confundir com WABA_ID)
