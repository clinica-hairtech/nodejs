#!/usr/bin/env python3
"""
TRIAGEM 2 DAS 984 MENSAGENS DE COBRANCA (Ollama local - custo R$0)

Executar no Mac do Dr.:
1. Garantir Ollama.app aberto (porta 11434)
2. python3 triagem-2-cobrancas-ollama.py

Input: ~/Documents/Codex/.../MENSAGENS_APPLE_COBRANCAS_HIGIENIZADO_2026-05-22.csv
Output:
  - triagem2_cobranca_real.csv (cobranca legitima com dados)
  - triagem2_dda_servico.csv (boleto/servico legitimo)
  - triagem2_spam_golpe.csv (assedio/fraude)
  - triagem2_otp_descartar.csv (codigos/2FA)
  - triagem2_relatorio.md (sumario por credor)
"""

import csv
import json
import os
import sys
from pathlib import Path
import urllib.request
import time

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gemma3:4b"

# Encontra CSV de input automaticamente
HOME = str(Path.home())
INPUT_CANDIDATES = [
    f"{HOME}/Documents/Codex/2026-05-20/vamos-l-quero-saber-disso-tudo/MENSAGENS_APPLE_COBRANCAS_HIGIENIZADO_2026-05-22.csv",
    f"{HOME}/Documents/Codex/MENSAGENS_APPLE_COBRANCAS_HIGIENIZADO_2026-05-22.csv",
    f"{HOME}/Downloads/MENSAGENS_APPLE_COBRANCAS_HIGIENIZADO_2026-05-22.csv",
]
INPUT = next((p for p in INPUT_CANDIDATES if os.path.exists(p)), None)
if not INPUT:
    print("CSV nao encontrado. Caminhos tentados:")
    for c in INPUT_CANDIDATES:
        print(f"  - {c}")
    sys.exit(1)

OUTPUT_DIR = os.path.dirname(INPUT)


def classificar_ollama(texto, contato, data):
    prompt = f"""Classifique esta mensagem SMS/Apple Messages em UMA das 4 categorias.

Mensagem:
Data: {data}
Contato: {contato}
Texto: {texto[:400]}

Categorias:
1. COBRANCA_REAL = banco/credor identificavel, valor mencionado, sem URL suspeita
2. DDA_SERVICO = boleto, fatura legitima de servico (luz, agua, internet)
3. SPAM_GOLPE = URL encurtada suspeita, "60x sem entrada", linguagem ameacadora generica
4. OTP_DESCARTAR = codigo de verificacao, 2FA, transacao aprovada/negada

Responda APENAS um JSON: {{"categoria":"X","credor":"nome curto","valor":"R$ X,XX ou null","confianca":"alta/media/baixa"}}"""

    data_req = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2, "num_predict": 150}
    }).encode()

    req = urllib.request.Request(OLLAMA_URL, data=data_req, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            response = json.loads(r.read().decode())
            return json.loads(response.get("response", "{}"))
    except Exception as e:
        return {"categoria": "ERRO", "credor": str(e)[:50], "valor": None, "confianca": "baixa"}


def main():
    print(f"Lendo {INPUT}...")
    with open(INPUT, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        linhas = list(reader)
    print(f"Total: {len(linhas)} mensagens\n")

    categorias = {"COBRANCA_REAL": [], "DDA_SERVICO": [], "SPAM_GOLPE": [], "OTP_DESCARTAR": [], "ERRO": []}
    credores = {}
    t0 = time.time()

    for i, linha in enumerate(linhas, 1):
        texto = linha.get("texto_higienizado") or linha.get("texto") or ""
        contato = linha.get("contato", "")
        data = linha.get("data_hora", "")

        if not texto:
            continue

        res = classificar_ollama(texto, contato, data)
        cat = res.get("categoria", "ERRO")
        credor = res.get("credor", "?")
        valor = res.get("valor")

        if cat not in categorias:
            cat = "ERRO"
        linha_out = {**linha, "categoria_2": cat, "credor": credor, "valor": valor, "confianca": res.get("confianca")}
        categorias[cat].append(linha_out)

        if cat == "COBRANCA_REAL":
            credores[credor] = credores.get(credor, 0) + 1

        elapsed = time.time() - t0
        rate = i / elapsed if elapsed > 0 else 0
        eta_min = (len(linhas) - i) / rate / 60 if rate > 0 else 0
        if i % 10 == 0:
            print(f"  {i}/{len(linhas)} ({rate:.1f}/s, ETA {eta_min:.1f}min) | {cat} | {credor[:30]}")

    # Salva CSVs
    for cat, items in categorias.items():
        if not items:
            continue
        out_path = os.path.join(OUTPUT_DIR, f"triagem2_{cat.lower()}.csv")
        fieldnames = list(items[0].keys())
        with open(out_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(items)
        print(f"  -> {out_path}: {len(items)} linhas")

    # Salva relatorio
    relatorio_path = os.path.join(OUTPUT_DIR, "triagem2_relatorio.md")
    with open(relatorio_path, "w", encoding="utf-8") as f:
        f.write(f"# TRIAGEM 2 — RELATORIO\n\nProcessado em {time.strftime('%Y-%m-%d %H:%M')}.\n\n")
        f.write(f"## Totais\n\n")
        for cat, items in categorias.items():
            f.write(f"- **{cat}**: {len(items)}\n")
        f.write(f"\n## Credores em COBRANCA_REAL (top 30)\n\n")
        for c, n in sorted(credores.items(), key=lambda x: -x[1])[:30]:
            f.write(f"- {c}: {n} mensagens\n")
        f.write(f"\n## Tempo total: {(time.time()-t0)/60:.1f} min\n")
    print(f"\nRelatorio: {relatorio_path}")

    # Telegram notify
    try:
        tg_token = "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ"
        tg_chat = "8713631351"
        total_cobranca = len(categorias["COBRANCA_REAL"])
        total_spam = len(categorias["SPAM_GOLPE"])
        top_credores = "\n".join([f"- {c}: {n}" for c, n in sorted(credores.items(), key=lambda x: -x[1])[:5]])
        msg = f"Triagem 2 concluida!\n\nCobranca real: {total_cobranca}\nDDA/servico: {len(categorias['DDA_SERVICO'])}\nSpam/golpe: {total_spam}\nOTP: {len(categorias['OTP_DESCARTAR'])}\n\nTop credores:\n{top_credores}"
        urllib.request.urlopen(urllib.request.Request(
            f"https://api.telegram.org/bot{tg_token}/sendMessage",
            data=json.dumps({"chat_id": tg_chat, "text": msg}).encode(),
            headers={"Content-Type": "application/json"}
        ), timeout=10)
    except Exception as e:
        print(f"Telegram falhou: {e}")

    print("\nFEITO.")


if __name__ == "__main__":
    main()
