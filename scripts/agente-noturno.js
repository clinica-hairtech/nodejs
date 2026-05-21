// Agente noturno 24/7 — roda dentro do container AV na VPS.
// Escuta Telegram do Dr. + cron interno + fila de tarefas.
// Decide quando usar Ollama local (R$0) vs API paga (Claude/GPT).
//
// REGRA DE OURO: economizar credito.
// - Tarefas triviais (sumarizar, classificar, extrair): Ollama local
// - Tarefas com raciocinio profundo: Claude/GPT API com prompt MINIMO
// - Tarefas com input grande: NUNCA passa o input inteiro pra Claude/GPT,
//   sempre passa snippet ou usa Ollama pra pre-processar

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "8713631351";
const OLLAMA_URL = (process.env.OLLAMA_BASE_URL || "http://ollama:11434") + "/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

const FILA_TAREFAS = path.join(__dirname, "..", "data", "agente-noturno-fila.json");
const ESTADO = path.join(__dirname, "..", "data", "agente-noturno-estado.json");

const LIMITE_CREDITO_DIA_BRL = parseFloat(process.env.AGENTE_LIMITE_DIA || "5"); // max R$5/dia

function lerEstado() {
  try { return JSON.parse(fs.readFileSync(ESTADO, "utf8")); }
  catch (_) { return { gasto_hoje_brl: 0, data: new Date().toISOString().slice(0, 10), iniciado_em: null, tarefas_executadas: 0 }; }
}

function salvarEstado(s) { fs.writeFileSync(ESTADO, JSON.stringify(s, null, 2)); }

function lerFila() {
  try { return JSON.parse(fs.readFileSync(FILA_TAREFAS, "utf8")); }
  catch (_) { return []; }
}

function salvarFila(f) { fs.writeFileSync(FILA_TAREFAS, JSON.stringify(f, null, 2)); }

async function telegram(text) {
  return axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    chat_id: TG_CHAT, text: text.slice(0, 4000),
  }, { timeout: 5000 }).catch(() => {});
}

// Ollama local (custo zero)
async function ollama(prompt, opts = {}) {
  const r = await axios.post(OLLAMA_URL, {
    model: OLLAMA_MODEL,
    messages: [{ role: "user", content: prompt }],
    stream: false,
    options: { temperature: opts.temperature || 0.3, num_predict: opts.maxTokens || 400 },
  }, { timeout: 60000 });
  return r.data.message.content;
}

// Claude API (custo controlado)
async function claude(prompt, opts = {}) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY ausente");
  const r = await axios.post("https://api.anthropic.com/v1/messages", {
    model: "claude-sonnet-4-5",
    max_tokens: opts.maxTokens || 500,
    messages: [{ role: "user", content: prompt }],
  }, {
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    timeout: 30000,
  });
  // Custo estimado: ~$0.003 input + $0.015 output per 1k tokens = ~R$0.05 por chamada media
  const tokens_in = r.data.usage.input_tokens;
  const tokens_out = r.data.usage.output_tokens;
  const custo_brl = (tokens_in * 0.000003 + tokens_out * 0.000015) * 5.5;
  return { texto: r.data.content[0].text, custo_brl };
}

// GPT API (custo controlado)
async function gpt(prompt, opts = {}) {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY ausente");
  const r = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-4o-mini",
    max_tokens: opts.maxTokens || 500,
    messages: [{ role: "user", content: prompt }],
  }, {
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    timeout: 30000,
  });
  const tokens_in = r.data.usage.prompt_tokens;
  const tokens_out = r.data.usage.completion_tokens;
  const custo_brl = (tokens_in * 0.00000015 + tokens_out * 0.0000006) * 5.5;
  return { texto: r.data.choices[0].message.content, custo_brl };
}

// Decide qual modelo usar baseado em complexidade da tarefa
async function pensar(tarefa, opts = {}) {
  const estado = lerEstado();

  // Se passou do limite, FORÇA Ollama
  const forceOllama = estado.gasto_hoje_brl >= LIMITE_CREDITO_DIA_BRL;

  if (opts.complexidade === "alta" && !forceOllama) {
    try {
      const r = await claude(tarefa, opts);
      estado.gasto_hoje_brl += r.custo_brl;
      salvarEstado(estado);
      return { texto: r.texto, provider: "claude", custo_brl: r.custo_brl };
    } catch (e) {
      console.warn("[agente-noturno] Claude falhou, fallback Ollama:", e.message);
    }
  }

  // Ollama (default)
  try {
    const t = await ollama(tarefa, opts);
    return { texto: t, provider: "ollama-local", custo_brl: 0 };
  } catch (e) {
    // Ollama falhou, tenta GPT como ultimo recurso
    if (!forceOllama && OPENAI_KEY) {
      const r = await gpt(tarefa, opts);
      estado.gasto_hoje_brl += r.custo_brl;
      salvarEstado(estado);
      return { texto: r.texto, provider: "gpt-fallback", custo_brl: r.custo_brl };
    }
    throw e;
  }
}

// Pega mensagens novas do Telegram (long poll)
let lastUpdateId = 0;
async function pegarMensagensTelegram() {
  try {
    const r = await axios.get(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 25, allowed_updates: JSON.stringify(["message"]) },
      timeout: 30000,
    });
    const updates = r.data.result || [];
    for (const u of updates) {
      lastUpdateId = u.update_id;
      const msg = u.message;
      if (!msg || msg.chat.id.toString() !== TG_CHAT) continue;
      const texto = msg.text || "";
      if (texto.startsWith("/")) {
        await processarComando(texto);
      } else {
        await processarMensagem(texto);
      }
    }
  } catch (e) {
    if (!e.message.includes("timeout")) console.error("[agente-noturno] poll:", e.message);
  }
}

async function processarComando(texto) {
  const [cmd, ...args] = texto.trim().split(/\s+/);
  switch (cmd.toLowerCase()) {
    case "/status":
      const estado = lerEstado();
      const fila = lerFila();
      await telegram(`📊 Agente noturno\n\nGasto hoje: R$ ${estado.gasto_hoje_brl.toFixed(3)} / R$ ${LIMITE_CREDITO_DIA_BRL}\nTarefas executadas: ${estado.tarefas_executadas}\nFila pendente: ${fila.length}\nIniciado: ${estado.iniciado_em}`);
      break;
    case "/parar":
      await telegram("🛑 Agente noturno: comando /parar recebido. Encerrando.");
      process.exit(0);
      break;
    case "/limite":
      const novo = parseFloat(args[0]);
      if (novo > 0) {
        process.env.AGENTE_LIMITE_DIA = novo.toString();
        await telegram(`✅ Limite diario alterado pra R$ ${novo}`);
      }
      break;
    case "/ajuda":
      await telegram("📚 Comandos:\n/status\n/parar\n/limite <valor>\n/ajuda\n\nOu manda mensagem natural pra eu pensar.");
      break;
    default:
      await telegram(`Comando ${cmd} nao reconhecido. /ajuda`);
  }
}

async function processarMensagem(texto) {
  if (texto.length < 5) return;
  try {
    // Detecta se eh tarefa complexa pela palavra-chave
    const complexa = /(decidir|estrategi|cfm|lgpd|jurid|critico|copy|negociar)/i.test(texto);
    await telegram(`🤖 Pensando... (${complexa ? "Claude" : "Ollama local"})`);

    const r = await pensar(texto, {
      complexidade: complexa ? "alta" : "normal",
      maxTokens: 500,
    });

    const estado = lerEstado();
    estado.tarefas_executadas++;
    salvarEstado(estado);

    await telegram(`✅ ${r.provider} (R$ ${r.custo_brl.toFixed(4)}):\n\n${r.texto.slice(0, 3500)}`);
  } catch (e) {
    await telegram(`❌ Falhou: ${e.message}`);
  }
}

async function main() {
  const estado = lerEstado();
  // Reset diario do gasto
  const hoje = new Date().toISOString().slice(0, 10);
  if (estado.data !== hoje) {
    estado.gasto_hoje_brl = 0;
    estado.data = hoje;
    estado.tarefas_executadas = 0;
  }
  estado.iniciado_em = new Date().toISOString();
  salvarEstado(estado);

  await telegram(`🌙 Agente noturno HairTech iniciado.\n\nLimite diario: R$ ${LIMITE_CREDITO_DIA_BRL}\nGasto hoje ate agora: R$ ${estado.gasto_hoje_brl.toFixed(3)}\n\nComandos:\n/status\n/ajuda\n\nOu manda mensagem natural.\n\nUso Ollama local primeiro (R$0). Claude/GPT so quando essencial.`);

  // Loop principal
  while (true) {
    await pegarMensagensTelegram();
    await new Promise(r => setTimeout(r, 1000));
  }
}

main().catch(async e => {
  console.error("[agente-noturno] fatal:", e);
  await telegram(`❌ Agente noturno crashou: ${e.message}`);
  process.exit(1);
});
