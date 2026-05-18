# WhatsApp Flows — Clínica HairTech

Formulários interativos oficiais da Meta para captação estruturada de dados via WhatsApp.

## Como ativar

1. Abra **Meta Business Manager** → **WhatsApp Manager** → **Flows**.
2. Clique em **Criar Flow** e cole o JSON do arquivo correspondente.
3. Publique o Flow (gera um `flow_id`).
4. Atualize o `.env` do AV com os IDs gerados:
   ```
   FLOW_ID_TRIAGEM=<id>
   FLOW_ID_ANAMNESE=<id>
   FLOW_ID_TCLE=<id>
   ```
5. No app.js, dispara o Flow respondendo com mensagem do tipo `interactive` → `flow`. Documentação Meta: https://developers.facebook.com/docs/whatsapp/flows/

## Flows neste diretório

| Arquivo | Quando enviar | Tela final retorna |
|---|---|---|
| `triagem-alopecia.json` | Lead novo perguntando preço FUE | Nome, idade, sexo, cidade, tempo de queda, intensidade, comorbidades, tratamento prévio, objetivo |
| `anamnese-pre-fue.json` | Lead agendou avaliação ou comprou pacote | Histórico médico, hábitos, medicações em 3 telas |
| `consentimento-fue.json` | Dia da cirurgia ou anterior | TCLE digital com CPF + opt-in formal |

## Importante

- Flows só funcionam em **WhatsApp Business API** (Cloud API ou On-Premises).
- Não funcionam em WhatsApp comum / Business app.
- A ANA (WAHA) **NÃO** suporta Flows nativos — só o AV (Cloud API) pode disparar.
- Para validade legal do TCLE, complementar com assinatura ICP-Brasil em PDF separado.
