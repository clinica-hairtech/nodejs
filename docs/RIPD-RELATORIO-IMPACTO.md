# Relatório de Impacto à Proteção de Dados (RIPD)
## Clínica HairTech — versão 1.0 — maio/2026

Documento gerado conforme art. 38 LGPD e guia da ANPD ([link](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/documentos-de-publicacoes/guia-ripd.pdf)).

---

## 1. Identificação

- **Controlador:** Clínica HairTech
- **CNPJ:** _(preencher)_
- **Endereço:** _(preencher)_
- **Encarregado (DPO):** Dr. Ricardo Meireles Marcelino · CRM-RJ _(XX)_ · dpo@hairtech.org
- **Data de elaboração:** 18/05/2026
- **Próxima revisão:** 18/11/2026 (semestral)

## 2. Objetivo do tratamento

Atendimento ambulatorial em tricologia e transplante capilar FUE, com:
- Captação de leads via WhatsApp (Cloud API + WAHA)
- Triagem inicial automatizada por IA
- Agendamento de consultas
- Prontuário eletrônico auxiliar
- Cobrança via Pix
- Follow-up pós-operatório
- Re-engajamento de leads inativos

## 3. Base legal

| Tratamento | Base legal LGPD |
|---|---|
| Atendimento WhatsApp inicial | Art. 7º, V — execução de procedimento preliminar a contrato + consentimento da Política de Privacidade |
| Dados de saúde (anamnese, prontuário) | **Art. 11, II, f — tutela da saúde** em procedimento por profissional |
| Cobrança | Art. 7º, V — execução de contrato |
| Marketing / re-engajamento | Art. 7º, IX — legítimo interesse, com opt-out a qualquer momento |

## 4. Dados tratados

| Categoria | Exemplos | Sensibilidade |
|---|---|---|
| Identificação | nome, telefone, CPF | Normal (LGPD art. 5º, I) |
| Saúde | anamnese, fotos clínicas, prescrições, conduta médica | **Sensível** (art. 5º, II) |
| Financeiros | valor pago, NSU Pix, status pagamento | Normal |
| Comportamento | histórico de conversas, temperatura do lead | Normal |
| Localização (CEP) | endereço do paciente quando voluntário | Normal |

## 5. Ciclo de vida

```
Coleta (WhatsApp)
  ↓
Triagem IA (anonimizada antes da chamada cloud)
  ↓
Avaliação humana pelo Dr. Ricardo
  ↓
Prontuário (DB Postgres + arquivos prontuarios/)
  ↓
Atendimento clínico
  ↓
Pós-operatório / follow-up
  ↓
Arquivamento (mín. 20 anos para prontuário médico — CFM 1.821/2007)
  ↓
Anonimização ou eliminação após retenção
```

## 6. Compartilhamento (operadores)

| Operador | O que recebe | Localização | DPA assinado |
|---|---|---|---|
| Meta (WhatsApp Cloud API) | Conversas, telefone | EUA + UE | Sim (termos Meta) |
| Google (Gemini API) | Prompts/respostas (PII anonimizada) | EUA | Sim (GCP DPA) |
| OpenAI (fallback) | Prompts/respostas (PII anonimizada) | EUA | Sim |
| Anthropic (Claude) | Prompts/respostas (PII anonimizada) | EUA | Sim |
| Hostinger (infra VPS) | Banco de dados, código, .env | Brasil + EUA | Sim |
| Backblaze (backup B2) | Backups encriptados | EUA | Sim |
| InfinityPay (Pix) | Nome, CPF, valor | Brasil | Sim |
| Telegram (alertas operacionais) | Metadados (sem PII de paciente) | Mundo | Sim |

## 7. Medidas técnicas implementadas

| Categoria | Medida | Status |
|---|---|---|
| Confidencialidade | HTTPS obrigatório (Traefik + Let's Encrypt) | ✅ |
|  | Sessão por cookie HttpOnly + SameSite=Lax | ✅ |
|  | Senha forte de admin no .env (rotacionável) | ✅ |
|  | Anonimização PII antes de chamadas IA cloud | ✅ |
|  | Hashing de prompts/respostas no audit log | ✅ |
|  | Criptografia em repouso (Postgres TDE/LUKS) | ⚠️ Pendente — colunas sensíveis em pgcrypto |
| Integridade | Backup diário Postgres + código + .env (Backblaze B2) | ✅ Pronto (depende ativação Dr.) |
|  | Tag git pré-execução em cada deploy | ✅ |
|  | Audit log de todas as chamadas IA (5 anos) | ✅ |
|  | Audit log de acesso ao prontuário (LGPD) | ✅ |
| Disponibilidade | Healthcheck a cada 5min + self-heal Docker | ✅ |
|  | Auto-deploy via cron com rollback git | ✅ |
| Direitos do titular | Portabilidade (`/admin/paciente/:numero/exportar-lgpd`) | ✅ |
|  | Exclusão (`/admin/paciente/:numero/excluir-lgpd`) | ✅ |
|  | DPO publico (`/dpo`) | ✅ |
|  | Política de Privacidade pública (`/privacidade`) | ✅ |

## 8. Medidas organizacionais

- DPO designado: Dr. Ricardo Meireles Marcelino
- Treinamento LGPD: pendente (curso EAD recomendado: ANPD)
- Acesso por princípio de necessidade: somente o médico tem `/admin`
- Revisão semestral do RIPD: marcada para 18/11/2026
- Processo de notificação de incidente: ver `docs/PLANO-INCIDENTES.md`

## 9. Riscos identificados

| Risco | Probabilidade | Impacto | Mitigação atual | Mitigação adicional |
|---|---|---|---|---|
| Vazamento de credenciais (.env) | Baixa | Alto | .env fora do git, permissão 600, backup encriptado | Rotação trimestral |
| Acesso não autorizado ao /admin | Baixa | Alto | Sessão por cookie, senha forte | 2FA, IP allowlist |
| Compromisso do VPS Hostinger | Muito baixa | Alto | Hostinger gerencia, Snapshots automáticos | Backup off-site B2 (pronto, falta ativar) |
| Vazamento via prompt enviado à IA | Média (antes) → Baixa (agora) | Médio | Anonimização PII implementada | Auditoria periódica das chamadas |
| Reidentificação a partir de dados anonimizados | Baixa | Médio | Tokens [NOME_1] genéricos | Combinar com k-anonymity em datasets |
| Perda do prontuário por falha de hardware | Baixa | Alto | Backup diário | Backup B2 off-site (ativar) |
| Acesso indevido de funcionário | Baixa (unipessoal) | Médio | Apenas 1 usuário hoje | Quando crescer: multi-user + RBAC |

## 10. Conclusão

O tratamento descrito é **necessário, proporcional e adequado**. Os riscos identificados estão devidamente mitigados pelas medidas técnicas e organizacionais já implementadas. Os 2-3 itens pendentes (criptografia em repouso, backup B2, treinamento DPO) têm plano de ação datado neste documento.

**Aprovação:**

```
Dr. Ricardo Meireles Marcelino - CRM-RJ ___________

Data: ____ / ____ / 2026

Assinatura: _____________________________________
```

(Assinar digitalmente com certificado A3 do CFM ou e-CPF.)
