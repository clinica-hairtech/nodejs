#!/bin/bash
# install-tailscale.sh
# Pendencia 12.4 do Mestre v6.0 — mitiga CVE-2026-25253
# (RCE 1-click via WebSocket hijacking no OpenClaw porta 18789).
#
# Cria mesh privada Tailscale entre VPS e devices do Dr. Ricardo.
# Depois disso, fechar a porta 18789 publica e permitir SO via 100.0.0.0/8.
#
# Uso:
#   bash /home/user/nodejs/install-tailscale.sh

set -e
set +H

echo "================================================"
echo " Instalando Tailscale no VPS HairTech"
echo " Pendencia 12.4 do Mestre v6.0"
echo "================================================"
echo ""

if command -v tailscale &>/dev/null; then
  echo "Tailscale ja instalado:"
  tailscale --version
  echo ""
  echo "Status atual:"
  tailscale status 2>&1 || echo "(nao logado)"
  echo ""
  echo "Para re-autenticar manualmente: tailscale up --reset"
  echo "Saindo sem alterar."
  exit 0
fi

echo "[1/3] Instalando Tailscale (via script oficial)..."
curl -fsSL https://tailscale.com/install.sh | sh
echo ""

echo "[2/3] Habilitando servico..."
systemctl enable --now tailscaled
echo ""

echo "[3/3] Autenticando..."
echo ""
echo "⚠️  Atencao Dr. Ricardo:"
echo "O comando abaixo vai imprimir uma URL."
echo "Abre essa URL no celular ou no PC,"
echo "loga com a conta do Tailscale (criar se nao tem)"
echo "e autoriza este VPS na sua rede privada."
echo ""
read -p "Pressione ENTER quando estiver pronto pra ver a URL..."
tailscale up

echo ""
echo "================================================"
echo " Tailscale instalado e autenticado"
echo "================================================"
echo ""
echo "IP Tailscale deste VPS:"
tailscale ip -4 || echo "(execute 'tailscale up' se nao apareceu)"
echo ""
echo "Status:"
tailscale status
echo ""
echo "================================================"
echo " Proximos passos manuais (Dr. Ricardo):"
echo "================================================"
echo ""
echo " 1. Instalar Tailscale no celular:"
echo "    iOS:     App Store -> 'Tailscale'"
echo "    Android: Play Store -> 'Tailscale'"
echo ""
echo " 2. Instalar no Windows:"
echo "    https://tailscale.com/download/windows"
echo ""
echo " 3. Login em todos os devices com a MESMA conta usada aqui."
echo ""
echo " 4. Confirmar que aparecem em 'tailscale status' aqui no VPS."
echo ""
echo " 5. Fechar a porta 18789 publica e permitir so via Tailscale:"
echo "    ufw allow from 100.0.0.0/8 to any port 18789 proto tcp"
echo "    ufw deny 18789/tcp"
echo "    ufw reload"
echo ""
echo " 6. Testar acesso ao OpenClaw via IP Tailscale do VPS"
echo "    (nao mais via 72.62.100.6:18789)."
echo ""
