# Agente NF — capacidades

## Endpoints (já em nfse.js)

- POST /nfse — individual
- POST /nfse/lote — lote diário
- GET /nfse/status — diagnóstico modo

## Modos

1. **Automático** (FOCUSNFE_TOKEN): POST api.focusnfe.com.br/v2/nfse, Auth Basic, custo R$0,15-0,40/nota
2. **Manual**: Notifica Dr. Ricardo WhatsApp → emite gestaoiss.com.br

## Validações pré-emissão

- CPF válido (algoritmo)
- Valor numérico > 0
- Nome não vazio
- Data <= hoje
