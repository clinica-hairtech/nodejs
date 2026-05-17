# Agente COMP — capacidades

## Schema

```sql
CREATE TABLE compliance_documentos (
  id SERIAL PK,
  tipo TEXT,
  titulo TEXT,
  emissao DATE,
  vencimento DATE,
  renovacao_meses_antes INT DEFAULT 2,
  drive_file_id TEXT,
  responsavel TEXT,
  status TEXT,
  alertas_enviados JSONB DEFAULT '[]'
);
```

## Tools

- `scanVencimentos()`
- `auditAiCalls(agente, periodo)`
- `verificarResolucaoCfm(numero)`
- `gerarRelatorioMensal()`
- `alertaUrgente(documento, dias_restantes)`

## Cron

- `0 9 1 * *` — scan mensal
- `0 10 1 * *` — relatório mensal
- `0 9 * * *` — verificação diária (urgentes <7d)
- `0 8 * * 0` — audit IA semanal
