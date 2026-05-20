TAREFA: validar AV apos fix restart-loop + flood Telegram parou
OBJETIVO: confirmar que o commit c204597 pousou e o sistema ta estavel

COMANDOS (rode em ordem na VPS, parem se falhar):

1) cd /home/user/nodejs && git log -3 --oneline

2) tail -30 /var/log/hairtech-autodeploy.log

3) docker inspect assistente-virtual --format '{{.State.Status}} restarts={{.RestartCount}}'

4) docker logs assistente-virtual --tail 20 2>&1 | tail -15

5) curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/health

6) ls /tmp/hairtech-alert-cooldown/ 2>/dev/null | wc -l

7) tail -5 /var/log/hairtech-healthcheck.log

RETORNAR PRA MIM:
- linha 1: ultimo SHA visivel deve ser c204597 ou mais novo
- linha 2: deve mostrar "[T30] healthcheck atualizado" se v2 ja aplicou
- linha 3: ESPERADO "running restarts=<10" (se em loop, restarts >50)
- linha 4: app.js deve ter mensagem "AV principal" ou similar sem stack trace
- linha 5: ESPERADO 200
- linha 6: numero de arquivos cooldown (esperado >0, prova que v2 ta ativo)
- linha 7: ultimo healthcheck deve ser "OK" ou alerta cooldown suprimido

SE algum item falhar, NAO tente arrumar - so colar o output e deixar Claude Code Web decidir.
