#!/bin/bash
# install-claude-on-vps.sh
# Instala Claude Code no VPS para Ricardo conversar direto sem ponte
# Rodar uma vez: bash install-claude-on-vps.sh

set -e
set +H

echo "================================================"
echo " Instalando Claude Code no VPS HairTech"
echo "================================================"

# 1) Verificar Node.js
if ! command -v node &> /dev/null; then
  echo "[1/4] Node.js não encontrado — instalando..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  NODE_V=$(node -v)
  echo "[1/4] Node.js já instalado: $NODE_V"
fi

# 2) Instalar Claude Code globalmente
echo "[2/4] Instalando @anthropic-ai/claude-code via npm..."
npm install -g @anthropic-ai/claude-code

# 3) Verificar instalação
echo "[3/4] Verificando..."
which claude && claude --version

# 4) Criar atalho no diretório do projeto
echo "[4/4] Criando atalho..."
cat > /usr/local/bin/clinica << 'EOF'
#!/bin/bash
cd /home/user/nodejs && claude "$@"
EOF
chmod +x /usr/local/bin/clinica

echo ""
echo "================================================"
echo " Instalação concluída"
echo "================================================"
echo ""
echo " Como usar:"
echo ""
echo " 1) Faça login (primeira vez):"
echo "    claude  ← roda interativamente, vai pedir login"
echo "    (ou use API key: export ANTHROPIC_API_KEY=sk-ant-...)"
echo ""
echo " 2) Para conversar com Claude já no projeto:"
echo "    clinica"
echo ""
echo " 3) Pronto. O Claude vai ter acesso direto a:"
echo "    - docker (ANA, AV, OpenClaw, Postgres)"
echo "    - /home/user/nodejs (código completo)"
echo "    - .env (variáveis)"
echo "    - logs em tempo real"
echo "    - poder executar comandos sem ponte"
echo ""
echo " O Claude rodando aqui vai conseguir consertar"
echo " ANA, validar OpenClaw, etc, sem você precisar"
echo " copiar/colar comandos."
echo ""
