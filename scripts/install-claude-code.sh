#!/bin/bash
# Instala Claude Code na VPS HairTech.
# Idempotente: se ja existe, atualiza. Se nao, instala.
# Roda como root (auto-apply.sh chama). Pode rodar manualmente tambem.

set +e
LOG=/var/log/hairtech-claudecode-install.log
exec >> "$LOG" 2>&1

TS=$(date -Iseconds)
echo ""
echo "============================================================"
echo "[$TS] install-claude-code.sh START"
echo "============================================================"

# 1) Verifica Node 20+
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
  [ -n "$NODE_VER" ] && [ "$NODE_VER" -ge 20 ] && NODE_OK=1
fi

if [ "$NODE_OK" = "0" ]; then
  echo "[install] Node 20+ ausente, instalando via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1
  NODE_VER=$(node -v 2>/dev/null)
  echo "[install] Node instalado: $NODE_VER"
fi

# 2) Instala/atualiza Claude Code via npm (caminho oficial)
if command -v claude >/dev/null 2>&1; then
  CUR=$(claude --version 2>&1 | head -1)
  echo "[install] Claude Code ja presente: $CUR — atualizando"
  npm update -g @anthropic-ai/claude-code >/dev/null 2>&1
else
  echo "[install] Claude Code ausente, instalando"
  npm install -g @anthropic-ai/claude-code >/dev/null 2>&1
fi

# 3) Confirma
if command -v claude >/dev/null 2>&1; then
  FINAL=$(claude --version 2>&1 | head -1)
  echo "[install] OK: $FINAL"
else
  # Fallback: tenta o instalador oficial do site
  echo "[install] npm falhou, tentando instalador oficial"
  curl -fsSL https://claude.ai/install.sh | bash >/dev/null 2>&1
  command -v claude >/dev/null 2>&1 && echo "[install] OK via install.sh: $(claude --version 2>&1 | head -1)" || echo "[install] FALHOU - rodar manual: npm i -g @anthropic-ai/claude-code"
fi

# 4) Cria marker pra auto-apply.sh saber que rodou
touch /opt/.claude-code-installed
chmod 644 /opt/.claude-code-installed

# 5) Telegram avisa
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ}"
TG_CHAT="${TELEGRAM_CHAT_ID:-8713631351}"
LOGIN_CRED=$([ -f /root/.claude/credentials.json ] && echo "OK (ja logado)" || echo "PENDENTE")
MSG="HairTech: Claude Code instalado na VPS. Versao: $(claude --version 2>/dev/null | head -1). Login Anthropic: $LOGIN_CRED. Se PENDENTE, rode: ssh root@72.62.100.6 -t 'claude login'"
curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TG_CHAT}" \
  --data-urlencode "text=${MSG}" > /dev/null 2>&1

echo "[$TS] install-claude-code.sh END"
