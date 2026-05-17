// Asaas integration skeleton - HairTech 17/05/2026
//
// Asaas: ideal para Pix Automatico MMP (6 sessoes recorrente R$2.500-5.400)
// URL: https://www.asaas.com
// Conta PJ gratis. CNPJ 49.634.881/0001-91.
//
// Quando aprovado, var no .env:
//   ASAAS_API_KEY = $aact_xxxxxxxxxxxxx
//   ASAAS_WEBHOOK_TOKEN = qualquer string secret
//   ASAAS_ENV = production (ou sandbox pra testes)

const axios = require("axios");

const API_KEY = process.env.ASAAS_API_KEY || "";
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || "";
const BASE_URL = (process.env.ASAAS_ENV || "production") === "sandbox"
  ? "https://sandbox.asaas.com/api/v3"
  : "https://www.asaas.com/api/v3";

function isConfigured() { return !!API_KEY; }

async function criarAssinaturaRecorrente({ nomePaciente, cpf, email, valor, cycle, descricao, dueDay }) {
  if (!isConfigured()) return { ok: false, mode: "placeholder" };
  // 1. Cria customer
  const cust = await axios.post(`${BASE_URL}/customers`, {
    name: nomePaciente, cpfCnpj: cpf.replace(/\D/g, ""), email
  }, { headers: { access_token: API_KEY }, timeout: 15000 });
  // 2. Cria subscription
  const sub = await axios.post(`${BASE_URL}/subscriptions`, {
    customer: cust.data.id,
    billingType: "PIX",
    value: valor,
    nextDueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    cycle: cycle || "MONTHLY",
    description: descricao
  }, { headers: { access_token: API_KEY }, timeout: 15000 });
  return { ok: true, customer_id: cust.data.id, subscription_id: sub.data.id };
}

function validarWebhook(token) {
  return !!WEBHOOK_TOKEN && token === WEBHOOK_TOKEN;
}

module.exports = {
  isConfigured,
  criarAssinaturaRecorrente,
  validarWebhook,
  status: () => ({ configured: isConfigured(), env: process.env.ASAAS_ENV || "production", missing: !API_KEY ? ["ASAAS_API_KEY"] : [] })
};
