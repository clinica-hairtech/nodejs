#!/bin/bash
# dump-inbox.sh — roda a cada 1h via cron na VPS
# Faz curl em /api/internal/inbox-pendentes, salva em data/inbox-pendentes.json,
# commita+pusha pra branch. Assim Claude/Codex/Manus (sem browser) auditam.
#
# Roda em hh:15 e hh:45 — fora dos slots do auto-apply (de 2/2min em hh:00/02/04...).

set -e
cd /home/user/nodejs 2>/dev/null || exit 0

TOKEN=$(grep "^INTERNAL_API_TOKEN=" /home/user/nodejs/.env 2>/dev/null | cut -d= -f2-)
[ -z "$TOKEN" ] && { echo "[dump-inbox] INTERNAL_API_TOKEN ausente"; exit 0; }

mkdir -p data

# Snapshot pendentes (com historico)
curl -s --max-time 10 \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/internal/inbox-pendentes?limite=100" \
  -o data/inbox-pendentes.json.new 2>/dev/null

# Snapshot compacto (todas)
curl -s --max-time 10 \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/internal/inbox-snapshot" \
  -o data/inbox-snapshot.json.new 2>/dev/null

# Validar JSON antes de mover
for f in data/inbox-pendentes.json data/inbox-snapshot.json; do
  if [ -s "${f}.new" ] && python3 -c "import json,sys; json.load(open('${f}.new'))" 2>/dev/null; then
    mv "${f}.new" "$f"
  else
    rm -f "${f}.new"
    echo "[dump-inbox] $f invalido, mantendo anterior"
  fi
done

# Commit + push se mudou
if git diff --quiet data/inbox-pendentes.json data/inbox-snapshot.json 2>/dev/null; then
  echo "[dump-inbox] sem mudancas"
  exit 0
fi

git add data/inbox-pendentes.json data/inbox-snapshot.json 2>/dev/null
git -c user.email="bot@hairtech.org" -c user.name="HairTech VPS Bot" \
  commit -m "[bot] snapshot inbox AV $(date -Iseconds)" 2>/dev/null || true

# Push pra mesma branch que o cron auto-apply pulla
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git push origin "$BRANCH" 2>/dev/null || echo "[dump-inbox] push falhou (provavel race com auto-apply)"

echo "[dump-inbox] OK"
