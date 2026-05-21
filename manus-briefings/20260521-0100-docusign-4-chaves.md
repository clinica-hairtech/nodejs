TAREFA: gerar as 4 chaves DocuSign faltantes
OBJETIVO: HairTech AV poder enviar contratos via DocuSign sem Dr. tocar painel

PRE-REQUISITOS:
- Senha Google do Dr. salva no Drive: pasta MEMORIA_CENTRAL/CREDENCIAIS/CREDENCIAIS_GOOGLE_DR_RICARDO_2026.md
- Email: rmeireles87@gmail.com
- 2FA provavel - se travar, mandar Telegram ao Dr. (chat_id 8713631351) pedindo aprovacao

COMANDOS / FLUXO (execute na ordem):

1) Abrir https://admin.docusign.com
2) Clicar "Sign in with Google"
3) Logar com rmeireles87@gmail.com + senha do Drive
4) Se 2FA aparecer: avisar Dr. via Telegram bot
   curl -s -X POST "https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage" \
     -d "chat_id=8713631351" \
     -d "text=Manus precisa que voce aprove 2FA do Google no celular agora pra continuar geracao das chaves DocuSign."

5) Apos logado, gerar as 4 chaves:

   CHAVE 1 - DOCUSIGN_INTEGRATION_KEY:
   - Menu: Integrations > Apps and Keys
   - Botao: ADD APP / INTEGRATION KEY
   - Nome do app: HairTech-WhatsApp
   - Auth methods marcar: "Authorization Code Grant" + "JWT Grant"
   - Copiar o GUID que aparece

   CHAVE 2 - DOCUSIGN_RSA_PRIVATE_KEY (formato base64):
   - Mesma pagina do app criado, role ate "Service Integration"
   - Aba RSA Keypairs > Generate RSA Keypair
   - DocuSign mostra Private Key UMA UNICA VEZ - copia tudo incluindo
     -----BEGIN RSA PRIVATE KEY----- e -----END RSA PRIVATE KEY-----
   - Converter pra base64: echo "<conteudo>" | base64 -w 0

   CHAVE 3 - DOCUSIGN_HMAC_SECRET:
   - Menu: Integrations > Connect
   - ADD CONFIGURATION > Custom
   - URL: https://hairtech.org/webhooks/docusign
   - Marcar todos os eventos "Envelope": Sent, Delivered, Completed, Voided, Declined
   - Habilitar HMAC Security > Add Secret > copia

   CHAVE 4 - DOCUSIGN_TEMPLATE_ID_FUE:
   - Abrir https://app.docusign.com/templates
   - NEW > Create Template
   - Upload PDF: Drive ID 1dTG2bpIHUt49ZATw6uDhlit7M99Qp7qG (CONTRATO_FUE_MODELO_2026.txt)
   - Add Recipient: Paciente
   - Add Text Fields com labels:
     - nome_paciente
     - cpf_paciente
     - valor
     - data_cirurgia
     - unidade
   - Add Signature: Paciente
   - Save Template - copia Template ID da URL

6) GRAVAR no .env do VPS HairTech via SSH:
   ssh -i ~/.ssh/hairtech_vps_ed25519 root@72.62.100.6 << 'EOF'
   cat >> /home/user/nodejs/.env <<'EOK'
   # DocuSign chaves geradas por Manus em $(date -Iseconds)
   DOCUSIGN_INTEGRATION_KEY=<chave1>
   DOCUSIGN_RSA_PRIVATE_KEY_BASE64=<chave2>
   DOCUSIGN_HMAC_SECRET=<chave3>
   DOCUSIGN_TEMPLATE_ID_FUE=<chave4>
   EOK
   docker compose -f /home/user/nodejs/docker-compose.yml up -d --force-recreate assistente-virtual
   EOF

7) Avisar Telegram Dr. Ricardo:
   curl -s -X POST "https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage" \
     -d "chat_id=8713631351" \
     -d "text=DocuSign configurado! 4 chaves geradas e gravadas no .env do VPS. AV recriado. Pode enviar contratos via /admin/contratos."

RETORNAR PRA CLAUDE CODE WEB:
- Os 4 valores gerados (mascarar parcialmente nas ultimas 8 chars)
- Confirmacao de gravacao no .env
- Confirmacao de Telegram enviado
- Tempo total gasto
- Custo em creditos Manus

CASO FALHE:
- Se 2FA travar e Dr. nao aprovar em 5min, parar e relatar via Telegram
- Se DocuSign mudar layout, capturar screenshot e parar
- NUNCA tentar 2x consecutivas se primeira falha (lock anti-abuse)
