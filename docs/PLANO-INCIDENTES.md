# Plano de Resposta a Incidentes — Clínica HairTech

LGPD art. 48: ANPD deve ser notificada em até **2 dias úteis** após incidente que possa acarretar risco aos titulares. Este plano cobre detecção, contenção, notificação e pós-mortem.

---

## Tipos de incidente (gatilhos)

| Categoria | Exemplos | Severidade |
|---|---|---|
| **Vazamento de credencial** | .env exposto no git, Telegram bot token vazado, senha do /admin comprometida | 🔴 Alta |
| **Acesso não autorizado** | Login `/admin` por terceiro, sessão sequestrada | 🔴 Alta |
| **Compromisso de container** | WAHA/Postgres/OpenClaw com vulnerabilidade explorada | 🔴 Alta |
| **Perda de dados** | Volume do Postgres corrompido sem backup recente | 🟡 Média |
| **Vazamento de PII via IA** | Prompt com nome+CPF enviado pra IA sem anonimização | 🟡 Média |
| **Exposição pública via /admin/export** | URL com `?senha=` indexada por crawler | 🟡 Média |
| **Falha de backup** | 7 dias seguidos sem backup B2 | 🟢 Baixa (operacional) |
| **DDOS / sobrecarga** | Bot inundando webhook | 🟢 Baixa |

## Fluxo de resposta

### Passo 1 — DETECÇÃO (automático ou manual)

**Automático** (já implementado):
- Healthcheck a cada 5min → Telegram alert
- T23/T24 OpenClaw self-heal → log se falhar
- Audit log de IA (detectar volume anormal)

**Manual**: notificação de terceiros, denúncia de paciente.

### Passo 2 — CONTENÇÃO (primeiros 30 minutos)

Conforme tipo:

- **Vazamento credencial:**
  1. Rotacionar credencial imediatamente
  2. Verificar logs de acesso (Postgres, /admin)
  3. Revogar sessões ativas (limpar `sessoes` Map em admin.js)
  4. Trocar `ADMIN_PASS`, `AGENDA_ICS_TOKEN`, `TELEGRAM_BOT_TOKEN` se afetados

- **Acesso não autorizado:**
  1. Bloquear IP via UFW: `ufw deny from <ip>`
  2. Trocar senha admin
  3. Encerrar sessão Postgres do invasor: `SELECT pg_terminate_backend(pid);`

- **Compromisso container:**
  1. `docker stop <container>` imediato
  2. Snapshot do estado pra forensics
  3. Recriar do compose (volume preservado se DB)

- **Vazamento PII via IA:**
  1. Identificar paciente afetado via `audit_ai_calls`
  2. Avaliar gravidade (CPF? saúde detalhada?)

### Passo 3 — REGISTRO

Criar entrada em `/admin/incidentes`:

```json
{
  "id": "INC-2026-001",
  "data": "2026-XX-XX",
  "categoria": "vazamento_credencial",
  "severidade": "alta",
  "descricao": "...",
  "titulares_afetados_estimado": 0,
  "dados_envolvidos": ["telefone", "nome"],
  "contencao_aplicada": "...",
  "notificacao_anpd": null,
  "notificacao_titular": null,
  "rca_link": "..."
}
```

### Passo 4 — NOTIFICAÇÃO ANPD (se aplicável)

**Critério**: incidente "que possa acarretar risco ou dano relevante aos titulares" (art. 48 LGPD).

**Prazo**: 2 dias úteis a partir do conhecimento.

**Como**: formulário ANPD em [https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)

**Conteúdo mínimo**:
- Descrição da natureza do incidente
- Quantidade e categoria dos titulares afetados
- Categorias dos dados afetados
- Riscos relacionados ao incidente
- Medidas técnicas e organizacionais aplicadas

**Modelo de e-mail/comunicação**:

```
Assunto: Comunicação de Incidente de Segurança - Clínica HairTech (CNPJ XX)

A Clínica HairTech, na pessoa de seu Encarregado pelo tratamento de
dados pessoais (Dr. Ricardo Meireles Marcelino), comunica formalmente
o incidente de segurança ocorrido em [DATA], descrito a seguir:

[Descrição objetiva]

Categorias de dados pessoais afetados: [...]
Titulares afetados (estimativa): [...]
Medidas de contenção aplicadas: [...]
Próximos passos: [...]

Atenciosamente,
Dr. Ricardo Meireles Marcelino
Encarregado / DPO
dpo@hairtech.org
```

### Passo 5 — NOTIFICAÇÃO AOS TITULARES (se aplicável)

Critério: art. 48 §1º, II — "quando o risco e o dano relevante sejam suportáveis pela situação".

Forma sugerida: WhatsApp ao titular + e-mail se houver. Conteúdo simples:

```
Olá [NOME],

Identificamos um incidente em [DATA] que pode ter afetado dados
seus armazenados em nosso sistema. Os dados envolvidos foram:
[lista].

As medidas tomadas foram: [lista].

Você não precisa fazer nada agora, mas se notar algo estranho
(tentativas de contato suspeitas, etc), nos avise imediatamente.

Encarregado de Dados: dpo@hairtech.org

Atenciosamente,
Clínica HairTech
```

### Passo 6 — PÓS-MORTEM (até 7 dias)

Documentar em `incidentes-rca/INC-YYYY-NNN.md`:

- Linha do tempo detalhada
- Causa raiz
- Medidas preventivas para evitar recorrência
- Aprendizados

### Passo 7 — IMPLEMENTAR AÇÕES CORRETIVAS

Atualizar:
- `auto-apply.sh` se infra
- `admin.js` se aplicação
- `docs/RIPD-RELATORIO-IMPACTO.md` se risco/mitigação
- `data/vencimentos.json` se controle

## Contatos críticos

| Quem | Como contatar |
|---|---|
| Dr. Ricardo (DPO) | Telegram chat `8713631351`, WhatsApp +5521982006372 |
| ANPD | [comunicacao@anpd.gov.br](mailto:comunicacao@anpd.gov.br) |
| Hostinger Suporte | hpanel.hostinger.com → Suporte 24/7 |
| Meta (WhatsApp Business) | business.facebook.com → Help Center |

## Checklist mensal

- [ ] Verificar último backup B2 (deve ter <24h)
- [ ] Revisar audit_ai_calls (volume anormal?)
- [ ] Conferir alertas Telegram dos últimos 30 dias
- [ ] Rotacionar credencial sensível (recomendado trimestral)
- [ ] Verificar `/admin/lgpd` status (deve estar >85%)
