# GUIA — Preencher chaves/tokens/APIs

> Por que **NUNCA** estão preenchidas no Git: secrets em repo público = roubadas em segundos por bots. Por isso o `.env.example` mostra só o NOME e onde colocar. O valor REAL fica em `/home/user/nodejs/.env` da VPS, com `chmod 600` (só root lê).

## Tabela de chaves — onde estão e como preencher

| Linha .env.example | Variável | Status | O que fazer |
|---|---|---|---|
| 3 | `WHATSAPP_TOKEN=SEU_TOKEN_AQUI` | 🔒 **Dr. preenche 1x** | Pegar em developers.facebook.com → app HairTech → WhatsApp → API Setup → "Temporary access token" OU "Permanent system user token" (recomendado, não expira) |
| 6 | `GEMINI_API_KEY=SEU_GEMINI_API_KEY_AQUI` | 🔒 **Dr. preenche 1x** | aistudio.google.com/apikey → criar key projeto HairTech |
| 13 | `WHATSAPP_ANA_KEY=GERE_UMA_CHAVE_LONGA` | ⚙️ **Auto-gerar** | `openssl rand -hex 32` (já existe no .env da VPS, NÃO regerar — quebraria ANA) |
| 19 | `OPENCLAW_GATEWAY_TOKEN=GERE_UM_TOKEN_LONGO` | ⚙️ **Auto-gerar** | `openssl rand -hex 32` (já existe na VPS, NÃO regerar) |
| 22 | `OPENCLAW_BASICAUTH=ricardo:$$apr1$$EXEMPLO$$SUBSTITUA` | 🔒 **Dr. preenche 1x** | `htpasswd -nbB ricardo 'SUA_SENHA_AQUI' \| sed -e 's/\$/\$\$/g'` — copia output completo (formato `ricardo:$$...`) |
| 24 | `POSTGRES_RO_URL=...TROQUE_AQUI...` | 🔒 **Dr. preenche 1x** | Senha do user `openclaw_ro` (criar no Postgres com `CREATE USER openclaw_ro WITH PASSWORD 'XYZ'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO openclaw_ro;`) |
| 31 | `VNC_PW=TROQUE_AQUI` | 🔒 **Dr. preenche** OU 🚫 **ignorar se não usa VNC** | Só se ativar Computer Use VNC. Senão deletar a linha |

## Chaves **já geradas automaticamente** pelo `auto-apply.sh`

Estas o sistema cria sozinho na VPS (você não precisa fazer nada):

| Variável | Quem gera | Quando |
|---|---|---|
| `INTERNAL_API_TOKEN` | auto-apply T7 | primeiro deploy do OpenClaw |
| `AGENDA_ICS_TOKEN` | auto-apply T29 | a cada execução (se faltar) |
| `AGENTS_API_TOKEN` | auto-apply T30 | a cada execução (se faltar) |
| `AGENTS_API_LIMITE=10` | auto-apply T30 | default R$10/dia |

## Chaves pendentes do Codex/Dr. (briefings antigos)

| Briefing | Variável | Onde pegar |
|---|---|---|
| `manus-briefings/20260521-0100-docusign-4-chaves.md` | `DOCUSIGN_INTEGRATION_KEY` | account.docusign.com → Apps and Keys |
| ↑ | `DOCUSIGN_USER_ID` | mesma página, copiar User GUID |
| ↑ | `DOCUSIGN_ACCOUNT_ID` | DocuSign admin → "API Account ID" |
| ↑ | `DOCUSIGN_PRIVATE_KEY` | gerar par RSA: `openssl genrsa -out docusign.pem 2048` |
| (futuro) | `FOCUSNFE_TOKEN` | focusnfe.com.br → painel → tokens |
| (futuro) | `INFINITYPAY_CLIENT_ID` | painel.infinitypay.io |
| (futuro) | `INFINITYPAY_CLIENT_SECRET` | mesmo painel |
| (futuro) | `INFINITYPAY_WEBHOOK_SECRET` | mesmo painel |
| (futuro) | `ASAAS_API_KEY` | asaas.com → Configurações → Integrações |
| (futuro) | `ZAPSIGN_API_TOKEN` | zapsign.com.br → Configurações → API |
| (futuro) | `FEEGOW_API_KEY` | feegow.com → API |
| (futuro) | `ELEVENLABS_API_KEY` | elevenlabs.io |
| (futuro) | `B2_APPLICATION_KEY` | backblaze.com → App Keys |
| (futuro) | `ANTHROPIC_API_KEY` | console.anthropic.com/settings/keys |
| (futuro) | `OPENAI_API_KEY` | platform.openai.com/api-keys |

## Como Dr. preenche NA VPS (1 vez só)

```bash
ssh root@72.62.100.6
cd /home/user/nodejs

# Backup
cp .env .env.bak-$(date +%Y%m%d)

# Edita
nano .env
# preenche cada SEU_TOKEN_AQUI / GERE_/TROQUE com valor real
# salva (Ctrl+O Enter Ctrl+X)

chmod 600 .env

# Restart pra carregar
docker compose restart assistente-virtual
sleep 8
docker logs assistente-virtual --tail 20 | grep -iE "iniciou|erro|listening"
```

## Como Dr. confere se .env tem cada chave (sem expor o valor)

```bash
ssh root@72.62.100.6 "grep -E '^[A-Z_]+=.+' /home/user/nodejs/.env | cut -d= -f1 | sort"
```
Lista só os NOMES das variáveis presentes. Se falta alguma, é só preencher.

## Resposta direta à sua reclamação

Eu NÃO posso preencher essas chaves por você porque:
1. **Eu não tenho acesso à VPS** (sandbox bloqueia, já comprovado)
2. **Mesmo se tivesse, jamais commitaria no Git** (regra de segurança absoluta)

O que EU já fiz:
- ✅ `INTERNAL_API_TOKEN`, `AGENDA_ICS_TOKEN`, `AGENTS_API_TOKEN` — auto-gerados pelo auto-apply T7/T29/T30 SEM você intervir
- ✅ Briefings DocuSign Manus pra Manus gerar as 4 chaves quando autorizar
- ✅ Templates `.env.example` com TODOS os nomes corretos

O que **só você consegue**:
- Pegar token Cloud API da Meta (10min uma vez, depois nunca mais)
- Pegar Gemini API key (5min)
- Editar `.env` da VPS via SSH/Hostinger Terminal

**Esse `.env.example` no main está IDÊNTICO ao da branch ativa** — não foi alterado nesta sessão. É o template original, intencionalmente com placeholders.
