# Agente ESTOQUE — capacidades

## Tabelas

```sql
CREATE TABLE insumos (id SERIAL PK, sku TEXT UNIQUE, nome TEXT, categoria TEXT, unidade TEXT, estoque_atual DECIMAL, estoque_minimo DECIMAL, controlado BOOLEAN DEFAULT false);
CREATE TABLE insumos_lotes (id SERIAL PK, sku TEXT, lote TEXT, validade DATE, quantidade DECIMAL, nf_entrada_id INT);
CREATE TABLE insumos_movimentos (id SERIAL PK, sku TEXT, tipo TEXT, quantidade DECIMAL, motivo TEXT, paciente_id INT NULL, ts TIMESTAMPTZ DEFAULT NOW());
```

## Tools

- `registrarEntrada(nf_id, itens[])`
- `darBaixa(sku, qtd, motivo, paciente_id)`
- `verificarEstoque(sku)`
- `alertaValidade(dias=60)`
- `sugerirPedido()`
- `cotacao(itens[], fornecedores[3])`
