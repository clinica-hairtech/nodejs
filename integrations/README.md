# Integrations HairTech

Skeletons de integracoes com servicos externos. Cada modulo segue padrao:

```js
const KEY = process.env.SERVICE_API_KEY || "";
if (!KEY) return { mode: "placeholder", message: "..." };
// codigo real
```

## Status (17/05/2026)

| Servico | Arquivo | Status | Keys obtidas |
|---|---|---|---|
| DocuSign | docusign.js | parcial (3 IDs, faltam 3 secrets) | User, Account, BaseURI |
| InfinityPay | infinitypay.js | placeholder (Dr. nao achou API painel) | nenhuma |
| FocusNFe | nfse.js (Round 8) | dual mode | nenhuma |
| Feegow | feegow.js | placeholder | nenhuma |
| Asaas | asaas.js | placeholder | nenhuma |
| ElevenLabs | elevenlabs.js | placeholder | nenhuma |
| HeyGen | heygen.js (legado) | usa env existente | nenhuma |
| Backblaze B2 | b2-backup.js (futuro) | placeholder | nenhuma |
| Apple Calendar | apple-calendar.js | parcial (CalDAV creds tenho) | jwos-eflc-knya-hfna |

## Como ativar

1. Dr. Ricardo pega credenciais (ver PLAYBOOK_ATIVACAO_DR_RICARDO.md Drive)
2. Adiciona no `/home/user/nodejs/.env`:
   ```
   DOCUSIGN_INTEGRATION_KEY=xxx
   DOCUSIGN_RSA_PRIVATE_KEY_BASE64=xxx
   DOCUSIGN_HMAC_SECRET=xxx
   ...
   ```
3. Recreate AV: `cd /home/user/nodejs && docker compose up -d --force-recreate assistente-virtual`
4. Integracao detecta env var, sai do modo placeholder, ativa

## Importar no app.js

Nenhum desses ainda esta importado no app.js. Sao skeletons isolados.
Quando ativados, adicionar:
```js
const docusign = require('./integrations/docusign');
const infinitypay = require('./integrations/infinitypay');
// etc
```
E registrar routes/handlers conforme necessario.
