# Workspaces dos 13 Agentes HairTech

Especificações versionadas dos 13 agentes do Mestre v6.0 §7.
Quando autorizado, `auto-apply.sh` Round 12 copia esses arquivos pra `/opt/hairtech-openclaw/agents/` no VPS.

## Status (Rounds 8 + 9)

| # | ID | Status | Canal | LLM padrão | Notas |
|---|---|---|---|---|---|
| 1 | AV | ✅ Em produção | WhatsApp Cloud +5521993542383 | gemini-2.5-flash + gpt-4o-mini fallback | container assistente-virtual |
| 2 | ANA | ✅ Pareada | WAHA WEBJS +5521967813366 | claude-sonnet-4-6 + gpt-4o-mini fallback | container whatsapp-ana |
| 3 | MED | 📋 Workspace pronto | Telegram + interno | claude-opus/sonnet/haiku | Aguarda ANTHROPIC_API_KEY |
| 4 | NF | 📋 + Código pronto | API interna /nfse | gpt-4o-mini | nfse.js modo dual auto/manual |
| 5 | CRM | 📋 Workspace pronto | WhatsApp via AV | gemini-2.5-flash | Aguarda Feegow contratado |
| 6 | MKT | 📋 Workspace pronto | Telegram aprovação | claude-sonnet-4-6 | Aguarda ElevenLabs+HeyGen+Instagram |
| 7 | POS | 📋 Workspace pronto | WhatsApp via AV | claude-sonnet-4-6 | Aguarda tabela checkins_pos_op |
| 8 | ADMIN | 📋 Workspace pronto | Telegram Dr. | claude-sonnet-4-6 | Aguarda tools dashboard |
| 9 | ESTOQUE | 📋 Workspace pronto | Interno via ADMIN | gpt-4o-mini | Aguarda tabelas insumos* |
| 10 | FOTO | 📋 Workspace pronto | Webhook interno | claude-sonnet-4-6 vision | Aguarda ANTHROPIC + Drive |
| 11 | FIN | 📋 + Skeleton Round 11 | Webhook InfinityPay | gpt-4o-mini | Pix-provider agnostic |
| 12 | EDU | 📋 Workspace pronto | Telegram Dr. | claude-sonnet-4-6 + PubMed | Aguarda ANTHROPIC |
| 13 | COMP | 📋 Workspace pronto | Telegram Dr. | claude-sonnet-4-6 | Aguarda tabela compliance_documentos |

## Convenções

- **SOUL.md**: persona, regras CFM, hard limits, escalação
- **AGENTS.md**: tooling, endpoints, dependências, schemas SQL
- **config.json**: schema OpenClaw-friendly

## Ativação (Round 12 auto-apply.sh)

1. Doctor adiciona ANTHROPIC_API_KEY em /opt/hairtech-openclaw/.env
2. Doctor cria marker `touch /opt/hairtech-openclaw/ANTHROPIC_READY.flag`
3. auto-apply.sh detecta: mergeia providers.anthropic-api em openclaw.json + copia docs/agents/* pra /opt/hairtech-openclaw/agents/ + restart
4. `curl https://claw.hairtech.org/api/agents` lista 13

## Ordem de ativação sugerida

1. ADMIN (cockpit principal)
2. MED (apoio clínico)
3. POS (pacientes existentes)
4. CRM (após Feegow)
5. NF (após FocusNFe)
6. FIN (após InfinityPay)
7. ESTOQUE (após 1ª cirurgia rastreada)
8. FOTO (após Drive estruturado)
9. EDU (qualquer momento)
10. COMP (qualquer momento)
11. MKT (último, após cessão imagem/voz)
