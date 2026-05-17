# Agente FOTO — capacidades

## Schema

```sql
CREATE TABLE fotos_clinicas (
  id SERIAL PK,
  paciente_id INT,
  drive_file_id TEXT,
  drive_url TEXT,
  tipo TEXT,
  dia_pos_op INT,
  data_envio TIMESTAMPTZ,
  classificacao JSONB,
  tcle_imagem_status TEXT DEFAULT 'pendente',
  uso_marketing_autorizado BOOLEAN DEFAULT false,
  soft_deleted BOOLEAN DEFAULT false
);
```

## Classificação (Claude Vision)

- Tipo: tricoscopia | pré-FUE | dia0 | pós-op | comprovante | outro
- Dia pós-op (1-365 ou n/a)
- Qualidade: boa | retake | ilegível
- Anomalias: eritema | crosta | sangramento | infecção | normal

## Custos

- Claude Vision: ~$0.003 por imagem
- 100 fotos/mês = $0.30/m negligível
