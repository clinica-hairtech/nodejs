# BRIEFING MANUS — Envio de notificações extrajudiciais
# Versão 2026-05-22. Custo estimado: ~$2-5 em créditos Manus.

## TAREFA

Enviar a **Notificação Extrajudicial Lei 14.181/2021** preenchida para CADA credor
da lista FINAL confirmada por Dr. Ricardo, usando o canal preferencial de cada um.

## INPUTS

1. **Template**:
   `docs/legal/NOTIFICACAO_EXTRAJUDICIAL_SUPERENDIVIDAMENTO_TEMPLATE.md`
   (no repo `clinica-hairtech/nodejs`, branch `claude/hairtech-whatsapp-ai-liD5V`)

2. **Lista de credores confirmada**:
   Drive → `MATRIZ EVIDENCIAS SUPERENDIVIDAMENTO 2026-05-22` (planilha)
   ATENÇÃO: usar APENAS credores com flag "confirmar=SIM" na coluna F.

3. **Dados do remetente** (preencher placeholders):
   - Nome: Ricardo Meireles Marcelino
   - CPF: pegar do Drive `DADOS_PESSOAIS_RM_2026.md` (privado)
   - CRM-RJ: 52-79428-1
   - Endereço pessoal: pegar do mesmo arquivo
   - Email: rmeireles87@gmail.com
   - WhatsApp: +55 21 98200-6372

## PASSOS

### 1. Preparar PDFs por credor

Para cada credor confirmado:
1. Pegar template Markdown
2. Substituir TODOS os `{{...}}` com dados específicos do credor (nome, CNPJ, endereço, número contrato, valor declarado)
3. Converter Markdown → PDF (usar `pandoc` ou similar; A4, margem 2cm, fonte serif 11pt)
4. Salvar em Drive: `NOTIFICACOES_22052026/Notificacao_{{NOME_CREDOR_SLUG}}.pdf`

### 2. Envio por canal

**Bancos grandes (XP/BB/Bradesco/Itaú/Caixa)**:
1. Login no portal cliente do banco (usar credenciais armazenadas em Drive `CREDENCIAIS_BANCOS_RM.kdbx` se disponível; senão, sinalizar HANDOFF pro Dr. fazer login)
2. Achar "Mensagem ao Banco" ou "Ouvidoria" ou "Contato Recuperação de Crédito"
3. Anexar PDF
4. Texto da mensagem: "Segue notificação extrajudicial formal nos termos da Lei 14.181/2021. Aguardando manifestação em até 30 dias conforme art. 54-A CDC."
5. Capturar screenshot do protocolo gerado
6. Salvar screenshot em Drive: `NOTIFICACOES_22052026/Protocolos/{{credor}}_protocolo.png`

**Bureaus (Serasa/SPC/Boa Vista)**:
- Email com aviso de leitura para o canal oficial. Ex Serasa: `ouvidoria@serasa.com.br`
- Anexar PDF
- Subject: `[FORMAL] Notificação Extrajudicial Lei 14.181/2021 — CPF {{CPF_REM}}`

**Locador / pequena empresa**:
- Email + WhatsApp (com leitura ativada)
- Cordialidade no email, formalidade no PDF

**Telecom/streaming**:
- Portal SAC
- Anexar PDF se permitir upload, senão colar texto

### 3. Registrar resultado

Para cada envio, atualizar Drive: `NOTIFICACOES_22052026/REGISTRO.csv` com colunas:
```
credor,canal,timestamp_envio,protocolo,status,screenshot_path,observacoes
```

Status possíveis: `ENVIADO`, `HANDOFF_LOGIN` (precisa Dr.), `FALHOU_PORTAL`, `EMAIL_BOUNCED`, `AR_NECESSARIO`

### 4. Notificar Telegram

Ao final do lote:
```bash
curl -X POST https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage \
  -d chat_id=8713631351 \
  -d "text=[MANUS] Notificações extrajudiciais lote $(date +%Y-%m-%d): X enviadas, Y handoff, Z falharam. Detalhes em Drive NOTIFICACOES_22052026/REGISTRO.csv"
```

## REGRAS

- ⚠️ **NÃO inventar dados.** Se faltar CNPJ ou endereço de algum credor, deixar como `HANDOFF` no CSV e seguir pros próximos.
- ⚠️ **NÃO usar Computer Use em sites de bancos sem confirmação explícita do Dr.** — alguns bancos têm anti-fraude que bloqueia conta se detectar automação. Caso de dúvida → HANDOFF.
- ✅ AR Correios sempre é fallback seguro (Codex pode preparar etiquetas via webhook Mac)
- ✅ Email é fallback universal se portal falhar
- ⏱️ Limite: gastar no máximo $5 em créditos. Se passar, parar e notificar Dr.

## RETORNAR

Ao final, commitar no repo:
```
data/notificacoes-extrajudiciais-22052026-resultado.json
```

Com objeto:
```json
{
  "executado_em": "ISO",
  "total_credores": N,
  "enviadas": M,
  "handoff": K,
  "falhas": J,
  "por_credor": [{"credor":"X","canal":"Y","status":"ENVIADO","protocolo":"123"}]
}
```

E mandar Telegram pro Dr. com link do arquivo no Git.

## SE NÃO CONSEGUIR ACESSAR ESTE BRIEFING

Você (Manus) é um agente em ambiente externo. Para receber este briefing:
1. Acessar GitHub repo `clinica-hairtech/nodejs` raw blob deste arquivo
2. URL direta: https://raw.githubusercontent.com/clinica-hairtech/nodejs/claude/hairtech-whatsapp-ai-liD5V/manus-briefings/20260522-enviar-notificacoes-extrajudiciais.md

Se Dr. te enviar via paste, ignorar este parágrafo.
