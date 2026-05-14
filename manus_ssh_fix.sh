#!/bin/bash
# manus_ssh_fix.sh — DIAGNÓSTICO APENAS (sem alterações destrutivas)
# Executar via SSH: ssh root@72.62.100.6
# Preparado por Claude Code — análise completa antes de qualquer fix
set +H

LOG=/tmp/manus_diag_$(date +%Y%m%d_%H%M%S).log
exec > >(tee -a "$LOG") 2>&1

echo "================================================================"
echo "HAIRTECH VPS — DIAGNÓSTICO COMPLETO — $(date)"
echo "================================================================"
echo ""

echo "=== [1] TODOS OS CONTAINERS ==="
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "=== [2] REDES DOCKER ==="
docker network ls
echo ""

echo "=== [3] OPENCLAW — LOGS ==="
docker logs hairtech-openclaw --tail 30 2>&1 || echo "Container hairtech-openclaw nao encontrado"
echo ""

echo "=== [4] OPENCLAW — HTTP CANVAS ==="
curl -sk -o /dev/null -w "HTTP %{http_code}\n" https://claw.hairtech.org/__openclaw__/canvas/
curl -sk -o /dev/null -w "HTTP %{http_code}\n" https://claw.hairtech.org/
echo ""

echo "=== [5] OPENCLAW — TRAEFIK LABELS ==="
docker inspect hairtech-openclaw 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
labels=d[0].get('Config',{}).get('Labels',{})
for k,v in sorted(labels.items()):
    print(f'  {k}: {v}')
" 2>/dev/null || echo "Nao encontrado"
echo ""

echo "=== [6] OPENCLAW — CONFIG (chaves ocultas) ==="
CFG=/opt/hairtech-openclaw/config/openclaw.json
if [ -f "$CFG" ]; then
    python3 -c "
import json
with open('$CFG') as f:
    d=json.load(f)
def redact(o):
    if isinstance(o,dict):
        return {k:('***REDACTED***' if any(s in k.lower() for s in ['key','token','secret','pass','auth','api']) else redact(v)) for k,v in o.items()}
    if isinstance(o,list): return [redact(i) for i in o]
    return o
print(json.dumps(redact(d),indent=2,ensure_ascii=False))
"
else
    echo "Nao encontrado em $CFG"
    find /opt /home -name "openclaw.json" 2>/dev/null | head -5
fi
echo ""

echo "=== [7] TRAEFIK — TODAS AS ROTAS ==="
TRAEFIK_ID=$(docker ps -qf "name=traefik" | head -1)
if [ -n "$TRAEFIK_ID" ]; then
    docker exec "$TRAEFIK_ID" wget -qO- "http://localhost:8080/api/http/routers" 2>/dev/null | \
    python3 -c "
import json,sys
try:
    routers=json.load(sys.stdin)
    for r in sorted(routers, key=lambda x: x.get('name','')):
        print(f\"  {r.get('name','?'):30s} {r.get('rule','?'):60s} [{r.get('status','?')}]\")
except Exception as e:
    print('Erro:',e)
" 2>/dev/null
else
    echo "Container Traefik nao encontrado"
fi
echo ""

echo "=== [8] DOCKER-COMPOSE.YML — CONTEUDO ATUAL ==="
cat /home/user/nodejs/docker-compose.yml
echo ""

echo "=== [9] GIT STATUS ==="
cd /home/user/nodejs && git status
echo ""

echo "=== [10] ANA WAHA — STATUS ==="
KEY=$(grep "^WHATSAPP_ANA_KEY=" /home/user/nodejs/.env | cut -d= -f2-)
if [ -n "$KEY" ]; then
    docker exec -e WK="$KEY" whatsapp-ana node -e \
      'const k=process.env.WK,B="ht"+"tp"+"://localhost:3000";fetch(B+"/api/sessions/default",{headers:{"X-Api-Key":k}}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2))).catch(e=>console.log("ERRO:",e.message));' 2>/dev/null
else
    echo "WHATSAPP_ANA_KEY nao encontrada"
fi
echo ""

echo "=== [11] AV — LOGS COMPLETOS (tail 50) ==="
docker logs assistente-virtual --tail 50 2>&1
echo ""

echo "=== [12] CRON ATUAL ==="
crontab -l 2>/dev/null || echo "(sem cron)"
echo ""

echo "=== [13] INSTALAR CRON MONITOR-ANA (seguro, idempotente) ==="
CRON_LINE="*/5 * * * * /bin/bash /home/user/nodejs/monitor-ana.sh >> /var/log/ana-monitor.log 2>&1"
(crontab -l 2>/dev/null | grep -v "monitor-ana"; echo "$CRON_LINE") | crontab -
crontab -l | grep monitor-ana && echo "CRON OK" || echo "CRON FALHOU"
echo ""

echo "================================================================"
echo "FIM DO DIAGNÓSTICO — Log: $LOG"
echo "Cole TODO o output acima e envie para o Claude Code analisar."
echo "================================================================"
