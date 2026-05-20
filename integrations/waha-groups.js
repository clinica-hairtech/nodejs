// Gerencia grupos via WAHA WEBJS (ANA).
// Como ANA usa mesma sessao do WhatsApp pessoal do Dr. (5521967813366),
// ela tem acesso aos mesmos grupos e pode adicionar/gerar invite link.
//
// CAVEATS:
// - Adicao direta SO funciona se a pessoa tem privacidade=Todos (muitas tem=Contatos)
// - WhatsApp pode rate-limit ou banir conta se mass-add for abusivo (>50/dia agressivo)
// - Recomendado: usar invite link em vez de adicao direta sempre que possivel

const axios = require("axios");

const BASE_URL = (process.env.WAHA_BASE_URL || "http://whatsapp-ana:3000").replace(/\/$/, "");
const API_KEY = process.env.WAHA_API_KEY || process.env.WHATSAPP_ANA_KEY || "";
const SESSION = process.env.WAHA_SESSION || "default";

function headers() {
  return { "Content-Type": "application/json", "X-Api-Key": API_KEY };
}

async function http(method, path, data) {
  return axios({
    method,
    url: `${BASE_URL}${path}`,
    headers: headers(),
    data,
    timeout: 15000,
    validateStatus: () => true,
  });
}

async function listarGrupos() {
  const r = await http("get", `/api/${SESSION}/groups`);
  if (r.status >= 400) throw new Error(`WAHA listGroups ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}

async function infoGrupo(groupId) {
  const r = await http("get", `/api/${SESSION}/groups/${encodeURIComponent(groupId)}`);
  if (r.status >= 400) throw new Error(`WAHA group info ${r.status}`);
  return r.data;
}

async function inviteCodeGrupo(groupId) {
  // GET invite code (string short)
  const r = await http("get", `/api/${SESSION}/groups/${encodeURIComponent(groupId)}/invite-code`);
  if (r.status >= 400) {
    // tenta endpoint alternativo
    const r2 = await http("get", `/api/${SESSION}/groups/${encodeURIComponent(groupId)}/invite`);
    if (r2.status < 400) return r2.data;
    throw new Error(`WAHA invite ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  }
  return r.data;
}

async function buscarGrupoPorNome(nome) {
  const grupos = await listarGrupos();
  const lista = Array.isArray(grupos) ? grupos : (grupos.groups || grupos.data || []);
  const alvo = lista.find(g => {
    const n = (g.subject || g.name || g.title || "").toLowerCase();
    return n.includes(nome.toLowerCase());
  });
  return alvo || null;
}

async function adicionarParticipante(groupId, numeros) {
  // numeros: array de strings tipo "5521987654321" (sem + nem @c.us)
  const participants = numeros.map(n => {
    const limpo = String(n).replace(/\D/g, "");
    return limpo.endsWith("@c.us") ? limpo : `${limpo}@c.us`;
  });
  const r = await http("post", `/api/${SESSION}/groups/${encodeURIComponent(groupId)}/participants/add`, {
    participants,
  });
  if (r.status >= 400) throw new Error(`WAHA addParticipant ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
}

async function obterLinkConvite(groupId) {
  const code = await inviteCodeGrupo(groupId);
  const codeStr = typeof code === "string" ? code : (code.code || code.inviteCode || code.invite_code || JSON.stringify(code));
  return {
    code: codeStr,
    url: codeStr.startsWith("http") ? codeStr : `https://chat.whatsapp.com/${codeStr.replace(/^https?:\/\/chat\.whatsapp\.com\//, "")}`,
  };
}

function status() {
  return {
    base_url: BASE_URL,
    session: SESSION,
    api_key_present: Boolean(API_KEY),
  };
}

module.exports = {
  listarGrupos, infoGrupo, inviteCodeGrupo, buscarGrupoPorNome,
  adicionarParticipante, obterLinkConvite, status,
};
