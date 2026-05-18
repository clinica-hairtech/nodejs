// Cliente Ollama local — primario quando OLLAMA_ENABLED=1 no .env.
const axios = require("axios");

const ENABLED = process.env.OLLAMA_ENABLED === "1" || process.env.OLLAMA_ENABLED === "true";
const BASE_URL = (process.env.OLLAMA_BASE_URL || "http://ollama:11434").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b-instruct";

async function chamar(systemPrompt, historico, opts = {}) {
  if (!ENABLED) throw new Error("ollama disabled");
  const messages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...historico]
    : historico;
  const r = await axios.post(`${BASE_URL}/api/chat`, {
    model: MODEL,
    messages,
    stream: false,
    options: {
      temperature: opts.temperature !== undefined ? opts.temperature : 0.6,
      num_predict: opts.maxTokens || 1500,
    },
  }, { timeout: opts.timeout || 60000 });
  const conteudo = r.data && r.data.message && r.data.message.content;
  if (!conteudo) throw new Error("ollama resposta vazia");
  return conteudo;
}

async function health() {
  try {
    const r = await axios.get(`${BASE_URL}/api/tags`, { timeout: 3000 });
    const modelos = (r.data && r.data.models) || [];
    return { ok: true, modelos: modelos.map(m => m.name), modelo_ativo: MODEL };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

module.exports = { chamar, health, ENABLED, MODEL, BASE_URL };
