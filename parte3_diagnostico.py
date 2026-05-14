#!/usr/bin/env python3
"""
PARTE 3 - Diagnostico completo AV HairTech
Rodar no VPS: python3 /tmp/parte3.py 2>&1 | tee /tmp/parte3_out.txt
"""
import subprocess, json, time

def run(cmd, timeout=15):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return (r.stdout + r.stderr).strip()
    except Exception as e:
        return f"ERRO: {e}"

print("=" * 60)
print("TAREFA 1 - axios.post / graph.facebook no server.js")
print("=" * 60)
print(run("docker exec assistente-virtual grep -nB2 -A8 'graph.facebook.com' /app/server.js | head -50"))

print("\n" + "=" * 60)
print("TAREFA 2.1 - Rotas registradas no server.js")
print("=" * 60)
print(run("docker exec assistente-virtual grep -nE \"app\\.(get|post|use)\" /app/server.js | head -20"))

print("\n" + "=" * 60)
print("TAREFA 2.2 - Health check interno")
print("=" * 60)
print(run("docker exec assistente-virtual wget -qO- http://localhost:3001/health 2>&1"))

print("\n" + "=" * 60)
print("TAREFA 2.3 - Simular webhook Dr. Ricardo (GET verify)")
print("=" * 60)
print(run("docker exec assistente-virtual wget -qO- 'http://localhost:3001/webhook?hub.mode=subscribe&hub.verify_token=hairtech2024&hub.challenge=TESTE123' 2>&1"))

print("\n" + "=" * 60)
print("TAREFA 2.4 - Simular mensagem Dr. Ricardo via POST")
print("=" * 60)
payload = json.dumps({
    "object": "whatsapp_business_account",
    "entry": [{
        "id": "WABA_ID",
        "changes": [{
            "value": {
                "messaging_product": "whatsapp",
                "metadata": {"phone_number_id": "1480059533694084"},
                "messages": [{
                    "from": "5521982006372",
                    "id": "test_msg_001",
                    "timestamp": "1730000000",
                    "type": "text",
                    "text": {"body": "status"}
                }]
            },
            "field": "messages"
        }]
    }]
})
cmd_post = f"""docker exec assistente-virtual wget -qO- --post-data='{payload}' --header='Content-Type: application/json' http://localhost:3001/webhook 2>&1"""
print(run(cmd_post, timeout=20))

print("\nAguardando 3s para logs...")
time.sleep(3)

print("\n" + "=" * 60)
print("TAREFA 2.5 - Logs apos simulacao")
print("=" * 60)
print(run("docker logs assistente-virtual --tail 30 2>&1"))

print("\n" + "=" * 60)
print("TAREFA 3.1 - Porta externa do container")
print("=" * 60)
print(run("docker port assistente-virtual"))

print("\n" + "=" * 60)
print("TAREFA 3.2 - Traefik menciona assistente?")
print("=" * 60)
print(run("docker logs traefik --tail 100 2>&1 | grep -iE 'assistente|3001' | head -10"))

print("\n" + "=" * 60)
print("TAREFA 3.3 - Labels Traefik no container")
print("=" * 60)
print(run('docker inspect assistente-virtual --format "{{json .Config.Labels}}" 2>&1'))

print("\n" + "=" * 60)
print("TAREFA 3.4 - Teste URL externa")
print("=" * 60)
print(run("wget -qO- --server-response https://hairtech.org/webhook 2>&1 | head -20"))
print(run("wget -qO- --server-response http://72.62.100.6:3001/webhook 2>&1 | head -10"))

print("\n" + "=" * 60)
print("TAREFA 3.5 - Cloudflare tunnel?")
print("=" * 60)
print(run("ps aux | grep -i cloudflare | grep -v grep"))
print(run("docker ps | grep -iE 'cloudflare|tunnel'"))

print("\n" + "=" * 60)
print("TAREFA 3.6 - VERIFY_TOKEN no server.js")
print("=" * 60)
print(run("docker exec assistente-virtual grep -n 'VERIFY\|verify_token\|hub.verify' /app/server.js | head -10"))

print("\n" + "=" * 60)
print("FIM DO DIAGNOSTICO")
print("=" * 60)
print("Resultado salvo em /tmp/parte3_out.txt")
