// Ponte multi-agente: endpoint HTTP que QUALQUER agente externo
// (ChatGPT, Manus, scripts, etc) pode chamar pra usar IA da HairTech.
//
// Acesso via:
//   POST https://hairtech.org/api/agent/chat
//   Header: Authorization: Bearer <AGENTS_API_TOKEN>
//   Body: { prompt: "...", prefer_model: "ollama|claude|gpt" (opcional) }
//
// Roteamento inteligente:
//   - prompt curto e simples (<200 char, sem termos clinicos) -> Ollama VPS (R$0)
//   - prompt complexo (CFM/LGPD/copy/estrategia) -> Claude API
//   - especificou prefer_model: respeita
//
// Custo controlado: contador diario por IP/token

const express = require("express");
const axios = require("axios");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.AGENTS_API_TOKEN || "trocar-este-token-no-env";
const OLLAMA_URL = (process.env.OLLAMA_BASE_URL || "http://ollama:11434") + "/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

const ESTADO_FILE = path.join(__dirname, "data", "agents-api-estado.json");
const LIMITE_DIA_BRL = parseFloat(process.env.AGENTS_API_LIMITE || "10");

function lerEstado() {
  try { return JSON.parse(fs.readFileSync(ESTADO_FILE, "utf8")); }
  catch (_) { return { gasto_hoje_brl: 0, data: new Date().toISOString().slice(0, 10), chamadas: 0, por_modelo: {} }; }
}
function salvarEstado(s) {
  try { fs.writeFileSync(ESTADO_FILE, JSON.stringify(s, null, 2)); } catch (_) {}
}

function auth(req, res, next) {
  const a = req.headers.authorization || "";
  if (a !== `Bearer ${TOKEN}`) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

async function chamarOllama(prompt, opts) {
  const r = await axios.post(OLLAMA_URL, {
    model: OLLAMA_MODEL,
    messages: [{ role: "user", content: prompt }],
    stream: false,
    options: { temperature: opts.temperature || 0.5, num_predict: opts.max_tokens || 800 },
  }, { timeout: 60000 });
  return { texto: r.data.message.content, custo_brl: 0, provider: "ollama-local", modelo: OLLAMA_MODEL };
}

async function chamarClaude(prompt, opts) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY ausente");
  const r = await axios.post("https://api.anthropic.com/v1/messages", {
    model: "claude-sonnet-4-5",
    max_tokens: opts.max_tokens || 800,
    messages: [{ role: "user", content: prompt }],
  }, {
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    timeout: 30000,
  });
  const inp = r.data.usage.input_tokens, out = r.data.usage.output_tokens;
  const custo = (inp * 0.000003 + out * 0.000015) * 5.5;
  return { texto: r.data.content[0].text, custo_brl: custo, provider: "claude-api", modelo: "claude-sonnet-4-5", tokens: { in: inp, out } };
}

async function chamarGPT(prompt, opts) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY ausente");
  const r = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-4o-mini",
    max_tokens: opts.max_tokens || 800,
    messages: [{ role: "user", content: prompt }],
  }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 30000 });
  const inp = r.data.usage.prompt_tokens, out = r.data.usage.completion_tokens;
  const custo = (inp * 0.00000015 + out * 0.0000006) * 5.5;
  return { texto: r.data.choices[0].message.content, custo_brl: custo, provider: "openai", modelo: "gpt-4o-mini", tokens: { in: inp, out } };
}

async function chamarGemini(prompt, opts) {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY ausente");
  const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: opts.max_tokens || 800 },
  }, { timeout: 30000 });
  const texto = r.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const usage = r.data.usageMetadata || {};
  const custo = ((usage.promptTokenCount || 0) * 0.0000003 + (usage.candidatesTokenCount || 0) * 0.0000012) * 5.5;
  return { texto, custo_brl: custo, provider: "gemini", modelo: "gemini-2.5-flash", tokens: { in: usage.promptTokenCount, out: usage.candidatesTokenCount } };
}

function classificarComplexidade(prompt) {
  const t = prompt.toLowerCase();
  if (/(cfm|lgpd|jurid|adv|processo|peticao|contrato.*revisar|estrategia|copy.*venda|negocia.*complexa)/i.test(t)) return "alta";
  if (prompt.length > 500) return "media";
  if (/(diagnost|conduta|prescric|laudo)/i.test(t)) return "alta";
  return "baixa";
}

router.post("/chat", auth, async (req, res) => {
  try {
    const { prompt, prefer_model } = req.body || {};
    if (!prompt || typeof prompt !== "string") return res.status(400).json({ ok: false, error: "prompt ausente" });

    const estado = lerEstado();
    const hoje = new Date().toISOString().slice(0, 10);
    if (estado.data !== hoje) { estado.gasto_hoje_brl = 0; estado.data = hoje; estado.chamadas = 0; estado.por_modelo = {}; }
    const forceOllama = estado.gasto_hoje_brl >= LIMITE_DIA_BRL;

    let escolhido = prefer_model;
    if (!escolhido) {
      const cmplx = classificarComplexidade(prompt);
      if (forceOllama) escolhido = "ollama";
      else if (cmplx === "alta") escolhido = "claude";
      else if (cmplx === "media") escolhido = "gemini";
      else escolhido = "ollama";
    }
    if (forceOllama && escolhido !== "ollama") escolhido = "ollama";

    let resultado;
    try {
      if (escolhido === "claude") resultado = await chamarClaude(prompt, req.body);
      else if (escolhido === "gpt" || escolhido === "openai") resultado = await chamarGPT(prompt, req.body);
      else if (escolhido === "gemini") resultado = await chamarGemini(prompt, req.body);
      else resultado = await chamarOllama(prompt, req.body);
    } catch (e) {
      console.warn(`[agents-api] ${escolhido} falhou, fallback Ollama:`, e.message);
      resultado = await chamarOllama(prompt, req.body);
    }

    estado.chamadas++;
    estado.gasto_hoje_brl += resultado.custo_brl;
    estado.por_modelo[resultado.provider] = (estado.por_modelo[resultado.provider] || 0) + 1;
    salvarEstado(estado);

    res.json({
      ok: true,
      resposta: resultado.texto,
      provider: resultado.provider,
      modelo: resultado.modelo,
      custo_brl: Math.round(resultado.custo_brl * 10000) / 10000,
      gasto_hoje_brl: Math.round(estado.gasto_hoje_brl * 100) / 100,
      limite_dia_brl: LIMITE_DIA_BRL,
      tokens: resultado.tokens,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/status", (req, res) => {
  const estado = lerEstado();
  res.json({
    ok: true,
    estado,
    providers_disponiveis: {
      ollama: true,
      claude: Boolean(ANTHROPIC_KEY),
      gpt: Boolean(OPENAI_KEY),
      gemini: Boolean(GEMINI_KEY),
    },
    endpoints: {
      chat: "POST /api/agent/chat",
      status: "GET /api/agent/status",
    },
    auth: "Authorization: Bearer <AGENTS_API_TOKEN>",
  });
});

// Endpoint pra ChatGPT Custom GPT - schema OpenAPI
router.get("/openapi.json", (req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "HairTech Agents API", version: "1.0.0", description: "Ponte multi-agente pra Claude/GPT/Gemini/Ollama" },
    servers: [{ url: "https://hairtech.org/api/agent" }],
    paths: {
      "/chat": {
        post: {
          summary: "Conversar com IA multi-provider",
          operationId: "chatWithAI",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": {
              schema: {
                type: "object",
                required: ["prompt"],
                properties: {
                  prompt: { type: "string", description: "Pergunta ou tarefa pra IA" },
                  prefer_model: { type: "string", enum: ["ollama", "claude", "gpt", "gemini"], description: "Modelo preferido. Default: roteamento automatico" },
                  max_tokens: { type: "integer", default: 800 },
                  temperature: { type: "number", default: 0.5 },
                },
              },
            } },
          },
          responses: {
            200: { description: "Resposta IA", content: { "application/json": { schema: { type: "object" } } } },
          },
        },
      },
      "/status": {
        get: { summary: "Status da API e gasto diario", operationId: "getStatus", responses: { 200: { description: "OK" } } },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  });
});

module.exports = router;
