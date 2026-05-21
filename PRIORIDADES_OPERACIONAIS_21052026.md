# Prioridades operacionais — 21/05/2026 00:35 BRT

## O que o sistema fará SOZINHO (você só dorme)

| Hora | O que acontece | Status |
|---|---|---|
| **agora** | Esta sessão pushou últimos commits pra branch `liD5V` | ✅ feito |
| em ~2min | Cron VPS puxa commits, T26 force-recreate AV se mudou | ✅ automático |
| em ~5min | AV recarrega com mensagens novas (gancho "aparelho voltou") | ✅ automático |
| **09:00 BRT** | BLITZ dispara automaticamente (agendamento anti-madrugada) | ✅ agendado |
| 09:05-09:30 | Mensagens saem 1 a cada 3s pra: reagendamentos → sem-resposta → quentes → mornos | ✅ automático |
| 09:30 | Telegram chega com resumo (X enviadas, Y falhas) | ✅ automático |
| 10:00 | CRM proativo gera fila adicional em `/admin/aprovar-fila` | ✅ cron diário |

## O que VOCÊ faz amanhã ao acordar (15 min)

1. **Telegram chegou ~9h30**: lê resumo do BLITZ
2. **Abre `hairtech.org/admin/blitz`** no celular: vê lista top 10 quentes pra ligar
3. **Liga pros 10** sequencialmente (60s cada, "aparelho voltou, vagas quinta/sexta")
4. Quem responder SIM via WhatsApp → AV detecta intenção, marca quente, alerta P1 no Telegram
5. Você prioriza esses, manda apresentação Paciente Modelo, pede fotos, fecha

## Prioridades por ordem (revisão completa)

### P0 — DINHEIRO (próximas 48h)
- [x] BLITZ pronto, agendado pra 9h amanhã
- [x] Mensagem com gancho real (aparelho voltou) — não inventei
- [x] Valores corretos (R$8.500/R$9.000 — corrigi obsoleto R$8.000)
- [x] Apresentação Paciente Modelo PDF-ready no link
- [x] /admin/investigacao busca conversas WhatsApp pessoal pra achar cobranças + leads esquecidos
- [ ] **Você fazer ligações 9h-11h amanhã**

### P1 — FLUXO (próximos 7 dias)
- [ ] **Você preencher contratos** Paciente Modelo + Reembolso (DOCX no Mac, criados por Codex)
- [ ] **Você confirmar ferramenta assinatura**: DocuSign vs D4Sign vs ZapSign (verificar qual está realmente paga)
- [ ] **Você renovar VPS** antes 17/06 (auto-renew ativo, conferir hPanel)
- [ ] Pré-consulta inteligente (form + foto + IA resumo) — construo quando me pedir

### P2 — ORGANIZAÇÃO (próximas 2 semanas)
- [ ] Drive: criar pasta `PACIENTES_HAIRTECH/` com Paciente_001...N → construo automaticamente
- [ ] Drive: regras anti-apagar (mover antigos pra `/MEMORIA_CENTRAL/ARQUIVADO/` em vez de deletar)
- [ ] Gmail: auditoria cobranças → Gmail MCP precisa reautorização (token expirou hoje)
- [ ] WhatsApp pessoal: `/admin/investigacao` lista cobranças/leads/fornecedores → quando AV recarregar com este commit

### P3 — ESCALA (depois que dinheiro estabilizar)
- TikTok crescimento
- Memed/CFM Prescricao
- Feegow integration
- Backup Backblaze B2

## O que EU posso fazer e o que NÃO posso

### Posso (já em código no sistema)
- ✅ **Auditar WhatsApp pessoal do Dr.** via WAHA (mesma sessão da ANA, mesmo número) — `/admin/investigacao` classifica conversas em: cobranças, pacientes transplante, pacientes MMP, agendamentos, fornecedores, bancos, pessoal
- ✅ **Disparar mensagens em massa** via Cloud API (AV) — BLITZ
- ✅ **Gerenciar grupo Timeless** via WAHA — `/admin/grupo`
- ✅ **Gerar invites de grupo**
- ✅ **Criar conteúdo** (mensagens, scripts, PDFs print-friendly)
- ✅ **Commits no Git** → cron VPS aplica em ≤5min
- ✅ **Drive MCP**: criar/ler pastas, arquivos, buscar (quando tokens válidos)
- ✅ **Gmail MCP**: ler/buscar emails (token expirou hoje, precisa reautorizar)

### Não posso (limites do sandbox)
- ❌ Abrir browser, fazer login, preencher formulário em sites externos
- ❌ Acessar iPhone (chamadas, SMS, iCloud Photos)
- ❌ Comunicar com ChatGPT/Manus diretamente
- ❌ Acessar seu Mac (Ollama local, arquivos do iCloud Drive)

### Investigação iPhone — limites reais

| O que você pediu | Possível? | Caminho |
|---|---|---|
| Ver mensagens WhatsApp pessoal | ✅ SIM | `/admin/investigacao` (WAHA lê tudo) |
| Ver mensagens WhatsApp Business | ⚠️ depende | Se Business é o número da AV (5521993542383), eu vejo via DB. Se for outro número, NÃO vejo. |
| Ver chamadas recebidas (cobrança) | ❌ NÃO | Apple não expõe Call History via API. Solução: app TrueCaller filtra spam automático. Ou Manus com Computer Use no iPhone Mirror. |
| Ver SMS | ❌ NÃO | Mesmo problema |
| Auditar Gmail cobranças | ✅ SIM | Precisa reautorizar Gmail MCP (token expirou). Cole o link de auth quando aparecer. |
| Ver iCloud Photos | ❌ NÃO | Apple não expõe. Solução: exportar fotos pro Drive → eu organizo |

## Reautorização Gmail (1 ação sua amanhã)

Quando você for usar a auditoria de cobranças no Gmail, eu vou tentar acessar e vai aparecer uma URL de autorização. Você clica, autoriza, e tudo passa a funcionar.

Por enquanto, foque no BLITZ.

## Resumo final do que muda amanhã

**Antes** (estado anterior):
- Sistema parado, mensagens com valor obsoleto, sem gancho real, sem detecção de leads esquecidos
- Apertando "DISPARAR" madruga = acordava paciente
- Dr. tinha que abrir conversa por conversa pra achar cobranças

**Agora** (commit `c53bd29` + próximo):
- BLITZ agendado pra 9h, mensagens com aparelho voltou, valores corretos
- 4 segmentos automáticos (reagendar / sem-resposta / quentes / mornos), dedupe entre eles
- `/admin/investigacao` classifica todas conversas do WhatsApp pessoal
- Apresentação PDF Paciente Modelo com valores 2026 corretos
- Anti-madrugada explícita (não dispara entre 22h e 8h)
