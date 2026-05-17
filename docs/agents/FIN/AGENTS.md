# Agente FIN — capacidades

## Webhook (em integrations/adapters/infinitypay.js)

- Endpoint: POST /financeiro/pix-webhook
- Auth: HMAC SHA-256 com INFINITYPAY_WEBHOOK_SECRET
- Payload: pix recebido (txid, valor, pagador, ts)

## Tabelas

```sql
CREATE TABLE cobrancas (id SERIAL PK, paciente_id INT, tipo TEXT, valor DECIMAL, vencimento DATE, status TEXT, txid_pix TEXT, pago_em TIMESTAMPTZ, nf_emitida_ref TEXT, metadata JSONB);
CREATE TABLE conciliacoes (id SERIAL PK, cobranca_id INT, pix_txid TEXT, confianca DECIMAL, match_criterios JSONB, status TEXT, ts TIMESTAMPTZ DEFAULT NOW(), log_hash TEXT);
```

## Tools

- `criarCobranca(paciente, tipo, valor, vencimento)`
- `reconciliarPix(txid, valor, pagador_cpf, ts)`
- `baixarTitulo(cobranca_id)` → dispara NF
- `cancelarCobranca(cobranca_id, motivo)`
- `relatorioFluxoCaixa(dias=30)`
- `mrr()` / `arr()`
