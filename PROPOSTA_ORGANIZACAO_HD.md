# PROPOSTA — Organização do HD do Mac (Dr. aprovar antes do Codex executar)

> Pedido Dr. 22/05: "os arquivos que pedi pra reorganizar de forma mais humana e baseado na forma como eu estava fazendo, mas mais estruturado. Liberar memória do que for duplicado. Catalogue tudo no HD pra fácil acesso. Quero ver como vai ser organizado pra aprovar."

## Princípio

**Estrutura HUMANA, não técnica.** Pastas em português claro, hierarquia rasa (no máximo 2 níveis), nomes que você usaria conversando com paciente. Códigos como `01-` no prefixo só pra forçar ordem de exibição no Finder.

## Estrutura proposta — `~/Documentos/HairTech/`

```
~/Documentos/HairTech/
│
├── 01-PACIENTES/                          # tudo de paciente individual
│   ├── ATIVOS/                             # com atendimento últimos 12 meses
│   │   ├── Nome Sobrenome/                 # 1 pasta por paciente
│   │   │   ├── Fotos/                      # cabelo antes/durante/depois
│   │   │   ├── Contratos-Assinados/        # PDFs assinados ZapSign/DocuSign
│   │   │   ├── Prontuário/                 # anamnese, evoluções, laudos
│   │   │   ├── Comprovantes-Pagamento/     # Pix, TED
│   │   │   ├── Conversas-Print/            # screenshots WhatsApp se houver
│   │   │   └── Outros/                     # exames, receitas externas
│   │   └── ...
│   ├── INATIVOS/                           # >12 meses sem atendimento (mesmo padrão)
│   └── ARQUIVO/                            # encerrados (alta, óbito, abandono)
│
├── 02-CLÍNICA/                            # gestão da empresa, não paciente
│   ├── Notas-Fiscais-Emitidas/            # NFs que VOCÊ emitiu
│   ├── Notas-Fiscais-Recebidas/           # NFs de fornecedor
│   ├── Contratos-Fornecedores/            # Ecologica, Health, RAT, locação Lívia, etc
│   ├── Alvarás-e-Licenças/                # Vigilância Sanitária, CRM, ANVISA, etc
│   ├── Boletos-e-Cobranças/               # boletos a pagar (anti-superendividamento)
│   ├── Comprovantes-Pagamento-Empresa/    # contas da clínica pagas
│   ├── Folha-Pagamento/                   # se tiver funcionários
│   └── Impostos-DARF-GPS/
│
├── 03-PROCEDIMENTOS-PROTOCOLOS/           # modelos genéricos da clínica
│   ├── Modelos-Contrato/                  # contrato Paciente Modelo, FUE comum, MMP
│   ├── TCLE-Termos-Consentimento/         # TCLE FUE, TCLE MMP, anestesia
│   ├── Anamnese-Formulários/              # formulários pré-consulta
│   ├── Guias-Pós-Operatório/              # cuidados pós-FUE, pós-MMP
│   ├── Protocolos-MMP-FUE/                # protocolos médicos internos
│   └── Receitas-Templates/                # receitas padrão (Finasterida, Minoxidil, etc)
│
├── 04-MARKETING/                          # redes, sites, conteúdo
│   ├── Fotos-Antes-Depois-Liberadas/      # paciente autorizou divulgação
│   ├── Vídeos/                            # depoimentos, procedimentos
│   ├── Posts-Prontos/                     # texto + arte pra Instagram/TikTok
│   ├── Logo-Marca/                        # arquivos da identidade visual
│   ├── Design-Materiais/                  # cartão visita, flyers, banners
│   └── Campanhas/                         # arquivos das campanhas Meta/Google Ads
│
├── 05-EDUCAÇÃO-MÉDICA/                    # você como médico, não a clínica
│   ├── Cursos-Feitos/                     # certificados, materiais didáticos
│   ├── Artigos-PubMed/                    # papers que você guarda
│   ├── Apresentações/                     # palestras suas
│   ├── Certificados/                      # CRM, ABRC, sociedades médicas
│   └── Eventos-Congressos/                # inscrições, fotos eventos
│
├── 06-FINANCEIRO-PESSOAL/                 # você como pessoa física
│   ├── Comprovantes-Renda/                # holerites, DRE
│   ├── IR-Declarações/                    # IRPF anos anteriores
│   ├── Bancos-Extratos/                   # extratos PJ e PF
│   ├── Cartões-Faturas/                   # faturas mensais
│   ├── Investimentos/                     # XP, BB, corretoras
│   └── Dívidas-e-Negociações/             # tudo de cobrança/Procon/superendividamento
│
├── 07-SISTEMA-HAIRTECH/                   # arquivos do sistema AV/ANA/OpenClaw
│   ├── Backups-Banco/                     # dumps Postgres
│   ├── Credenciais/                       # senhas/tokens (cifradas via keepass se possível)
│   ├── Memória-Central/                   # ARQUIVO_MESTRE, MEMORIAs, PATCHes
│   ├── Briefings-Codex-Claude/            # briefings enviados pras IAs
│   └── Documentação-Técnica/              # arquitetura, RIPD, LGPD
│
├── 08-JURÍDICO/                           # tudo legal/contratos importantes
│   ├── Superendividamento-2026/           # TUDO dessa crise (matriz, peças Procon)
│   ├── Processos-Contra/                  # se houver
│   ├── Processos-A-Favor/                 # se houver
│   ├── Pareceres-Advogados/
│   └── LGPD-Compliance/
│
├── 09-FOTOS-PESSOAIS/                     # família, viagens, NÃO da clínica
│   ├── Família/
│   ├── Viagens/
│   └── Outros/
│
└── 99-A-REVISAR/                          # Ollama não conseguiu classificar com certeza
                                            # Você revisa manualmente em ~30 min/semana
```

## Como Codex vai mover os arquivos

1. **Inventário READ-ONLY primeiro** — soma tamanhos, identifica duplicatas por shasum, NÃO mexe em nada ainda
2. **Manda pro Telegram resumo PRÉ-AÇÃO**: "encontrei X grupos de duplicatas, Y GB recuperáveis, Z arquivos pra mover. Aprova?"
3. **Espera SIM no Telegram** (timeout 30min, senão para)
4. Cria a estrutura acima
5. **`mv` (não `cp`)** com verificação de shasum origem == destino antes de considerar OK
6. Pra duplicatas:
   - Critério "qual fica como original": prefere arquivo já dentro de `~/Documentos/HairTech/` > arquivo mais recente > arquivo com nome mais descritivo
   - Outros vão pra `~/.Trash/` (recuperável)
7. **Nunca toca** `~/Library/`, `/Applications/`, `/System/`
8. iCloud Drive: confirma com você antes (pode quebrar sync)
9. Arquivos >100MB: pergunta individualmente
10. Log completo em `~/HairTech_org_log.txt` com cada `OK:`, `DEL:`, `FAIL:` registrado

## Classificação Ollama local pra `99-A-REVISAR`

Pra arquivos que o regex não conseguir classificar com confiança, Codex pergunta pro `gemma3:4b` local (R$0, ~5s/arquivo):

```
"Classifique este arquivo da clínica HairTech em UMA categoria (01-09).
Nome: [nome do arquivo]
Tipo MIME: [tipo]
Snippet primeiros 500 chars: [conteúdo se for texto]

Categorias:
1 = PACIENTE
2 = CLÍNICA
3 = PROCEDIMENTO-MODELO
4 = MARKETING
5 = EDUCAÇÃO
6 = FINANCEIRO-PESSOAL
7 = SISTEMA
8 = JURÍDICO
9 = NÃO-CLASSIFICÁVEL"
```

## Catalogação após organizar

Codex gera dois arquivos de catálogo:

### 1. `~/Documentos/HairTech/_CATÁLOGO.md` (humano, pra você ler)
- Tabela resumo por pasta principal: quantos arquivos, tamanho total, exemplos
- Lista de pacientes ATIVOS com link clicável (Finder URL) pra cada pasta
- "Onde está cada coisa importante" (atalhos pra contratos modelo, receita padrão, etc)

### 2. `~/Documentos/HairTech/_INDEX.json` (máquina, pra IAs/scripts)
- Indexação completa: cada arquivo com path, tamanho, mtime, shasum, categoria atribuída
- Permite buscas rápidas via script futuro
- Tamanho típico: ~100KB pra ~10k arquivos

## Cuidados específicos (suas instruções históricas)

- ✅ `mv`, nunca `cp` — você reclamou disso na sessão Codex anterior (duplicou tudo)
- ✅ Verificação shasum origem==destino antes de considerar move OK
- ✅ Telegram avisa antes de deletar >100MB
- ✅ Confirma SIM no Telegram antes de massa-deletar duplicatas
- ✅ Para se >10 falhas seguidas (sinal de problema sistêmico)
- ✅ Não duplica de novo

## Tempo estimado total

- Inventário+detecção duplicatas: ~10min
- Aprovação sua via Telegram: até 30min
- Criação estrutura: <1min
- Move regex-based (contratos, NFs, certificados, etc): ~15min
- Classificação Ollama pro 99-A-REVISAR: ~5s/arquivo × 1000 arquivos = **~80min**
- Catalogação final: ~5min

**Total: ~2h trabalho em background. Você só dá SIM no Telegram quando solicitado.**

## ⚠️ DECISÕES QUE QUERO SUA APROVAÇÃO ANTES DE EXECUTAR

1. **Aprovar a estrutura acima** (9 categorias + A-REVISAR)?
   - [ ] SIM, executa como está
   - [ ] Quero mudar X: _________
   - [ ] NÃO

2. **iCloud Drive**: mexer ou ignorar?
   - [ ] Pode mexer (assumo que outro device sincroniza ou não me importo)
   - [ ] NÃO mexer no iCloud Drive (Codex só toca Documents/Desktop/Downloads locais)

3. **Pasta `~/Pictures` (fotos do iCloud Photos)**: tocar?
   - [ ] NÃO, deixar como está (recomendado — Apple sincroniza)
   - [ ] Mover só fotos com nome contendo "HairTech" / "paciente" pra `01-PACIENTES/`

4. **Critério de "paciente ATIVO vs INATIVO"**:
   - [ ] Último contato (mtime de arquivo) < 12 meses = ATIVO
   - [ ] Outro critério: _________

5. **Pasta "Conversas-Print" dentro de cada paciente**: criar mesmo?
   - [ ] SIM — você quer ter screenshot do WhatsApp guardado por paciente
   - [ ] NÃO — basta o registro no AV/ANA

**Você pode aprovar tudo com um simples "SIM" no chat, ou listar o que quer mudar.**

Assim que aprovar, eu atualizo o briefing do Codex e ele executa quando voltar 20:11h.
