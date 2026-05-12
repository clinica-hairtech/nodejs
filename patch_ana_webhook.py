#!/usr/bin/env python3
"""
Idempotente. Aplica 2 mudancas em /home/user/nodejs/app.js:
1) Garante AI_MODEL = "gemini-2.0-flash" (caso ainda esteja em 2.5-flash)
2) Adiciona endpoint /webhook/ana antes do app.listen(PORT,

Roda na VPS:
    python3 /home/user/nodejs/patch_ana_webhook.py
"""
import shutil
from datetime import datetime as dt
from pathlib import Path

APP = Path("/home/user/nodejs/app.js")
BK_DIR = Path("/root/backups_av")
BK_DIR.mkdir(parents=True, exist_ok=True)

ANA_BLOCK = '''
// ==========================
// WEBHOOK ANA (WhatsApp Web via WAHA)
// ==========================
const ANA_SYSTEM_PROMPT = `Voce e ANA, especialista em vendas de transplante capilar FUE da Clinica HairTech.

PERSONALIDADE:
- Tom: acolhedor, empatico, profissional, brasileiro
- Use linguagem natural ("ta", "pra", "to" sao OK)
- Nunca soe robotica ou generica

TABELA DE PRECOS (revelar APENAS quando perguntado diretamente sobre valor):
- Padrao: R$10.000 (ate 12x com juros automaticos)
- A Vista Pix/dinheiro: R$9.500
- A Vista sem rosto: R$9.300
- Paciente Modelo: R$8.000 (12x sem juros, autoriza fotos/videos)
- Consulta: R$350 Rio Bonito / R$400 Niteroi e Barra
- Sinal: R$150 Pix CNPJ 49.634.881/0001-91 (nao reembolsavel < 24h)
- MINIMO ABSOLUTO: R$8.000

AGENDA:
- Nunca marcar as 12h
- Preferencia: terca > quinta > sexta > segunda
- Nunca prometer resultado sem avaliacao presencial

HARD LIMITS:
- Decisoes medicas so apos consulta presencial
- Sinal sempre Pix CNPJ 49.634.881/0001-91
- Complicacao medica -> escalar Dr. Ricardo (+5521982006372)

Quando cliente quer agendar, pedir: nome completo, melhor dia (preferindo ordem acima) e turno.`;

const conversasAna = {};
const WAHA_URL_BASE = "ht" + "tp://whatsapp-ana:3000";
const WAHA_KEY = process.env.WHATSAPP_ANA_KEY || "";

async function responderAna(chatId, mensagem) {
  if (!conversasAna[chatId]) conversasAna[chatId] = { historico: [] };
  const c = conversasAna[chatId];
  c.historico.push({ role: "user", content: mensagem });
  if (c.historico.length > 20) c.historico = c.historico.slice(-20);

  try {
    const resp = await axios.post(
      `${AI_BASE_URL}/chat/completions`,
      {
        model: AI_MODEL,
        messages: [
          { role: "system", content: ANA_SYSTEM_PROMPT },
          ...c.historico.map(m => ({ role: m.role, content: m.content }))
        ],
        max_tokens: 1000,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 25000
      }
    );
    const reply = resp.data.choices[0].message.content;
    c.historico.push({ role: "assistant", content: reply });
    return reply;
  } catch (e) {
    console.error("[ANA] Erro IA:", e.response?.data || e.message);
    return "Desculpa, tive um problema tecnico agora. Pode mandar de novo?";
  }
}

async function enviarMsgAna(chatId, texto) {
  try {
    await axios.post(
      `${WAHA_URL_BASE}/api/sendText`,
      { session: "default", chatId, text: texto },
      { headers: { "X-Api-Key": WAHA_KEY }, timeout: 15000 }
    );
  } catch (e) {
    console.error("[ANA] Erro WAHA send:", e.response?.data || e.message);
  }
}

app.post("/webhook/ana", async (req, res) => {
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
});

'''


def main():
    code = APP.read_text()
    changed = False

    # Backup
    bk = BK_DIR / f"app.js.bak.{dt.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy(APP, bk)
    print(f"Backup: {bk}")

    # 1) AI_MODEL fix
    old_model = 'const AI_MODEL         = "gemini-2.5-flash";'
    new_model = 'const AI_MODEL         = "gemini-2.0-flash";'
    if old_model in code:
        code = code.replace(old_model, new_model, 1)
        changed = True
        print("OK: AI_MODEL trocado 2.5-flash -> 2.0-flash")
    elif new_model in code:
        print("INFO: AI_MODEL ja em 2.0-flash")
    else:
        print("AVISO: nem 2.5 nem 2.0 encontrados na linha esperada (verificar manual)")

    # 2) ANA webhook block
    if "/webhook/ana" in code or "responderAna" in code:
        print("INFO: webhook ANA ja presente, skip")
    else:
        marker = "app.listen(PORT,"
        if marker not in code:
            print("ERRO: marker 'app.listen(PORT,' nao encontrado em app.js")
            return
        code = code.replace(marker, ANA_BLOCK + "\n" + marker, 1)
        changed = True
        print("OK: bloco webhook ANA inserido antes de app.listen")

    if changed:
        APP.write_text(code)
        print(f"app.js gravado (linhas: {len(code.splitlines())})")
    else:
        print("Nenhuma mudanca aplicada")


if __name__ == "__main__":
    main()
