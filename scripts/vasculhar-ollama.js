// Vasculhador noturno via Ollama local (custo ZERO).
// Roda em background, processa em batch, escreve resultado em data/vasculhamento.json
//
// O que faz:
// 1. Le conversas (DB + WhatsApp pessoal via WAHA)
// 2. Pra cada conversa: Ollama analisa e classifica
//    - tipo: paciente_quente | paciente_morno | cobranca | fornecedor | esquecido | spam
//    - resumo 1 linha
//    - proxima_acao recomendada
// 3. Identifica padroes globais:
//    - leads que pediram preco mas nao fecharam
//    - pacientes que sumiram depois de algo critico
//    - cobrancas tentando entrar em contato
// 4. Gera relatorio final salvo em data/vasculhamento.json
// 5. Envia Telegram quando termina

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const OLLAMA_URL = (process.env.OLLAMA_BASE_URL || "http://ollama:11434") + "/api/chat";
const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";
const WAHA_BASE = (process.env.WAHA_BASE_URL || "http://whatsapp-ana:3000").replace(/\/$/, "");
const WAHA_KEY = process.env.WAHA_API_KEY || process.env.WHATSAPP_ANA_KEY || "";
const WAHA_SESSION = process.env.WAHA_SESSION || "default";

const OUTPUT = path.join(__dirname, "..", "data", "vasculhamento.json");

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "8713631351";

async function telegram(text) {
  return axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    chat_id: TG_CHAT, text: text.slice(0, 4000),
  }, { timeout: 5000 }).catch(() => {});
}

async function ollamaChat(prompt) {
  const r = await axios.post(OLLAMA_URL, {
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    stream: false,
    format: "json",
    options: { temperature: 0.3, num_predict: 300 },
  }, { timeout: 60000 });
  try { return JSON.parse(r.data.message.content); }
  catch (_) { return { _raw: r.data.message.content }; }
}

async function listarChatsWAHA(limit = 200) {
  if (!WAHA_KEY) return [];
  try {
    const r = await axios.get(`${WAHA_BASE}/api/${WAHA_SESSION}/chats?limit=${limit}`, {
      headers: { "X-Api-Key": WAHA_KEY }, timeout: 30000,
    });
    return Array.isArray(r.data) ? r.data : (r.data.chats || r.data.data || []);
  } catch (e) { return []; }
}

async function ultimasMsgsWAHA(chatId) {
  try {
    const r = await axios.get(`${WAHA_BASE}/api/${WAHA_SESSION}/chats/${encodeURIComponent(chatId)}/messages?limit=10`, {
      headers: { "X-Api-Key": WAHA_KEY }, timeout: 15000,
    });
    const lista = Array.isArray(r.data) ? r.data : (r.data.messages || []);
    return lista.map(m => ({
      from_me: m.fromMe || m.from_me,
      body: m.body || m.text || "",
      ts: m.timestamp,
    })).slice(0, 10);
  } catch (e) { return []; }
}

async function analisarChat(nome, numero, msgs) {
  const dialog = msgs.map(m => `${m.from_me ? "Dr.Ricardo" : "Pessoa"}: ${(m.body || "").substring(0, 200)}`).join("\n");
  const prompt = `Analise este historico de WhatsApp e retorne JSON.

Contato: ${nome || "(sem nome)"} (+${numero})
Conversa (max 10 ultimas msgs):
${dialog || "(sem msgs)"}

Retorne JSON com:
{
  "categoria": "paciente_transplante|paciente_mmp|paciente_outro|cobranca_divida|fornecedor|familia_amigo|spam_marketing|esquecido_importante|outro",
  "interesse": "alto|medio|baixo|nenhum",
  "ultima_acao_dr": "responder|aguardar|enviar_contrato|enviar_pix|ligar|nada",
  "resumo_1linha": "um resumo curto em ate 80 caracteres",
  "alerta": "frase curta SOMENTE se tiver algo critico (esquecido ha tempo / cobranca dura / oportunidade perdida), senao string vazia",
  "prioridade": "P0|P1|P2|P3"
}

NAO inclua texto fora do JSON.`;
  return await ollamaChat(prompt);
}

async function main() {
  const inicio = Date.now();
  await telegram("🤖 Vasculhador Ollama iniciado. Processando conversas em background.");

  const chats = await listarChatsWAHA(200);
  console.log(`[vasculhar] ${chats.length} chats do WhatsApp pessoal`);

  const resultados = [];
  const erros = [];
  let processados = 0;

  for (const chat of chats) {
    const chatId = chat.id?._serialized || chat.id;
    if (!chatId || chatId.endsWith("@g.us")) continue;
    const numero = chatId.replace(/@.*$/, "");
    const nome = chat.name || chat.subject || numero;

    try {
      const msgs = await ultimasMsgsWAHA(chatId);
      if (msgs.length === 0) continue;
      const analise = await analisarChat(nome, numero, msgs);
      resultados.push({
        numero,
        nome,
        msgs_analisadas: msgs.length,
        ultima_msg_iso: msgs[0]?.ts ? new Date(msgs[0].ts * 1000).toISOString() : null,
        ...analise,
      });
      processados++;
      // Update incremental do arquivo a cada 5 análises (caso crash)
      if (processados % 5 === 0) {
        fs.writeFileSync(OUTPUT, JSON.stringify({
          em_andamento: true,
          processados,
          total_alvo: chats.length,
          inicio_iso: new Date(inicio).toISOString(),
          resultados,
        }, null, 2));
      }
    } catch (e) {
      erros.push({ numero, erro: e.message });
      console.error(`[vasculhar] falha ${numero}:`, e.message);
    }
  }

  // Agregacoes
  const porCategoria = {};
  const alertas = [];
  const p0_p1 = [];
  for (const r of resultados) {
    porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + 1;
    if (r.alerta && r.alerta.length > 0) alertas.push({ numero: r.numero, nome: r.nome, alerta: r.alerta });
    if (r.prioridade === "P0" || r.prioridade === "P1") p0_p1.push(r);
  }

  const final = {
    em_andamento: false,
    inicio_iso: new Date(inicio).toISOString(),
    fim_iso: new Date().toISOString(),
    duracao_min: Math.round((Date.now() - inicio) / 60000),
    total_chats: chats.length,
    processados,
    erros: erros.length,
    por_categoria: porCategoria,
    alertas_criticos: alertas,
    prioridade_alta: p0_p1,
    todos_resultados: resultados,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(final, null, 2));

  const resumoTG = [
    "🤖 *Vasculhador Ollama finalizado*",
    `Duracao: ${final.duracao_min}min`,
    `Processados: ${processados}/${chats.length}`,
    "",
    "*Por categoria:*",
    ...Object.entries(porCategoria).map(([cat, q]) => `- ${cat}: ${q}`),
    "",
    `*Alertas criticos:* ${alertas.length}`,
    `*Prioridade alta (P0/P1):* ${p0_p1.length}`,
    "",
    "Ver: https://hairtech.org/admin/vasculhamento",
  ].join("\n");

  await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    chat_id: TG_CHAT, text: resumoTG.slice(0, 4000), parse_mode: "Markdown",
  }, { timeout: 5000 }).catch(() => {});

  console.log("[vasculhar] FIM");
}

main().catch(async e => {
  console.error("[vasculhar] fatal:", e);
  await telegram(`❌ Vasculhador Ollama crashou: ${e.message}`);
  process.exit(1);
});
