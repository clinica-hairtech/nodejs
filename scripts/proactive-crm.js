// CRM pro-ativo: roda 1x/dia, scan leads inativos 7+ dias,
// gera mensagem de re-engajamento via IA, ADICIONA A FILA DE APROVACAO.
// NUNCA envia automatico - Dr. aprova manualmente em /admin/aprovar-fila.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const DIAS_INATIVO = parseInt(process.env.PROACTIVE_DIAS_INATIVO || "7", 10);
const MAX_POR_DIA = parseInt(process.env.PROACTIVE_MAX_POR_DIA || "20", 10);

if (!process.env.DATABASE_URL) {
  console.error("[proactive-crm] DATABASE_URL ausente");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function chamarOllama(prompt) {
  const url = (process.env.OLLAMA_BASE_URL || "http://ollama:11434") + "/api/chat";
  const r = await axios.post(url, {
    model: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct",
    messages: [{ role: "user", content: prompt }],
    stream: false,
    options: { temperature: 0.75, num_predict: 200 },
  }, { timeout: 45000 });
  return r.data.message.content;
}

async function chamarGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY ausente");
  const base = process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
  const r = await axios.post(`${base}/chat/completions`, {
    model: "gemini-2.5-flash",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 250,
    temperature: 0.75,
  }, { headers: { Authorization: `Bearer ${key}` }, timeout: 25000 });
  return r.data.choices[0].message.content;
}

async function gerarMensagem(c) {
  const nome = c.nome || "";
  const hist = Array.isArray(c.historico) ? c.historico : [];
  const ultimaDele = [...hist].reverse().find((m) => m.role === "user");
  const ultMsg = ultimaDele ? (ultimaDele.content || "").substring(0, 220) : "";
  const prompt = `Voce e atendente da Clinica HairTech (transplante capilar FUE, Rio de Janeiro).
Um lead chamado ${nome || "[sem nome]"} (temperatura: ${c.temperatura}) ficou ${DIAS_INATIVO}+ dias sem responder.
A ultima mensagem dele foi: "${ultMsg || "(sem texto)"}"

Escreva uma mensagem de re-engajamento natural em portugues brasileiro, com 1-2 frases (max 40 palavras).
Tom: caloroso, sem pressao comercial, perguntando se ele ainda tem interesse.
NAO mencione "ja faz X dias". NAO se apresente. NAO use mais de 1 emoji.
Comece direto, como continuacao natural da conversa.`;
  try {
    return await chamarOllama(prompt);
  } catch (e) {
    console.warn("[proactive-crm] ollama falhou:", e.message);
    return await chamarGemini(prompt);
  }
}

async function main() {
  const agora = Date.now();
  const limiteRecente = agora - DIAS_INATIVO * 86400000;
  const limiteAntigo = agora - 60 * 86400000;

  const res = await pool.query(`
    SELECT numero, nome, status, temperatura, historico, ultima_atividade
    FROM conversations
    WHERE status = 'ativo'
      AND ultima_atividade < $1
      AND ultima_atividade > $2
      AND temperatura IN ('quente', 'morno')
    ORDER BY
      CASE temperatura WHEN 'quente' THEN 0 WHEN 'morno' THEN 1 ELSE 2 END,
      ultima_atividade DESC
    LIMIT $3
  `, [limiteRecente, limiteAntigo, MAX_POR_DIA]);

  console.log(`[proactive-crm] candidatos elegiveis: ${res.rows.length}`);

  const filaPath = path.join(__dirname, "..", "crm-fila.json");
  let fila = [];
  try { fila = JSON.parse(fs.readFileSync(filaPath, "utf8")); if (!Array.isArray(fila)) fila = []; } catch (_) {}

  const ativosNaFila = new Set(fila.filter(x => x.status === "pendente").map(x => x.numero));
  let novos = 0;

  for (const c of res.rows) {
    if (ativosNaFila.has(c.numero)) continue;
    try {
      const msg = await gerarMensagem(c);
      fila.push({
        id: crypto.randomBytes(6).toString("hex"),
        numero: c.numero,
        nome: c.nome || "(sem nome)",
        temperatura: c.temperatura,
        ultima_atividade: c.ultima_atividade,
        ultima_atividade_iso: c.ultima_atividade ? new Date(Number(c.ultima_atividade)).toISOString() : null,
        mensagem_sugerida: (msg || "").trim(),
        criado_em: new Date().toISOString(),
        status: "pendente",
      });
      novos++;
    } catch (e) {
      console.warn("[proactive-crm] falha em", c.numero, e.message);
    }
  }

  fs.writeFileSync(filaPath, JSON.stringify(fila.slice(-100), null, 2));
  console.log(`[proactive-crm] ${novos} novos. Total fila: ${fila.length}`);

  if (novos > 0) {
    const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
    const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
    const text = `HairTech CRM pro-ativo: ${novos} leads inativos prontos pra re-engajar. Aprovar em https://hairtech.org/admin/aprovar-fila`;
    await axios.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      chat_id: tgChat, text, disable_web_page_preview: true,
    }, { timeout: 5000 }).catch(() => {});
  }

  await pool.end();
}

main().catch((e) => { console.error("[proactive-crm] erro fatal:", e); process.exit(1); });
