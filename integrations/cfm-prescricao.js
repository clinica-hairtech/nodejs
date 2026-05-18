// CFM Prescricao Eletronica Nacional - componente embarcado oficial.
// Backend gera token client_credentials (cache 4min, compartilhado entre usuarios).
// Frontend (admin.js /admin/prontuario) embarca iframe que medico autentica direto no CFM.
//
// Ativacao:
// 1. Solicitar credenciais em https://sistemas.cfm.org.br/contatoprescricaoeletronica/br
// 2. Receber CFM_CLIENT_ID + CFM_CLIENT_SECRET (homologacao primeiro, depois producao)
// 3. Adicionar ao .env:
//    CFM_CLIENT_ID=...
//    CFM_CLIENT_SECRET=...
//    CFM_AMBIENTE=HOMOLOGACAO  (depois PRODUCAO)

const axios = require("axios");

const CLIENT_ID = process.env.CFM_CLIENT_ID || "";
const CLIENT_SECRET = process.env.CFM_CLIENT_SECRET || "";
const AMBIENTE = (process.env.CFM_AMBIENTE || "HOMOLOGACAO").toUpperCase();

const IAM_URL = AMBIENTE === "PRODUCAO"
  ? "https://prescricao.cfm.org.br/auth/realms/prescricao/protocol/openid-connect/token"
  : "https://prescricao-hml.cfm.org.br/auth/realms/prescricao/protocol/openid-connect/token";

let cachedToken = null;
let cachedAt = 0;
const TOKEN_TTL_MS = 4 * 60 * 1000; // 4 minutos (CFM recomenda compartilhar entre usuarios)

function configured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

async function obterToken() {
  if (!configured()) throw new Error("CFM credenciais ausentes");
  if (cachedToken && (Date.now() - cachedAt) < TOKEN_TTL_MS) return cachedToken;

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "openid",
  });
  const r = await axios.post(IAM_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000,
  });
  cachedToken = r.data.access_token;
  cachedAt = Date.now();
  return cachedToken;
}

function status() {
  return {
    configurado: configured(),
    ambiente: AMBIENTE,
    token_em_cache: Boolean(cachedToken && (Date.now() - cachedAt) < TOKEN_TTL_MS),
    cache_age_ms: cachedToken ? Date.now() - cachedAt : null,
  };
}

module.exports = { obterToken, configured, status, AMBIENTE };
