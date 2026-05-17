# Workspaces dos 13 Agentes HairTech

Especificações versionadas (em git) dos 13 agentes do Mestre v6.0 §7.
Quando autorizado, `auto-apply.sh` copia esses arquivos pra `/opt/hairtech-openclaw/agents/` no VPS e restarta o orquestrador.

## Implementados (config commitada)

| # | ID | Status SOUL | Status AGENTS | Status config |
|---|---|---|---|---|
| 1 | AV | ✅ | ✅ | ✅ |
| 2 | ANA | ✅ | ✅ | ✅ |
| 3 | MED | ⏳ Round 9 | ⏳ | ⏳ |
| 4 | NF | ⏳ Round 9 | ⏳ | ⏳ |
| 5 | CRM | ⏳ Round 9 | ⏳ | ⏳ |
| 6 | MKT | ⏳ Round 9 | ⏳ | ⏳ |
| 7 | POS | ⏳ Round 9 | ⏳ | ⏳ |
| 8 | ADMIN | ⏳ Round 9 | ⏳ | ⏳ |
| 9 | ESTOQUE | ⏳ Round 9 | ⏳ | ⏳ |
| 10 | FOTO | ⏳ Round 9 | ⏳ | ⏳ |
| 11 | FIN | ⏳ Round 9 | ⏳ | ⏳ |
| 12 | EDU | ⏳ Round 9 | ⏳ | ⏳ |
| 13 | COMP | ⏳ Round 9 | ⏳ | ⏳ |

## Convenções

- **SOUL.md**: personalidade, regras de ouro, aviso CFM, hard limits, escalação
- **AGENTS.md**: tooling, endpoints, dependências, limitações técnicas
- **config.json**: schema OpenClaw-friendly (id, channel, models, params, escalation, persistence, compliance)

## Como ativar no OpenClaw (futuro Round)

1. Validar schema com `openclaw validate docs/agents/<ID>/config.json`
2. Copiar para `/opt/hairtech-openclaw/agents/<id>/`
3. Adicionar entrada em `openclaw.json` -> `agents`
4. `docker restart hairtech-openclaw`
5. Verificar `claw.hairtech.org/api/agents` lista o novo
