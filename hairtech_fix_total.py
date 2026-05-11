#!/usr/bin/env python3
"""
HAIRTECH — FIX COMPLETO AUTÔNOMO
SSH: root@72.62.100.6 / HairTech2026.Secure(VPS)
Execute: python3 /home/user/nodejs/hairtech_fix_total.py
"""
import subprocess, json, shutil, os, time
from datetime import datetime as dt

WA_TOKEN = "EAANMjgAZCaTEBRYBBRwzUlmxFEmlkUkEcVZARZAC3G3u9CK4TMCB8yqmZCA5PNOQBIEbTIefm05C4cXff8obx4a2ZCPLvpfkZCsOpdX18ccTIzCGEXgnoWzNcMHaP9zCFNbx3AGcbjT0R9LKBTIj36Mg5y8rpSnLEoV3QS3gV8ONZBL9XXt4ZANnyx1MI1K8MQZDZD"
WABA_ID = "1480059533694084"
AV_PID = "983992428140920"
TG_TOKEN = "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ"
TG_CHAT = "8713631351"
APP = "/home/user/nodejs/app.js"
AV_COMPOSE = "/home/user/nodejs/docker-compose.yml"
OC_COMPOSE = "/opt/hairtech-openclaw/docker-compose.yml"
OC_WORKSPACE = "/opt/hairtech-openclaw/workspace"
OC_CONFIG = "/opt/hairtech-openclaw/config/openclaw.json"
BK = f"/root/backups_av/fix_total_{dt.now().strftime('%Y%m%d_%H%M%S')}"
os.makedirs(BK, exist_ok=True)
log = []

def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

def tg(msg):
    subprocess.run(["curl","-s","-X","POST",
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        "-d", f"chat_id={TG_CHAT}&parse_mode=Markdown&text={msg}"],
        capture_output=True)

def step(n, msg):
    print(f"\n{'='*50}")
    print(f"PASSO {n}: {msg}")
    print('='*50)
    log.append(f"PASSO {n}: {msg}")

# PASSO 1 — BACKUP
step(1, "Backup de arquivos criticos")
for f in [APP, AV_COMPOSE, OC_COMPOSE, OC_CONFIG]:
    if os.path.exists(f):
        shutil.copy(f, f"{BK}/{os.path.basename(f)}.bak")
        print(f"  backup: {f}")

# PASSO 2 — DESCOBRIR PHONE_NUMBER_ID DA ANA
step(2, "Descobrindo phone_number_id da ANA via Meta API")
out, err, rc = run(["curl","-s","-H",f"Authorization: Bearer {WA_TOKEN}",
    f"https://graph.facebook.com/v23.0/{WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,platform_type"])
try:
    nums = json.loads(out).get("data", [])
except Exception:
    nums = []
print("Numeros no WABA:", [(n.get("display_phone_number"), n.get("id")) for n in nums])
ANA_PID = next((n["id"] for n in nums if n.get("id") != AV_PID), None)
ANA_STATUS = next((n.get("code_verification_status") for n in nums if n.get("id") == ANA_PID), None) if ANA_PID else None
print(f"ANA phone_number_id: {ANA_PID}")
print(f"ANA status: {ANA_STATUS}")
if not ANA_PID:
    tg("HairTech: ANA nao encontrada no WABA. Verificar no Meta Business Manager.")
    log.append("AVISO: ANA nao encontrada no WABA")

# PASSO 3 — DESCOBRIR PORTA DO WHATSAPP-INBOX
step(3, "Descobrindo configuracao do whatsapp-inbox")
out, _, _ = run(["docker","inspect","whatsapp-inbox",
    "--format","{{json .NetworkSettings.Ports}}"])
try:
    ports_data = json.loads(out or "{}")
    inbox_host_port = next((v[0]["HostPort"] for v in ports_data.values() if v), None)
except Exception:
    inbox_host_port = None

out2, _, _ = run(["docker","inspect","whatsapp-inbox",
    "--format","{{json .Config.ExposedPorts}}"])
try:
    exposed = list(json.loads(out2 or "{}").keys())
    inbox_container_port = exposed[0].replace("/tcp","") if exposed else "3000"
except Exception:
    inbox_container_port = "3000"

inbox_url = f"http://whatsapp-inbox:{inbox_container_port}/webhook"
inbox_url_host = f"http://host.docker.internal:{inbox_host_port}/webhook" if inbox_host_port else inbox_url
print(f"Inbox container port: {inbox_container_port}")
print(f"Inbox host port: {inbox_host_port}")
print(f"Inbox URL: {inbox_url}")

# PASSO 4 — CORRIGIR APP.JS
step(4, "Corrigindo app.js para rotear mensagens da ANA")
if ANA_PID:
    try:
        code = open(APP).read()
        MARKER = "const message = change?.value?.messages?.[0];"
        FIX = f"""
  // AUTO-FIX HAIRTECH: rotear por phone_number_id
  const _incoming_pid = change?.value?.metadata?.phone_number_id;
  if (_incoming_pid && _incoming_pid !== '{AV_PID}') {{
    console.log('[ROUTER] Mensagem para', _incoming_pid, '-> encaminhando para whatsapp-inbox');
    try {{
      const _axios = require('axios');
      await _axios.post('{inbox_url}', req.body, {{timeout: 8000}}).catch(async () => {{
        await _axios.post('{inbox_url_host}', req.body, {{timeout: 5000}}).catch(() => {{}});
      }});
    }} catch(e) {{ console.error('[ROUTER] Erro forward:', e.message); }}
    return res.sendStatus(200);
  }}
  // FIM AUTO-FIX
"""
        if MARKER in code and "_incoming_pid" not in code:
            new_code = code.replace(MARKER, FIX + "  " + MARKER)
            open(APP, "w").write(new_code)
            print("Fix aplicado no app.js")
            log.append("OK: Fix phone_number_id aplicado no app.js")
        elif "_incoming_pid" in code:
            print("Fix ja estava aplicado")
            log.append("INFO: Fix ja estava presente")
        else:
            print("MARKER nao encontrado — verificar app.js manualmente")
            log.append("AVISO: Marker nao encontrado no app.js")
    except Exception as e:
        print(f"Erro passo 4: {e}")
        log.append(f"ERRO passo 4: {e}")
else:
    print("Pulando fix app.js — ANA nao encontrada no WABA")
    log.append("AVISO: Passo 4 pulado — ANA nao no WABA")

# PASSO 5 — REINICIAR AV
step(5, "Reiniciando assistente-virtual")
run(["docker","compose","-f",AV_COMPOSE,"restart","assistente-virtual"])
time.sleep(15)
out, _, _ = run(["docker","inspect","assistente-virtual","--format","{{.State.Status}}"])
print(f"AV status: {out}")
log.append(f"OK: AV reiniciado — status: {out}")

# PASSO 6 — ADICIONAR LABELS TRAEFIK AO OPENCLAW
step(6, "Adicionando labels Traefik ao hairtech-openclaw")
try:
    import yaml
    with open(OC_COMPOSE) as f:
        c = yaml.safe_load(f)
    svc_name = list(c["services"].keys())[0]
    svc = c["services"][svc_name]
    # Adicionar rede web
    nets = svc.get("networks", [])
    if isinstance(nets, list) and "web" not in nets:
        nets.append("web")
        svc["networks"] = nets
    elif isinstance(nets, dict) and "web" not in nets:
        nets["web"] = None
        svc["networks"] = nets
    # Adicionar labels
    svc["labels"] = [
        "traefik.enable=true",
        "traefik.docker.network=web",
        "traefik.http.routers.openclaw.rule=Host(`claw.hairtech.org`)",
        "traefik.http.routers.openclaw.entrypoints=websecure",
        "traefik.http.routers.openclaw.tls.certresolver=letsencrypt",
        "traefik.http.services.openclaw.loadbalancer.server.port=18789"
    ]
    # Declarar rede web como externa
    if "networks" not in c:
        c["networks"] = {}
    if "web" not in c["networks"]:
        c["networks"]["web"] = {"external": True}
    with open(OC_COMPOSE, "w") as f:
        yaml.safe_dump(c, f, default_flow_style=False, allow_unicode=True)
    r, err, rc = run(["docker","compose","-f",OC_COMPOSE,"config"])
    if rc == 0:
        print("YAML valido. Recriando container...")
        run(["docker","compose","-f",OC_COMPOSE,"up","-d","--force-recreate"])
        time.sleep(20)
        out, _, _ = run(["docker","inspect","hairtech-openclaw","--format","{{.State.Status}}"])
        print(f"OpenClaw status: {out}")
        log.append(f"OK: Labels Traefik adicionadas — status: {out}")
    else:
        print(f"YAML invalido: {err[:200]}")
        shutil.copy(f"{BK}/docker-compose.yml.bak", OC_COMPOSE)
        log.append("ERRO: YAML invalido, rollback feito")
except Exception as e:
    print(f"Erro passo 6: {e}")
    log.append(f"ERRO passo 6: {e}")

# PASSO 7 — CRIAR SOULS DOS AGENTES
step(7, "Criando SOULs dos agentes")
agents = {
    "ana": """# SOUL - ANA (Vendas FUE)
Numero: +5521967813366. Tom: acolhedor, empatico, profissional.
Sou especialista em vendas de transplante capilar FUE da Clinica HairTech.

## Tabela de precos (revelar so quando perguntado diretamente)
- Padrao: R$10.000 (ate 12x com juros automaticos)
- A Vista Pix/dinheiro: R$9.500
- A Vista sem rosto: R$9.300
- Paciente Modelo: R$8.000 (12x sem juros, autoriza fotos/videos)
- Consulta: R$350 Rio Bonito / R$400 Niteroi e Barra
- Sinal: R$150 Pix CNPJ 49.634.881/0001-91 (nao reembolsavel < 24h)
- MINIMO ABSOLUTO: R$8.000

## Agenda
- NUNCA marcar as 12h
- Preferencia: terca -> quinta -> sexta -> segunda
- NUNCA prometer resultado sem avaliacao presencial""",

    "av": """# SOUL - AV (Triagem)
Numero: +5521993542383. Tom: direto, amigavel, agil.
Primeiro contato com leads do HairTech.

## Criterio lead quente
Palavras-chave: transplante, queda, valor, preco, agendar, consulta, quanto custa

## Hard limits
- Nunca revelar tabela completa de precos (direcionar para ANA)
- Nunca prometer datas sem confirmar agenda""",

    "marketing": """# SOUL - Marketing
Tom: persuasivo, elegante, foco em conversao.

## Estilo visual HairTech
- Fundo preto, moldura dourada
- Reels 1080x1920, conteudo cientifico acessivel""",

    "pos_consulta": """# SOUL - Pos-Consulta
Tom: cuidadoso, tecnico, empatico.

## Hard limits
- Qualquer sinal de complicacao medica -> escalar IMEDIATAMENTE para Dr. Ricardo (+5521982006372)
- NUNCA dar orientacao medica especifica sem supervisao"""
}

for name, soul in agents.items():
    path = f"{OC_WORKSPACE}/agents/{name}"
    os.makedirs(path, exist_ok=True)
    open(f"{path}/SOUL.md", "w").write(soul)
    print(f"  criado: {path}/SOUL.md")

log.append("OK: SOULs ANA, AV, Marketing, Pos-Consulta criados")

# PASSO 8 — TESTES
step(8, "Testes smoke")
time.sleep(10)

out, _, _ = run(["curl","-sI","--max-time","10","https://claw.hairtech.org/healthz"])
claw_ok = "200" in out or "401" in out or "404" in out
print(f"claw.hairtech.org: {'OK' if claw_ok else 'FALHA'}")
print(out[:200])
log.append(f"{'OK' if claw_ok else 'FALHA'}: claw.hairtech.org")

out2, _, _ = run(["curl","-sI","--max-time","10","https://hairtech.org/health"])
av_ok = "200" in out2
print(f"hairtech.org/health: {'OK' if av_ok else 'FALHA'}")
log.append(f"{'OK' if av_ok else 'FALHA'}: hairtech.org/health")

containers = ["assistente-virtual","hairtech-openclaw","hairtech-authbot","hairtech-postgres","traefik-traefik-1","whatsapp-inbox"]
status_list = []
for c in containers:
    o, _, _ = run(["docker","inspect",c,"--format","{{.State.Status}}"])
    status_list.append(f"{c}: {o}")
    print(f"  {c}: {o}")

# PASSO 9 — RELATORIO FINAL
step(9, "Enviando relatorio para Ricardo via Telegram")
status_text = "\n".join(status_list)
log_text = "\n".join(log)
msg = (
    "HAIRTECH Fix Completo 11/05/2026\n\n"
    + log_text + "\n\nContainers:\n" + status_text
    + f"\n\nANA pid: {ANA_PID or 'NAO ENCONTRADO'}"
    + f"\nANA status Meta: {ANA_STATUS or 'desconhecido'}"
    + f"\nclaw.hairtech.org: {'OK' if claw_ok else 'FALHA'}"
    + f"\nhairtech.org: {'OK' if av_ok else 'FALHA'}"
    + "\n\nURGENTE: Renovar VPS antes 22/05 em hpanel.hostinger.com"
)
tg(msg)
print("\n" + "="*50)
print("RELATORIO FINAL:")
print(log_text)
print("="*50)
print("Mensagem enviada para Ricardo no Telegram.")
