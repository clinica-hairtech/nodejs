# Agente POS — capacidades

## Tools

- `agendarCheckin(paciente_id, dia_pos_op)`
- `solicitarFoto(paciente_id, tipo)`
- `analisarFotoPosOp(foto, dia)` via MED+FOTO
- `detectarSintomaAgudo(mensagem)` — NLP + escalation
- `validarAdesaoProtocolo(paciente_id)`
- `medirNPS(paciente_id, momento)`

## Tabela Postgres

```sql
CREATE TABLE checkins_pos_op (
  id SERIAL PRIMARY KEY,
  paciente_id INT,
  data_cirurgia DATE,
  dia_pos_op INT,
  enviado_em TIMESTAMPTZ,
  respondido_em TIMESTAMPTZ,
  status TEXT,
  foto_url TEXT,
  alertas JSONB,
  nps_score INT
);
```
