#!/bin/bash
# deploy-openclaw-integracao.sh
# Aplica a integracao AV <-> OpenClaw num unico passo.
# Rodar no VPS como root.
# Pre-requisitos: o branch ja foi puxado para /home/user/nodejs (git pull).

set -e
set +H

echo "================================================================"
echo " Deploy: integracao AV <-> OpenClaw orquestrador"
echo " Data: $(date -Iseconds)"
echo "================================================================"

BACKUP_DIR="/root/backups_av/openclaw-integ-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo ""
echo "[1/8] Backup em $BACKUP_DIR"
cp /home/user/nodejs/.env "$BACKUP_DIR/av.env.bak" 2>/dev/null || true
cp /opt/hairtech-openclaw/config/openclaw.json "$BACKUP_DIR/openclaw.json.bak" 2>/dev/null || true
cp /opt/hairtech-openclaw/.env "$BACKUP_DIR/openclaw.env.bak" 2>/dev/null || true
echo "    OK"

echo ""
echo "[2/8] Gerar INTERNAL_API_TOKEN se nao existir"
if grep -q "^INTERNAL_API_TOKEN=" /home/user/nodejs/.env 2>/dev/null; then
  INTERNAL_TOKEN=$(grep "^INTERNAL_API_TOKEN=" /home/user/nodejs/.env | cut -d= -f2-)
  echo "    Ja existe no .env do AV"
else
  INTERNAL_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)
  echo "" >> /home/user/nodejs/.env
  echo "# Token para OpenClaw consumir /api/internal" >> /home/user/nodejs/.env
  echo "INTERNAL_API_TOKEN=$INTERNAL_TOKEN" >> /home/user/nodejs/.env
  echo "    Gerado e adicionado"
fi

echo ""
echo "[3/8] Adicionar INTERNAL_API_TOKEN no .env do OpenClaw"
if grep -q "^INTERNAL_API_TOKEN=" /opt/hairtech-openclaw/.env 2>/dev/null; then
  echo "    Ja existe"
else
  echo "INTERNAL_API_TOKEN=$INTERNAL_TOKEN" >> /opt/hairtech-openclaw/.env
  echo "    Adicionado"
fi

echo ""
echo "[4/8] Criar workspace do agente HairTech no OpenClaw"
mkdir -p /opt/hairtech-openclaw/workspace/agents/hairtech-orquestrador
cp /home/user/nodejs/docs/openclaw-soul-hairtech.md \
   /opt/hairtech-openclaw/workspace/agents/hairtech-orquestrador/SOUL.md
echo "    SOUL.md instalado em /opt/hairtech-openclaw/workspace/agents/hairtech-orquestrador/"

echo ""
echo "[5/8] Mesclar agente no openclaw.json"
python3 << 'PYEOF'
import json, os

cfg_path = "/opt/hairtech-openclaw/config/openclaw.json"
snip_path = "/home/user/nodejs/docs/openclaw-agent-snippet.json"

with open(cfg_path, "r") as f:
    cfg = json.load(f)

with open(snip_path, "r") as f:
    snip = json.load(f)
    snip.pop("_comentario", None)

cfg.setdefault("agents", {})
for k, v in snip.get("agents", {}).items():
    cfg["agents"][k] = v
    print(f"    agente '{k}' mesclado")

with open(cfg_path, "w") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)

print("    openclaw.json salvo")
PYEOF

echo ""
echo "[6/8] Restart assistente-virtual (para carregar /api/internal)"
docker restart assistente-virtual >/dev/null
sleep 8
echo "    OK"

echo ""
echo "[7/8] Reload openclaw (hot reload via SIGHUP, se suportado)"
docker kill -s HUP hairtech-openclaw 2>/dev/null && echo "    SIGHUP enviado" || {
  echo "    SIGHUP nao funcionou, fazendo restart"
  docker restart hairtech-openclaw >/dev/null
  sleep 5
}

echo ""
echo "[8/8] Testes basicos"
echo "    GET /api/internal/ping (interno)..."
docker exec hairtech-openclaw sh -c \
  "wget -qO- --header='Authorization: Bearer $INTERNAL_TOKEN' http://assistente-virtual:3001/api/internal/ping" \
  2>/dev/null && echo "" || echo "    FALHA (verificar logs)"

echo ""
echo "    GET /api/internal/metricas..."
docker exec hairtech-openclaw sh -c \
  "wget -qO- --header='Authorization: Bearer $INTERNAL_TOKEN' http://assistente-virtual:3001/api/internal/metricas" \
  2>/dev/null && echo "" || echo "    FALHA"

echo ""
echo "================================================================"
echo " Deploy concluido"
echo "================================================================"
echo ""
echo " O que foi instalado:"
echo " - Rotas /api/internal no AV (api-internal.js)"
echo " - Token compartilhado AV <-> OpenClaw"
echo " - Agente 'hairtech-orquestrador' no OpenClaw"
echo " - SOUL.md com regras de operacao"
echo " - Cron interno: relatorio 9h/13h/18h + alerta de leads frios 11h30"
echo ""
echo " Como verificar via UI do OpenClaw:"
echo " - Acesse https://claw.hairtech.org"
echo " - Entre na conversa do agente 'hairtech-orquestrador'"
echo " - Mande: 'rode metricas agora'"
echo " - Ele deve chamar GET /api/internal/metricas e mostrar o resultado"
echo ""
echo " Backup deste deploy: $BACKUP_DIR"
echo ""
