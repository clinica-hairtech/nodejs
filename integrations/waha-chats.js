// WAHA chats helper - lista conversas do WhatsApp pessoal do Dr. (mesma sessao da ANA)
// e classifica via heuristica: cobranca, paciente, fornecedor, pessoal.

const axios = require("axios");

const BASE_URL = (process.env.WAHA_BASE_URL || "http://whatsapp-ana:3000").replace(/\/$/, "");
const API_KEY = process.env.WAHA_API_KEY || process.env.WHATSAPP_ANA_KEY || "";
const SESSION = process.env.WAHA_SESSION || "default";

function headers() {
  return { "Content-Type": "application/json", "X-Api-Key": API_KEY };
}
async function http(method, path) {
  return axios({ method, url: `${BASE_URL}${path}`, headers: headers(), timeout: 30000, validateStatus: () => true });
}

async function listarChats(limit = 200) {
  const r = await http("get", `/api/${SESSION}/chats?limit=${limit}`);
  if (r.status >= 400) throw new Error(`WAHA chats ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  const lista = Array.isArray(r.data) ? r.data : (r.data.chats || r.data.data || []);
  return lista;
}

async function ultimasMensagens(chatId, limit = 5) {
  const r = await http("get", `/api/${SESSION}/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`);
  if (r.status >= 400) return [];
  const lista = Array.isArray(r.data) ? r.data : (r.data.messages || []);
  return lista;
}

// Heuristica de classificacao por texto
const PADROES = {
  cobranca: /\b(cobranca|cobrar|protesto|negociacao|debito|divida|atraso|inadimpl|serasa|spc|boleto vencido|cdc|finder|recupera|negocia\.?\.com)\b/i,
  paciente_transplante: /\b(transplante|fue|implante capilar|coroa|entradas|enxert|foliculos|calvic|paciente modelo)\b/i,
  paciente_mmp: /\b(mmp|mesoterapia|prp|microagulha|microinfus|tratamento capilar|queda capilar|alopecia)\b/i,
  agendamento: /\b(agendar|marcar|consulta|horario|hoje|amanha|sexta|quinta|reagendar|remarc)\b/i,
  fornecedor: /\b(fornecedor|compra|cotac|orcament|insumo|equipament|produto|fatura)\b/i,
  banco: /\b(banco|pix|transferencia|deposito|caixa|itau|bradesco|santander|inter|nubank|c6|mubank|infinity)\b/i,
};

function classificar(textos) {
  const t = textos.join(" ").toLowerCase();
  const tipos = [];
  for (const [tipo, rx] of Object.entries(PADROES)) {
    if (rx.test(t)) tipos.push(tipo);
  }
  return tipos.length === 0 ? ["pessoal_ou_outro"] : tipos;
}

async function auditarTudo({ limit = 200, comUltimas = true } = {}) {
  const chats = await listarChats(limit);
  const resultado = {
    total: chats.length,
    por_categoria: { cobranca: [], paciente_transplante: [], paciente_mmp: [], agendamento: [], fornecedor: [], banco: [], pessoal_ou_outro: [] },
    erros: [],
  };

  // limitar paralelismo
  const batches = [];
  for (let i = 0; i < chats.length; i += 10) batches.push(chats.slice(i, i + 10));

  for (const batch of batches) {
    await Promise.all(batch.map(async (chat) => {
      try {
        const chatId = chat.id?._serialized || chat.id;
        if (!chatId || chatId.endsWith("@g.us")) return; // pula grupos
        const nome = chat.name || chat.subject || chatId;
        let msgs = [];
        if (comUltimas) {
          msgs = await ultimasMensagens(chatId, 5);
        }
        const textos = [nome, ...(msgs.map(m => m.body || m.text || "")).filter(Boolean)];
        const tipos = classificar(textos);
        for (const tipo of tipos) {
          resultado.por_categoria[tipo] = resultado.por_categoria[tipo] || [];
          resultado.por_categoria[tipo].push({
            chat_id: chatId,
            nome,
            numero: chatId.replace(/@.*$/, ""),
            ultima_msg_preview: (msgs[0]?.body || msgs[0]?.text || "").substring(0, 120),
            tipos,
          });
        }
      } catch (e) {
        resultado.erros.push({ chat: chat.id, erro: e.message });
      }
    }));
  }
  return resultado;
}

module.exports = { listarChats, ultimasMensagens, classificar, auditarTudo };
