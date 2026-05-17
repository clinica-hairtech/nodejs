// InfinityPay integration skeleton - HairTech 17/05/2026
//
// Dr. Ricardo TEM conta PJ InfinityPay. Falta:
//   INFINITYPAY_HANDLE - InfiniteTag (ex: clinicahairtech)
//   INFINITYPAY_WEBHOOK_SECRET - configurado em painel.infinitypay.io
//
// Endpoint Checkout (cria link Pix):
//   POST https://api.checkout.infinitepay.io/links
// Webhook recebimento:
//   POST /webhooks/infinitypay -> validacao HMAC + idempotencia por transaction_nsu

const axios = require("axios");
const crypto = require("crypto");

const HANDLE = process.env.INFINITYPAY_HANDLE || "";
const WEBHOOK_SECRET = process.env.INFINITYPAY_WEBHOOK_SECRET || "";
const CHECKOUT_API = "https://api.checkout.infinitepay.io";

function isConfigured() {
  return !!(HANDLE && WEBHOOK_SECRET);
}

async function criarLinkPix({ valor, descricao, telefone, nomePaciente, cpfPaciente, externalId }) {
  if (!isConfigured()) {
    return { ok: false, mode: "placeholder", message: "InfinityPay nao configurado" };
  }
  const payload = {
    handle: HANDLE,
    amount: Math.round(valor * 100), // centavos
    description: descricao,
    customer: {
      name: nomePaciente,
      tax_id: cpfPaciente.replace(/\D/g, ""),
      phone: telefone.replace(/\D/g, "")
    },
    payment_methods: ["pix"],
    expires_in: 3600, // 1 hora
    webhook_url: "https://hairtech.org/webhooks/infinitypay",
    external_id: externalId || crypto.randomUUID()
  };
  const resp = await axios.post(`${CHECKOUT_API}/links`, payload, {
    timeout: 15000,
    headers: { "Content-Type": "application/json" }
  });
  return {
    ok: true,
    link_pagamento: resp.data.url,
    invoice_slug: resp.data.invoice_slug,
    external_id: payload.external_id,
    expires_at: resp.data.expires_at
  };
}

// Valida assinatura HMAC do webhook + idempotencia
function validarWebhook(rawBody, signature) {
  if (!WEBHOOK_SECRET) return false;
  const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch (_) { return false; }
}

function parsePaymentEvent(body) {
  return {
    transaction_nsu: body.transaction_nsu || body.tid || body.id,
    valor: body.amount ? body.amount / 100 : null,
    status: body.status,
    pago_em: body.paid_at ? new Date(body.paid_at) : null,
    receipt_url: body.receipt_url || body.url,
    external_id: body.external_id,
    payer_cpf: body.customer?.tax_id
  };
}

module.exports = {
  isConfigured,
  criarLinkPix,
  validarWebhook,
  parsePaymentEvent,
  status: () => ({
    configured: isConfigured(),
    handle: HANDLE || "(nao configurado)",
    missing: [
      !HANDLE && "INFINITYPAY_HANDLE",
      !WEBHOOK_SECRET && "INFINITYPAY_WEBHOOK_SECRET"
    ].filter(Boolean)
  })
};
