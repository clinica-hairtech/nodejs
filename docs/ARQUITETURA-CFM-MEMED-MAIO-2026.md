# Arquitetura — Prescrição / Atestado / Certificado Digital (maio/2026)

Após pesquisa Codex de 18/05/2026, **3 mudanças importantes no plano original**:

## 1. Esqueça CREMERJ — agora é CFM Nacional

| Antes | Agora |
|---|---|
| "Integrar com CREMERJ Digital" | Receita Digital CREMERJ **descontinuada em 11/07/2025** — tudo migrou pra Prescrição Eletrônica Nacional do CFM |
| Sistemas locais por estado | CRM Virtual nacional (substituiu SIFA em 09/07/2025) |

**O que existe oficial:** pacote NPM `@conselho-federal-de-medicina/integracao-prescricao-cfm` (componente embarcado).

## 2. Certificado digital ICP-Brasil GRÁTIS no CFM

**Resolução CFM 2.296/2021** + lançamento em massa em 24/06/2025 via CRM Virtual:

- Tipo: **A3 em nuvem ICP-Brasil**
- Emissor: AC Valid via AR-CFM
- Custo: **R$0** (era R$300/ano via Serasa/Certisign)
- Pré-requisitos:
  - CRM ativo (inscrição regular)
  - CIM em policarbonato (NÃO papel-moeda)
  - Biometria atualizada no CFM
  - Sem certificado gratuito recebido nos últimos 12 meses
- Como obter: `crmvirtual.cfm.org.br`
- Aceito por: VIDaaS, BirdID, NeoID, Atesta CFM, Prescrição Eletrônica Nacional

**Economia anual: R$300.** Dr. Ricardo deve obter este antes de comprar qualquer e-CPF Serasa.

## 3. Atesta CFM agora é obrigatório

**Resolução CFM 2.382/2024**, vigência 05/03/2025:

- Qualquer atestado médico emitido fora do barramento Atesta CFM (ou sistema integrado) é **legalmente nulo**
- Liminar de 11/2024 suspendeu; **TCU reconheceu legalidade** em decisão posterior
- Integração gratuita ao barramento
- Exige assinatura ICP-Brasil

Em `/admin/prontuario/:numero/prescrever` agora tem botão "Abrir Atesta CFM" direto.

## Stack final (Cenário A confirmado, ajustado)

| Necessidade | Ferramenta | Custo | Observação |
|---|---|---|---|
| Prescrição simples | **CFM Prescricao Eletronica** (componente embarcado NPM) ou **Memed** (REST + JS) | R$0 | Memed tem +323 integrações nacionais |
| Atestado | **Atesta CFM** obrigatório | R$0 | Botão direto no prontuário |
| Receita controle especial | **CFM Prescricao Eletronica** | R$0 | Aceita VIDaaS/BirdID/Certificado CFM |
| Receita azul/amarela (Lista A/B) | **SNCR Anvisa** | R$0 | **Aguardar 01/06/2026** — sistema só estará 100% após isso |
| Laudo / relatório | Próprio + assinatura PKCS#7 | R$0 | VIDaaS API ou Certificado CFM |
| Certificado digital médico | **CFM em nuvem (A3 ICP-Brasil)** | **R$0** | Substitui e-CPF R$300/ano |
| Prontuário (organização) | **Próprio** em hairtech.org/admin/prontuario | R$0 | Auxiliar — combinado com CFM Prescricao tem valor legal |
| RNDS (HL7 FHIR) | Postergar 12-24 meses | — | Só vale se atender SUS ou rede de estabelecimentos |
| SBIS NGS1 do prontuário | **Não fazer** | — | R$15k inviável pra clínica unipessoal; CFM Prescricao + Atesta CFM cobrem |

## Próximas ações (ordem de prioridade)

### Dr. Ricardo

1. **Esta semana**: solicitar certificado A3 grátis em `crmvirtual.cfm.org.br`
2. **Esta semana**: solicitar credenciais HOMOLOGAÇÃO de Prescricao CFM em `sistemas.cfm.org.br/contatoprescricaoeletronica/br` (formulário)
3. **Cadastrar no Memed** (grátis) — caminho B se CFM demorar
4. **Renovar VPS antes 22/05** (4 dias)
5. **Login Claude Code na VPS** após Telegram confirmar instalação

### Sistema (autonomamente via cron)

1. CFM credentials chegarem → preencher `.env` → AV recarrega via T26 → status muda pra "configurado" automaticamente em /admin/prontuario/:numero/prescrever
2. Memed credentials chegarem → integrations/memed.js ativa
3. Ollama 7B baixa → custo API cai

## Riscos / caveats

- **Pacote NPM CFM tem adoção baixa** (~9 downloads/semana, sem release em ~1 ano). Plano B = Memed.
- **SBIS NGS1 para construir prontuário próprio certificado** ficou R$15k+ uma vez — confirmado inviável. Caminho é integrar CFM + Memed + Atesta CFM.
- **NUNCA armazenar PFX de médicos no VPS** — chaves privadas devem ficar sempre em HSM do PSC (VIDaaS/BirdID) ou no certificado em nuvem CFM.
- **LGPD dados sensíveis**: VPS precisa ter criptografia em repouso, em trânsito, log de auditoria, DPO designado.
