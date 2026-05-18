# LGPD — Conformidade HairTech

Dados de saúde são **dados sensíveis** (LGPD art. 5º, II) com regime mais rigoroso de tratamento. Este documento descreve o que já está implementado e o que falta.

## ✅ Implementado

| Requisito | Como o sistema atende |
|---|---|
| Consentimento informado | Disclosure CFM 2.454/2026 na primeira mensagem (`app.js` + `audit_ai_calls`) |
| Audit log de IA | Tabela `audit_ai_calls` registra todas as chamadas (modelo, agente, hashes de prompt/resposta, tokens) |
| Acesso por autenticação | Sessão por cookie HttpOnly (8h), senha forte no `.env` |
| HTTPS obrigatório | Traefik + Let's Encrypt em hairtech.org |
| Backup encriptado em trânsito | Postgres via rede Docker interna, B2 via TLS |
| Minimização: prompts/respostas como hash | Audit log nunca armazena texto em claro do paciente |
| Retenção configurada | 5 anos (CFM 2.454/2026) — audit_ai_calls não tem cleanup automático |
| Política de Privacidade pública | `/privacidade` |
| Termos de Uso público | `/termos` |
| Direito de exclusão | Envio de mensagem ao atendimento (manual hoje) |

## ⚠️ Parcial

| Requisito | Status atual | Como completar |
|---|---|---|
| Criptografia em repouso (Postgres) | Postgres rodando em volume normal (não LUKS) | Mudar volume Docker pra LUKS ou usar Postgres TDE (Transparent Data Encryption) — não trivial. Alternativa: criptografar coluna a coluna apenas para CPF/dados sensíveis |
| Log de auditoria de acesso ao prontuário | Não existe | Adicionar tabela `prontuario_access_log` registrando quem leu o quê |
| Anonimização de dados em treino/teste | N/A no produção | Tratar quando houver ambiente staging |
| Direito de portabilidade automatizado | Manual via `/admin/export` | Construir endpoint `GET /paciente/:cpf/dados` com JWT do paciente |

## ❌ Faltando

### 1. DPO (Encarregado de Dados) designado

A LGPD exige um DPO para empresas que tratam dados sensíveis em escala. Para clínica unipessoal, **pode ser o próprio Dr. Ricardo**, mas precisa ser:

- Designado formalmente em documento assinado
- Email público no rodapé do site
- Treinamento (curso EAD ANPD ~R$300, vários cursos comerciais R$500-2000)

**Template de designação** (assinar e arquivar):

```
TERMO DE DESIGNAÇÃO DE ENCARREGADO PELO TRATAMENTO DE DADOS PESSOAIS

A Clínica HairTech, CNPJ [XX], com sede em [endereço], designa nesta data
[NOME COMPLETO], inscrito no CPF [XX] e CRM [XX], como Encarregado pelo
tratamento de dados pessoais (DPO), nos termos do art. 41 da Lei 13.709/2018.

Contato do encarregado: dpo@hairtech.org / +55 21 99354-2383

Data: [data]
Assinatura: [Dr. Ricardo Meireles Marcelino]
```

Publicar no site: `/dpo` ou rodapé da Política de Privacidade.

### 2. Relatório de Impacto à Proteção de Dados (RIPD)

Obrigatório para tratamento de dados sensíveis em volume. Modelo da ANPD:
- https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/documentos-de-publicacoes/guia-ripd.pdf

Conteúdo:
- Mapa de dados (quais dados, de quem, para que)
- Base legal (consentimento + tutela da saúde, LGPD art. 11, II, f)
- Compartilhamentos (Meta WhatsApp, Google Gemini, etc)
- Riscos identificados + medidas mitigatórias
- Plano de resposta a incidentes

### 3. Plano de resposta a incidente de dados

ANPD precisa ser notificada em **2 dias úteis** após incidente significativo. Modelo:
- https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis

**Para a HairTech**, gatilhos típicos:
- Vazamento de credenciais (Telegram bot, .env, OAuth)
- Acesso não autorizado ao /admin
- Perda física do VPS (Hostinger comprometido)
- Compromisso de container (vulnerabilidade WAHA/Postgres)

**Resposta**: isolar → notificar Dr. via Telegram → backup imediato → revogar credenciais → registrar em `incidentes-lgpd.json`.

### 4. Cadeia de processadores documentada

Quem mais toca os dados:

| Processador | O que recebe | Base legal |
|---|---|---|
| Meta (WhatsApp Cloud API) | Conversas WhatsApp | LGPD art. 11, V (tutela da saúde) + termos Meta |
| Google (Gemini API) | Prompts + respostas (hash apenas no log) | Termos Google Cloud + DPA |
| OpenAI (fallback) | Prompts + respostas | Termos OpenAI + DPA |
| Anthropic (Claude futuro) | Prompts + respostas | Termos Anthropic + DPA |
| Hostinger (infra) | Backups, banco | Termos Hostinger + DPA |
| Backblaze B2 (backup) | Backups encriptados | Termos B2 + DPA |
| Telegram (alertas operacionais) | Metadados | Termos Telegram |

**Importante**: dados de paciente identificável **NUNCA devem ir pra IA cloud sem anonimização ou base legal específica**. Hoje, os prompts contêm o nome do paciente — isso precisa ser revisto (anonimizar pra "Paciente A" no prompt).

### 5. Anonimização automática

Pendente: criar middleware que substitui PII no prompt antes de chamar IA.

```js
// integrations/anonimizar.js (a fazer)
function anonimizar(texto, mapa) {
  // substitui CPF, nome, telefone por placeholders
  return { texto_anon, mapa_reversao };
}
```

### 6. Termo de uso de IA na consulta (paciente)

CFM 2.454/2026 exige que o paciente seja **explicitamente informado** que IA participa do atendimento. Já está parcialmente coberto pelo disclosure inicial, mas convém formalizar:

```
Como você está interagindo com a Clínica HairTech via WhatsApp, suas
mensagens podem ser processadas por inteligência artificial para
agilizar o atendimento. As decisões clínicas finais são SEMPRE tomadas
pelo médico responsável (Dr. Ricardo Meireles Marcelino - CRM-RJ XXX).
Você pode solicitar atendimento exclusivamente humano respondendo HUMANO.
```

## Roadmap LGPD (prioridade)

1. **Esta semana**: designar DPO formalmente (Dr. Ricardo mesmo) + criar `/dpo` page
2. **Mês 1**: criar RIPD inicial (use o template ANPD), arquivar no Drive
3. **Mês 2**: implementar anonimização automática de PII em prompts
4. **Mês 3**: log de acesso ao prontuário + criptografia em repouso de colunas sensíveis (pgcrypto)
5. **Quando der incidente** (oxalá nunca): processo de notificação ANPD em 2 dias úteis

## Recursos úteis

- ANPD: https://www.gov.br/anpd/pt-br
- LGPD texto: http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- CFM 2.454/2026: https://portal.cfm.org.br/resolucoes
- Modelos: https://www.gov.br/anpd/pt-br/documentos-e-publicacoes
