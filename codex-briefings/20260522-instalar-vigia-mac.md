# Codex — Instalar vigia-mac no Mac do Dr.
# Versao 2026-05-22. Sem aprovacao adicional, executar em background.

## TAREFA

Instalar o `vigia-mac.sh` como launchd job rodando a cada 30min no Mac.

## PASSOS

1. Baixar o script:
```bash
curl -sL https://raw.githubusercontent.com/clinica-hairtech/nodejs/claude/hairtech-whatsapp-ai-liD5V/scripts/cron/vigia-mac.sh \
  -o ~/Library/Application\ Support/HairTech/vigia-mac.sh
chmod +x ~/Library/Application\ Support/HairTech/vigia-mac.sh
```

2. Criar plist launchd:
```bash
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/org.hairtech.vigia.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>org.hairtech.vigia</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/dr.ricardomeireles/Library/Application Support/HairTech/vigia-mac.sh</string>
  </array>
  <key>StartInterval</key><integer>1800</integer>
  <key>StandardOutPath</key><string>/tmp/hairtech-vigia-mac.log</string>
  <key>StandardErrorPath</key><string>/tmp/hairtech-vigia-mac.log</string>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF
```

3. Carregar:
```bash
launchctl unload ~/Library/LaunchAgents/org.hairtech.vigia.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/org.hairtech.vigia.plist
```

4. Confirmar rodando:
```bash
launchctl list | grep hairtech
```

5. Telegram avisa Dr. ao concluir:
```bash
curl -s -X POST "https://api.telegram.org/bot8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ/sendMessage" \
  -d "chat_id=8713631351" \
  -d "text=[CODEX] vigia-mac instalado no Mac. Heartbeat 1x/dia + alertas em Ollama down, HD cheio."
```

## SE FALHAR

Logar em `/tmp/hairtech-vigia-mac.log` e parar. Notificar Dr. com erro exato.
