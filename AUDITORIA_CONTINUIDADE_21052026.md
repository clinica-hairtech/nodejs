# Auditoria continuidade — 21/05/2026

Auditoria do que aconteceu enquanto esta sessão Claude (Code Web) ficou ausente.

## Quem trabalhou
- **Codex** (CLI da OpenAI rodando no Mac do Dr.) — entre 19 e 21/05
- **Manus** (na VPS) — entre 19 e 20/05
- **Ricardo** (manualmente)

## Artefatos novos no Drive

| Arquivo | Data | Conteúdo |
|---|---|---|
| `ARQUIVO_MESTRE_HAIRTECH_v4.2_19-05-2026` | 19/05 | Estado real verificado pelo Codex (consolidado) |
| `VERIFICACAO_REALIDADE_19052026.md` | 19/05 | Corrige memória v7.0 (Manus) |
| `INTEGRACAO_OPENCLAW_OLLAMA_19052026.md` | 19/05 | Manus tentou integrar Ollama no OpenClaw — schema rejeitou, rollback feito em 6s |
| `SMOKE_TEST_OLLAMA_19052026.md` | 19/05 | Confirma Ollama UP na VPS |
| `PATCH_v7.1_IA_LOCAL_INSTALADA_20260520.md` | 20/05 | Codex instalou Ollama+Gemma3:4b no Mac do Dr. |
| `BRIEFING_OPERACIONAL_HAIRTECH_CHATGPT_CODEX_CLAUDE_2026-05-20` | 21/05 | Briefing pra mim (esta sessão) continuar |

## Estado real corrigido (substitui memória anterior)

| Item | Real |
|---|---|
| VPS | KVM 4 (não KVM 2) — 4 vCPU, 16 GB RAM, 200 GB NVMe |
| Validade VPS | 17/06/2026 — auto-renew ativo (não 22/05) |
| Repo VPS | `/home/user/nodejs` (não `/home/user/clinica-hairtech/nodejs`) |
| Branch ativa | `claude/init-whatsapp-waha-session-cOeSf` apontando pro mesmo commit `37b5cd0` que `liD5V` |
| AV | UP (`status:ok`, 3 conversas no banco) |
| ANA WAHA | Sessão `default` em WORKING, engine CONNECTED |
| Ollama | Container Docker na VPS (não systemd). Modelos: qwen2.5:3b (1.9G), llama3.1:8b (4.9G), qwen2.5:14b (9G) |
| Mac do Dr. | Ollama.app + gemma3:4b instalado (3.2GB) |
| Tabela `conversas` | Coluna temporal é `criado_em` (NÃO `created_at`) |

## Valores oficiais (corrigem o que eu estava usando)

| Modalidade | Valor real |
|---|---|
| Consulta Rio Bonito / Online | R$ 350 (cond. especial R$ 300) |
| Consulta Niterói / Barra | R$ 400 (cond. especial R$ 350) |
| Sinal | R$ 150 via Pix CNPJ 49.634.881/0001-91 |
| FUE padrão | R$ 10.000 cartão 12x |
| FUE à vista | R$ 9.500 |
| FUE sem rosto | R$ 9.300 à vista |
| **Paciente Modelo** | **R$ 8.500 à vista (metade antes/metade dia) OU R$ 9.000 em 12x sem juros** |
| Mínimo absoluto | R$ 8.500 |
| MMP/Meso avulso | R$ 400-600 por sessão |

⚠️ **R$ 8.000 NÃO É MAIS VÁLIDO.** Foi corrigido neste commit em `data/blitz-mensagens.json`, `systemPrompt.js`, `admin.js` (apresentação).

## Sobre "OpenClaw no MacBook Neo"

Ricardo disse que "OpenClaw foi instalado no MacBook Neo". **Investigação confirma confusão de nomes:**

- Codex/Ricardo instalaram **Ollama** no Mac, NÃO OpenClaw
- `find ~/.openclaw` retornou vazio no Mac do Dr.
- Apenas `/Applications/Ollama.app` está presente + modelo `gemma3:4b`
- "Neo" provavelmente é nome dado ao Mac OU outro agente (não confirmado)

## Sobre integração Claude ↔ ChatGPT

Codex confirmou via Chrome do Dr.: **ChatGPT foi aberto pelo Codex via Chrome** pra revisar memória. Não é "agentes conversando entre si" — Codex que abriu navegador e fez interação manual. Codex tem essa capacidade (computer use); eu (Code Web) não tenho.

Eu construí `/admin/dual-ai` (Claude + ChatGPT em paralelo via API) que serve pra decisões críticas sem precisar de browser. Continua a melhor opção.

## Tarefas que o Codex pediu pra mim (Claude) executar

Por ordem de prioridade do briefing:

1. ✅ Comparar memória com briefing (este arquivo)
2. ⏳ **Contrato Paciente Modelo** — Codex já criou DOCX base no Mac (`contratos_prontos/contrato_paciente_modelo_transplante_capilar.docx`), preciso ajudar a preencher dados + revisar CFM/LGPD
3. ⏳ **Termo de reembolso/quitação** — Codex já criou DOCX base
4. ⏳ **Resgate de pacientes da AV** — eu construí `/admin/blitz` que faz exatamente isso
5. ⏳ **Pré-consulta inteligente** (formulário + fotos + resumo IA) — pendente
6. ⏳ **Decisão Google Workspace** — recomendação Codex: cancelar (usar Hostinger email + Google AI Studio)

## Arquitetura IA decidida (validada por benchmark do Codex)

```
Tarefas baratas / triagem / classificação → Ollama local (qwen2.5:3b, 5.86s OK)
Resposta principal ao paciente / casos complexos → Gemini/OpenAI
Fallback se Ollama atrasa → API paga
```

**Decisão Codex 19/05**: manter IA local, NÃO desligar. Manter Gemini/OpenAI como cérebro principal.

## Próximas ações concretas (prioridade Codex)

1. **HOJE**: rodar BLITZ pra captar 2 pacientes (botões já prontos em `/admin/blitz`)
2. **HOJE**: importar contatos do WhatsApp pessoal do Dr. via `/admin/importar`
3. **AMANHÃ**: preencher contratos DOCX com dados do paciente que fechar
4. **PRÓXIMOS 7 DIAS**: configurar ferramenta de assinatura (DocuSign já tem 3 IDs / D4Sign possível / ZapSign possível — Dr. precisa confirmar)
5. **PRÓXIMA SEMANA**: implementar pré-consulta com fotos + resumo IA

## Branch — não há conflito

ARQUIVO_MESTRE_v4.2 confirma:
> Branch local atual: `claude/init-whatsapp-waha-session-cOeSf`
> Branch remoto antigo citado em memoria: `origin/claude/hairtech-whatsapp-ai-liD5V`
> Ambos apontam para o mesmo commit: `37b5cd037edb8515168f835b93d9eff9bab74538`

**Não existe conflito real de branch.** Meus commits a partir de `37b5cd0` foram empurrados pra `liD5V`. Se cron tá puxando `liD5V`, os 32+ commits desta sessão estão aplicados. Se mudou pra `init-waha-session-cOeSf`, os commits ficaram órfãos.

Manus tá com auto-deploy ativo na VPS — provável que ainda esteja em `liD5V`. Conferir via `crontab -l` na VPS.
