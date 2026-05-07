#!/usr/bin/env python3
"""
PARTE 5 - Diagnostico DB e codigo server.js
Rodar no VPS: python3 /tmp/parte5.py 2>&1 | tee /tmp/parte5_out.txt
"""
import subprocess

def run(cmd, timeout=15):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return (r.stdout + r.stderr).strip() or "(sem output)"
    except Exception as e:
        return f"ERRO: {e}"

print("=" * 60)
print("1.1 - Pool / conexao postgres no server.js")
print("=" * 60)
print(run("docker exec assistente-virtual grep -nE \"Pool|require.*pg|DATABASE_URL|POSTGRES|PGHOST\" /app/server.js | head -20"))

print("\n" + "=" * 60)
print("1.2 - Queries INSERT/SELECT no server.js")
print("=" * 60)
print(run("docker exec assistente-virtual grep -nE \"INSERT INTO|SELECT.*FROM|pool\\.query|client\\.query\" /app/server.js | head -20"))

print("\n" + "=" * 60)
print("1.3 - Localizar app.post webhook")
print("=" * 60)
print(run("docker exec assistente-virtual grep -n \"app.post\" /app/server.js"))

print("\n" + "=" * 60)
print("1.4 - Localizar enviarMensagem")
print("=" * 60)
print(run("docker exec assistente-virtual grep -n \"enviarMensagem\" /app/server.js | head -10"))

print("\n" + "=" * 60)
print("1.5 - Onde from e body sao extraidos")
print("=" * 60)
print(run("docker exec assistente-virtual grep -nE \"\\.from|\\.text\\.body|messages\\[0\\]\" /app/server.js | head -15"))

print("\n" + "=" * 60)
print("1.6 - Estrutura tabela conversas no banco")
print("=" * 60)
print(run("docker exec -u 0 hairtech-postgres psql -U hairtech -d hairtechdb -c \"\\d conversas\" 2>&1"))

print("\n" + "=" * 60)
print("1.7 - Estrutura tabela comprovantes no banco")
print("=" * 60)
print(run("docker exec -u 0 hairtech-postgres psql -U hairtech -d hairtechdb -c \"\\d comprovantes\" 2>&1"))

print("\n" + "=" * 60)
print("1.8 - Contagem atual nas tabelas")
print("=" * 60)
print(run("docker exec -u 0 hairtech-postgres psql -U hairtech -d hairtechdb -c \"SELECT 'conversas' as tabela, COUNT(*) FROM conversas UNION ALL SELECT 'comprovantes', COUNT(*) FROM comprovantes;\" 2>&1"))

print("\n" + "=" * 60)
print("1.9 - Pacote pg instalado no container?")
print("=" * 60)
print(run("docker exec assistente-virtual ls node_modules/pg 2>&1 | head -5"))

print("\n" + "=" * 60)
print("1.10 - Variaveis de ambiente DB no container")
print("=" * 60)
print(run("docker exec assistente-virtual env | grep -iE \"PG|DATABASE|DB|POSTGRES\""))

print("\n" + "=" * 60)
print("1.11 - Linhas 1-30 do server.js (requires e constantes)")
print("=" * 60)
print(run("docker exec assistente-virtual head -30 /app/server.js"))

print("\n" + "=" * 60)
print("1.12 - Testar conexao direta ao postgres")
print("=" * 60)
print(run("docker exec -u 0 hairtech-postgres psql -U hairtech -d hairtechdb -c \"SELECT NOW();\" 2>&1"))

print("\n" + "=" * 60)
print("FIM DO DIAGNOSTICO PARTE 5")
print("Resultado salvo em /tmp/parte5_out.txt")
print("=" * 60)
