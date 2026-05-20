// Dual-AI consult: pergunta vai pra Claude (Anthropic) + ChatGPT (OpenAI) em paralelo,
// depois um sintetizador analisa as duas respostas e retorna consenso/divergencia.
// Pra decisoes criticas: copy de venda, validacao CFM, casos eticos, etc.

const axios = require("axios");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Optional: ChatGPT com web search (Responses API, 2025+)
const CHATGPT_USE_WEB_SEARCH = process.env.CHATGPT_USE_WEB_SEARCH === "1";

async function chamarClaude(prompt, opts = {}) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY ausente");
  const r = await axios.post("https://api.anthropic.com/v1/messages", {
    model: opts.model || "claude-sonnet-4-5",
    max_tokens: opts.maxTokens || 1500,
    messages: [{ role: "user", content: prompt }],
    system: opts.system || undefined,
  }, {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    timeout: opts.timeout || 60000,
  });
  return {
    modelo: r.data.model,
    texto: r.data.content?.[0]?.text || "",
    tokens_in: r.data.usage?.input_tokens || 0,
    tokens_out: r.data.usage?.output_tokens || 0,
  };
}

async function chamarChatGPT(prompt, opts = {}) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
  // Se CHATGPT_USE_WEB_SEARCH=1, usa Responses API com tool web_search
  if (CHATGPT_USE_WEB_SEARCH) {
    try {
      const r = await axios.post("https://api.openai.com/v1/responses", {
        model: opts.model || "gpt-4o",
        input: prompt,
        instructions: opts.system,
        tools: [{ type: "web_search" }],
      }, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        timeout: opts.timeout || 90000,
      });
      const texto = r.data.output?.find(o => o.type === "message")?.content?.[0]?.text || JSON.stringify(r.data).slice(0, 500);
      return { modelo: opts.model || "gpt-4o", texto, web_search_usado: true };
    } catch (e) {
      console.warn("[dual-ai] Responses API falhou, caindo pro chat completions:", e.message);
    }
  }
  // Fallback: chat completions classico
  const messages = opts.system
    ? [{ role: "system", content: opts.system }, { role: "user", content: prompt }]
    : [{ role: "user", content: prompt }];
  const r = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: opts.model || "gpt-4o",
    messages,
    max_tokens: opts.maxTokens || 1500,
  }, {
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    timeout: opts.timeout || 60000,
  });
  return {
    modelo: r.data.model,
    texto: r.data.choices?.[0]?.message?.content || "",
    tokens_in: r.data.usage?.prompt_tokens || 0,
    tokens_out: r.data.usage?.completion_tokens || 0,
  };
}

async function sintetizar(pergunta, respClaude, respChatGPT) {
  const prompt = `Voce e um analisador critico. Recebi duas respostas independentes pra mesma pergunta. Analise convergencia, divergencia e me da uma sintese pratica.

PERGUNTA:
${pergunta}

RESPOSTA CLAUDE (Anthropic):
${respClaude.texto || "(falhou)"}

RESPOSTA CHATGPT (OpenAI):
${respChatGPT.texto || "(falhou)"}

ANALISE:
1. Em que os dois CONCORDAM (consenso forte)
2. Em que DIVERGEM (e qual lado tem mais razao tecnica/etica)
3. RECOMENDACAO PRATICA - o que o Dr. Ricardo deve fazer
4. RISCOS se seguir cada lado

Tom: direto, sem floreio. Maximo 300 palavras.`;

  try { return (await chamarClaude(prompt, { maxTokens: 800 })).texto; }
  catch (_) {
    try { return (await chamarChatGPT(prompt, { maxTokens: 800 })).texto; }
    catch (e) { return "Sintese falhou: " + e.message; }
  }
}

async function consultar(pergunta, contexto = "") {
  const prompt = contexto ? `${contexto}\n\n${pergunta}` : pergunta;
  const [claudeResult, gptResult] = await Promise.allSettled([
    chamarClaude(prompt),
    chamarChatGPT(prompt),
  ]);
  const respClaude = claudeResult.status === "fulfilled"
    ? claudeResult.value
    : { texto: "", erro: claudeResult.reason?.message || "falhou" };
  const respChatGPT = gptResult.status === "fulfilled"
    ? gptResult.value
    : { texto: "", erro: gptResult.reason?.message || "falhou" };

  let sintese = "";
  if (respClaude.texto && respChatGPT.texto) {
    sintese = await sintetizar(pergunta, respClaude, respChatGPT);
  } else if (respClaude.texto) {
    sintese = "ChatGPT falhou - apenas resposta Claude disponivel.";
  } else if (respChatGPT.texto) {
    sintese = "Claude falhou - apenas resposta ChatGPT disponivel.";
  } else {
    sintese = "Ambos modelos falharam.";
  }

  return { pergunta, claude: respClaude, chatgpt: respChatGPT, sintese, timestamp: new Date().toISOString() };
}

function status() {
  return {
    claude_configurado: Boolean(ANTHROPIC_API_KEY),
    chatgpt_configurado: Boolean(OPENAI_API_KEY),
    chatgpt_web_search: CHATGPT_USE_WEB_SEARCH,
  };
}

module.exports = { consultar, chamarClaude, chamarChatGPT, sintetizar, status };
