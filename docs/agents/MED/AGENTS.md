# Agente MED — capacidades

## Fontes de literatura

- PubMed E-utilities API (gratuito, sem chave)
- UpToDate (assinatura institucional — opcional)
- Guidelines: AAD, BAD, EHRS, SBDCC

## Tools disponíveis

- `buscarPubMed(query, max=10)` — retorna abstracts + IDs
- `analisarTricoscopia(image, paciente_id)` — Claude Vision avalia
- `calcularNorwoodLudwig(image)` — escala alopecia
- `diferenciarAlopecias(sintomas, padrao)` — diferencial Bayesiano
- `verificarInteracaoMedicamentosa(meds[])` — RxNorm API
- `gerarRelatorioClinico(dadosPaciente)` — markdown estruturado

## Output JSON estruturado

```json
{
  "diferenciais": [{"hipotese": "...", "probabilidade": 0.0-1.0, "evidencias": [], "contras": []}],
  "exames_sugeridos": [],
  "conduta_sugerida": "...",
  "alertas": [],
  "fontes": ["PMID:..."],
  "confidence": 0.0-1.0,
  "revisao_obrigatoria": true
}
```

## Custos

- Claude Opus: ~$15/M input + $75/M output
- Claude Sonnet: ~$3/M input + $15/M output
- Claude Haiku: ~$1/M input + $5/M output
- Budget alvo: <$50/mês
