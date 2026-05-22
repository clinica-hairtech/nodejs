Codex, executar AGORA (em ordem) — TUDO via Ollama local (custo R$0):

PRIORIDADE 1 — Reativar receita (sem isso, ciclo de endividamento se aprofunda)
================================================================

1. **Meta Ads** está pausada desde 04/05 por pagamento. Abrir business.facebook.com,
   ir em Cobrança, trocar método de pagamento pra Pix ou outro cartão. Reativar
   campanhas existentes. Mesmo R$50-100/dia já capta leads.

2. **Google Ads** recusou pagamento em 20/05. Mesmo processo: trocar método, retomar.

PRIORIDADE 2 — Triagem das 984 mensagens de cobrança
================================================================

3. Executar:
   ```bash
   cd ~
   python3 /Users/dr.ricardomeireles/Documents/Codex/[caminho]/codex-scripts/triagem-2-cobrancas-ollama.py
   ```
   (Se o script não estiver baixado do GitHub, baixar primeiro do branch
   claude/hairtech-whatsapp-ai-liD5V → codex-scripts/triagem-2-cobrancas-ollama.py)

   Output esperado:
   - triagem2_cobranca_real.csv (cobrança legítima)
   - triagem2_spam_golpe.csv (assédio)
   - triagem2_relatorio.md (sumário por credor)

   Tempo: ~50min usando gemma3:4b. Custo: R$0.

PRIORIDADE 3 — Documentos legais (Procon)
================================================================

4. Ler `DEFESA_SUPERENDIVIDAMENTO_TEMPLATES_RESPOSTA_2026-05-22` no Drive
   (já gerado por Claude Code Web). Tem:
   - Estratégia em 4 frentes
   - 4 templates de resposta (A1-A4)
   - Contatos Procon/Defensoria/Registrato
   - Próximas ações concretas

5. **Abrir processo Procon-RJ online** (procon.rj.gov.br):
   - Tipo: superendividamento (Lei 14.181/2021)
   - Listar TODOS os credores da MATRIZ EVIDENCIAS
   - Pedir audiência conciliatória global

6. **Emitir Registrato** (bcb.gov.br/cidadaniafinanceira/registrato):
   - SCR (todas as dívidas em bancos)
   - CCS (contas e relacionamentos)

PRIORIDADE 4 — BLITZ pacientes existentes
================================================================

7. Sistema HairTech já tem BLITZ agendado 9h. Verificar via Telegram se rodou
   ontem (21/05) e hoje (22/05). Se não rodou: ssh root@72.62.100.6 e
   investigar containers (assistente-virtual, whatsapp-ana).

REGRAS:
- Ollama local SEMPRE primeiro (R$0)
- API paga (Claude/GPT) apenas pra revisão final
- Notificar Telegram (8713631351) a cada fase completa
- Logar tudo em ~/Documents/Codex/log_22052026.txt
- Não duplicar arquivos no Mac (HD apertado)
- Nunca mexer ~/Library, /Applications, /System

REFERÊNCIAS NO DRIVE:
- DEFESA_SUPERENDIVIDAMENTO_TEMPLATES_RESPOSTA_2026-05-22 (estratégia + templates)
- MATRIZ EVIDENCIAS SUPERENDIVIDAMENTO 2026-05-22 (planilha credores)
- PLANILHA MESTRE SUPERENDIVIDAMENTO 2026-05-22 (timeline)
- LINHA DO TEMPO SUPERENDIVIDAMENTO 2026-05-22

Após cada item, atualizar `~/Documents/Codex/COORDINATION.md` com status.
