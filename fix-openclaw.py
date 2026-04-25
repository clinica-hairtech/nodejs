#!/usr/bin/env python3
import subprocess, os

env_file = "/tmp/oc.env"
image = "ghcr.io/openclaw/openclaw:latest"
name = "openclaw-openclaw-1"
network = "web"
volume = "/docker/openclaw/config:/home/node/.openclaw"

# Para e remove container antigo se existir
subprocess.run(["docker", "stop", name], capture_output=True)
subprocess.run(["docker", "rm", name], capture_output=True)

# Cria novo container com todas as env vars + GOOGLE_API_KEY
cmd = [
    "docker", "run", "-d",
    "--name", name,
    "--network", network,
    "--env-file", env_file,
    "-e", "GOOGLE_API_KEY=AIzaSyD-kCSGyWekDePyrQC94T8bugNOPaM7LIQ",
    "-v", volume,
    "--restart", "unless-stopped",
    image
]

result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode == 0:
    print("Container criado:", result.stdout.strip())
else:
    print("Erro:", result.stderr.strip())
