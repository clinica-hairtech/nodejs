#!/usr/bin/env python3
# fix_ana_webhook.py — Corrige /webhook/ana para aceitar eventos WAHA WEBJS
# Faz backup antes de qualquer modificacao

import shutil
import time
import os

FILE = "/home/user/nodejs/app.js"
BACKUP_DIR = "/root/backups_av"

os.makedirs(BACKUP_DIR, exist_ok=True)
ts = time.strftime("%Y%m%d_%H%M%S")
backup = f"{BACKUP_DIR}/app.js.bak.{ts}"
shutil.copy2(FILE, backup)
print(f"Backup: {backup}")

with open(FILE, "r") as f:
    content = f.read()

OLD = '''app.post("/webhook/ana", async (req, res) => {
  try {
    const { event, payload } = req.body || {};

    if (event !== "message" || !payload || payload.fromMe) {
      return res.sendStatus(200);
    }

    const chatId = payload.from;
    const text = (payload.body || "").trim();

    if (!text || !chatId || chatId.endsWith("@g.us") || chatId === "status@broadcast") {
      return res.sendStatus(200);
    }

    console.log(`[ANA] msg de ${chatId}: ${text.slice(0, 80)}`);
    res.sendStatus(200);

    const resposta = await responderAna(chatId, text);
    await enviarMsgAna(chatId, resposta);
  } catch (e) {
    console.error("[ANA webhook]", e.message);
    if (!res.headersSent) res.sendStatus(200);
  }
});'''

NEW = '''app.post("/webhook/ana", async (req, res) => {
  try {
    const body = req.body || {};
    const event = body.event || body.type || "";
    const payload = body.payload || body.data || body;
    console.log(`[ANA] webhook event="${event}" keys=${Object.keys(body).join(",")}`);

    if (payload.fromMe) return res.sendStatus(200);
    if (!event || /status|ack|reaction|session|typing/i.test(event)) {
      return res.sendStatus(200);
    }

    const chatId = (payload.from || payload.chatId || "").toString();
    const text = (payload.body || payload.text || payload.content || "").trim();

    if (!text || !chatId || chatId.endsWith("@g.us") || chatId === "status@broadcast") {
      return res.sendStatus(200);
    }

    console.log(`[ANA] msg de ${chatId}: ${text.slice(0, 80)}`);
    res.sendStatus(200);

    const resposta = await responderAna(chatId, text);
    await enviarMsgAna(chatId, resposta);
  } catch (e) {
    console.error("[ANA webhook]", e.message);
    if (!res.headersSent) res.sendStatus(200);
  }
});'''

if OLD not in content:
    print("ERRO: bloco antigo nao encontrado — app.js ja foi modificado ou divergiu.")
    print("Procurando '/webhook/ana' no arquivo...")
    idx = content.find('/webhook/ana"')
    if idx >= 0:
        print(f"Encontrado em posicao {idx}. Linhas ao redor:")
        lines = content.splitlines()
        for i, line in enumerate(lines):
            if '/webhook/ana' in line:
                start = max(0, i-1)
                end = min(len(lines), i+30)
                for j in range(start, end):
                    print(f"  {j+1}: {lines[j]}")
    raise SystemExit(1)

new_content = content.replace(OLD, NEW, 1)

if new_content == content:
    print("ERRO: substituicao nao alterou o arquivo.")
    raise SystemExit(1)

with open(FILE, "w") as f:
    f.write(new_content)

print("OK: /webhook/ana corrigido com sucesso.")
print("Reinicie o container: docker restart assistente-virtual")
