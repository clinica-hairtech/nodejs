# Agente CRM — capacidades

## Triggers

- Webhook Feegow: paciente.criado, consulta.realizada, procedimento.realizado
- Cron 10h diário: varre cadência (D+7/30/90/180/365 + aniversário)
- Cron domingo 18h: relatório semanal

## Tools

- `seguimentoConsulta(paciente_id, dias)`
- `pesquisaNPS(paciente_id)`
- `parabensAniversario(paciente_id)` — sem oferta
- `reativacaoInativo(paciente_id, dias)`
- `optOut(paciente_id)` — registra opt-out LGPD

## Métricas

- Taxa resposta por cadência
- NPS rolling 30/90
- LTV por paciente
- Churn mensal

## Dependências

- FEEGOW_API_KEY + FEEGOW_WEBHOOK_SECRET (Round 11)
- Tabela `crm_cadencias` (Round 10)
- Tabela `crm_propostas_pendentes` (Round 18 — fila aprovação)
