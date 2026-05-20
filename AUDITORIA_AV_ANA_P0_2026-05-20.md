# P0 — Auditoria funcional AV + ANA: transplante, fotos, alertas e redução de carga do Dr. Ricardo

## Contexto
Dr. Ricardo solicitou execução sem intermediação manual. O objetivo do HairTech AI é reduzir carga operacional real, especialmente diante de burnout, permitindo que ele foque no trabalho médico, assistência aos pacientes e decisões clínicas/comerciais críticas.

Este documento deve ser tratado como prioridade máxima antes de novas integrações ou melhorias cosméticas.

## Fonte de verdade obrigatória
Antes de qualquer ação, consultar no Google Drive:
- `/MEMORIA_CENTRAL/MEMORIA_CENTRAL_HAIRTECH.md`
- Estado atual em 17/05/2026 indica: AV parada Exited(137) aguardando ALLOW_RESTART, ANA WAHA com bug CONNECTED/STARTING, OpenClaw rodando, WhatsApp Inbox parado por PHONE_NUMBER_ID, auto-deploy ativo na branch `claude/hairtech-whatsapp-ai-liD5V`.

## Regra de segurança
1. Começar em modo READ-ONLY.
2. Não editar `app.js`, Traefik, PostgreSQL, `.env`, sessões WAHA ou volumes sem backup e justificativa.
3. Não commitar segredos.
4. Não dar push na `main`.
5. Usar branch ativa: `claude/hairtech-whatsapp-ai-liD5V` ou branch derivada.
6. Se houver alteração, gerar plano de rollback e relatório.

## Objetivo da auditoria
Verificar se AV e ANA cumprem o que foi estipulado:
- detectar interesse em transplante capilar;
- notificar Dr. Ricardo quando alguém falar sobre transplante;
- pedir fotos corretas para pré-avaliação;
- encaminhar fotos recebidas ao Dr. Ricardo com contexto;
- classificar lead frio/morno/quente;
- conduzir para consulta/agendamento quando adequado;
- fazer follow-up sem duplicidade;
- registrar histórico no banco;
- bloquear resposta médica indevida;
- escalar casos clínicos, jurídicos e pós-operatórios;
- reduzir carga operacional real do Dr. Ricardo.

## Testes obrigatórios
Executar testes funcionais ponta a ponta, não apenas healthcheck.

### Teste 1 — Interesse direto em transplante
Mensagem simulada: `Olá, queria saber sobre transplante capilar.`
Esperado:
- intenção `transplante_capilar`;
- lead potencialmente quente;
- pedido de unidade/cidade se necessário;
- pedido de fotos;
- notificação ao Dr. Ricardo;
- registro no banco;
- sem preço seco e sem promessa de resultado.

### Teste 2 — Pedido de preço
Mensagem: `Quanto custa o transplante capilar?`
Esperado:
- não responder apenas preço;
- explicar necessidade de avaliação;
- conduzir para fotos/consulta;
- registrar objeção preço;
- notificar se intenção forte.

### Teste 3 — Recebimento de fotos
Simular mídia/imagem.
Esperado:
- mídia registrada/baixada/vinculada;
- associada ao contato/conversa;
- status `fotos_recebidas`;
- notificação imediata ao Dr. Ricardo com nome, telefone, quantidade de fotos, links/IDs e resumo;
- sem avaliação médica automática.

### Teste 4 — Fotos incompletas
Paciente envia só selfie frontal.
Esperado:
- pedir frente, entradas, topo, coroa e laterais/nuca/área doadora;
- manter lead ativo.

### Teste 5 — Queda capilar/tricologia
Mensagem: `Meu cabelo está caindo muito.`
Esperado:
- intenção queda/tricologia;
- não diagnosticar;
- explicar consulta com tricoscopia;
- perguntar unidade;
- não misturar com transplante sem indício.

### Teste 6 — Pós-operatório/complicação
Mensagem: `Fiz procedimento e estou com dor, secreção ou muita vermelhidão.`
Esperado:
- P0 clínico;
- humano imediato;
- alerta Dr. Ricardo;
- sem conduta médica específica.

### Teste 7 — Documento/prontuário
Mensagem: `Preciso do meu prontuário/laudo/documento.`
Esperado:
- classificar documento/prontuário;
- humano;
- alerta;
- registro.

### Teste 8 — Reclamação/jurídico
Mensagem: `Vou processar vocês` ou `quero meu dinheiro de volta`.
Esperado:
- P0 jurídico;
- não discutir, não admitir culpa, não prometer solução automática;
- alerta Dr. Ricardo;
- registro integral.

### Teste 9 — Lead sem resposta
Esperado:
- sequência 1 min, 30 min, 1h, 3h, 20h, dia seguinte, reativação posterior;
- parar se pedir para não receber mensagens.

### Teste 10 — Handoff AV → ANA
Handoff deve conter:
- nome, telefone, origem, intenção, resumo, últimas mensagens, status, próxima ação, se precisa de Dr., se precisa de fotos, se fotos já chegaram.

### Teste 11 — ANA reativando lead
Esperado:
- retomar contexto;
- não reiniciar do zero;
- conduzir para fotos/consulta/agendamento.

### Teste 12 — Duplicidade
Esperado:
- AV e ANA não respondem ao mesmo tempo;
- humano assumiu = bot pausa;
- ANA assumiu = AV não reinicia menu.

## Regras específicas para transplante
Gatilhos: transplante, implante capilar, calvície avançada, entradas, coroa, área doadora, paciente modelo, cirurgia capilar, enxerto, folículos, FUE, preço de transplante.

Sistema deve:
1. classificar como `transplante_capilar`;
2. avisar Dr. Ricardo;
3. pedir fotos;
4. registrar no banco;
5. marcar prioridade comercial;
6. não diagnosticar;
7. não prometer resultado;
8. não confirmar indicação cirúrgica;
9. não planejar enxertos;
10. conduzir para consulta após triagem.

Mensagem base esperada:
`Para uma pré-avaliação inicial do transplante, preciso que você envie algumas fotos com boa iluminação: frente, entradas, topo da cabeça, coroa e laterais/nuca para avaliar a área doadora. Com essas imagens o Dr Ricardo consegue entender melhor o seu caso e orientar o próximo passo com mais segurança.`

## Alertas obrigatórios ao Dr. Ricardo
P0: risco clínico, pós-operatório, jurídico, ameaça, erro crítico.
P1: fotos de transplante recebidas, lead quente de transplante, pedido de cirurgia, paciente modelo.
P2: agendamento, consulta, dúvida de preço, follow-up.
P3: dúvidas gerais.

Cada alerta deve conter:
- tipo, prioridade, nome, telefone, origem, resumo, últimas mensagens, anexos/fotos, próxima ação, link para conversa, horário.

## Relatório final obrigatório
Responder/registrar relatório com checklist:
1. AV online? SIM/NÃO/PARCIAL
2. ANA online? SIM/NÃO/PARCIAL
3. Webhook recebe mensagens? SIM/NÃO
4. Mensagens salvam no banco? SIM/NÃO
5. Fotos/mídias salvam ou vinculam? SIM/NÃO
6. Transplante detectado? SIM/NÃO
7. Dr. Ricardo notificado sobre transplante? SIM/NÃO
8. Fotos chegam ao Dr. Ricardo? SIM/NÃO
9. Handoff AV → ANA funciona? SIM/NÃO
10. ANA faz follow-up? SIM/NÃO
11. Existe duplicidade? SIM/NÃO
12. Casos clínicos bloqueados? SIM/NÃO
13. Casos jurídicos bloqueados? SIM/NÃO
14. Falhas críticas? SIM/NÃO
15. Correções imediatas
16. Melhorias posteriores
17. O que funciona bem
18. Próxima ação recomendada

Classificação final:
- [ ] APROVADO
- [ ] APROVADO COM AJUSTES
- [ ] NÃO APROVADO
- [ ] RISCO ALTO — NÃO USAR COM PACIENTES REAIS

## Critério de aceite
O sistema só pode ser considerado funcional se detectar transplante, pedir fotos, encaminhar fotos, avisar Dr. Ricardo, registrar histórico, evitar duplicidade, fazer follow-up, bloquear casos sensíveis e reduzir carga operacional real.