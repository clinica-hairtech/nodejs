// Feegow integration skeleton - HairTech 17/05/2026
//
// Dr. Ricardo precisa contratar Feegow Pro R$149/mes.
// URL: https://feegow.com/planos
// Tel: 0800 722 9500
// Ativar: API access + Memed integration nativa
//
// Quando contratado, vars no .env:
//   FEEGOW_API_KEY
//   FEEGOW_WEBHOOK_SECRET
//   FEEGOW_BASE_URL = https://api.feegow.com/v1 (default)
//
// Webhook recebe: paciente.criado, consulta.realizada, procedimento.realizado, pagamento.confirmado

const axios = require("axios");
const crypto = require("crypto");

const API_KEY = process.env.FEEGOW_API_KEY || "";
const WEBHOOK_SECRET = process.env.FEEGOW_WEBHOOK_SECRET || "";
const BASE_URL = process.env.FEEGOW_BASE_URL || "https://api.feegow.com/v1";

function isConfigured() {
  return !!(API_KEY && WEBHOOK_SECRET);
}

async function buscarPaciente(cpf) {
  if (!isConfigured()) return { ok: false, mode: "placeholder" };
  const resp = await axios.get(`${BASE_URL}/patient/search`, {
    params: { cpf: cpf.replace(/\D/g, "") },
    headers: { "x-access-token": API_KEY },
    timeout: 15000
  });
  return { ok: true, paciente: resp.data };
}

async function criarPaciente({ nome, cpf, telefone, email, dataNascimento }) {
  if (!isConfigured()) return { ok: false, mode: "placeholder" };
  const resp = await axios.post(`${BASE_URL}/patient/create`, {
    nome, cpf: cpf.replace(/\D/g, ""), celular: telefone, email,
    data_nascimento: dataNascimento
  }, {
    headers: { "x-access-token": API_KEY },
    timeout: 15000
  });
  return { ok: true, feegow_id: resp.data.id };
}

function validarWebhook(rawBody, signature) {
  if (!WEBHOOK_SECRET) return false;
  const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature)); }
  catch (_) { return false; }
}

module.exports = {
  isConfigured,
  buscarPaciente,
  criarPaciente,
  validarWebhook,
  status: () => ({
    configured: isConfigured(),
    base_url: BASE_URL,
    missing: [!API_KEY && "FEEGOW_API_KEY", !WEBHOOK_SECRET && "FEEGOW_WEBHOOK_SECRET"].filter(Boolean)
  })
};
