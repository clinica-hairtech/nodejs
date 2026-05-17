// DocuSign integration skeleton - HairTech 17/05/2026
//
// 3 IDs JA obtidos (Dr. Ricardo passou em chat):
//   DOCUSIGN_USER_ID    = 738dbaca-7f65-4ec3-a7af-8710e3af60a6
//   DOCUSIGN_ACCOUNT_ID = cb744268-60a3-4585-b1d4-b582a1cc47aa
//   DOCUSIGN_BASE_URI   = https://na4.docusign.net
//
// 3 secrets faltando (Dr. Ricardo gera em admin.docusign.com):
//   DOCUSIGN_INTEGRATION_KEY    - Apps and Keys
//   DOCUSIGN_RSA_PRIVATE_KEY_BASE64 - mesmo painel, RSA Keypair gerada
//   DOCUSIGN_HMAC_SECRET        - Connect -> Custom -> HMAC
//   DOCUSIGN_TEMPLATE_ID_FUE    - Templates -> Contrato FUE
//
// Quando todos os 6 estiverem no .env, este modulo ativa.
// Fluxo: bot detecta lead -> chama enviarContratoFUE() ->
// DocuSign envia link WhatsApp -> paciente assina -> webhook /webhooks/docusign
// -> trigger Pix InfinityPay

const axios = require("axios");
const crypto = require("crypto");

const USER_ID = process.env.DOCUSIGN_USER_ID || "738dbaca-7f65-4ec3-a7af-8710e3af60a6";
const ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID || "cb744268-60a3-4585-b1d4-b582a1cc47aa";
const BASE_URI = process.env.DOCUSIGN_BASE_URI || "https://na4.docusign.net";
const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY || "";
const RSA_PRIVATE_KEY_BASE64 = process.env.DOCUSIGN_RSA_PRIVATE_KEY_BASE64 || "";
const HMAC_SECRET = process.env.DOCUSIGN_HMAC_SECRET || "";
const TEMPLATE_ID_FUE = process.env.DOCUSIGN_TEMPLATE_ID_FUE || "";

let accessToken = null;
let tokenExpiresAt = 0;

function isConfigured() {
  return !!(INTEGRATION_KEY && RSA_PRIVATE_KEY_BASE64 && HMAC_SECRET && TEMPLATE_ID_FUE);
}

// JWT Grant flow - server-to-server, sem browser
async function obterAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) return accessToken;
  if (!isConfigured()) throw new Error("DocuSign nao configurado (faltam keys no .env)");

  const rsaKey = Buffer.from(RSA_PRIVATE_KEY_BASE64, "base64").toString("utf-8");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: INTEGRATION_KEY,
    sub: USER_ID,
    aud: "account.docusign.com",
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation"
  };
  const header = { alg: "RS256", typ: "JWT" };

  function b64url(obj) {
    return Buffer.from(JSON.stringify(obj)).toString("base64")
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  const signingInput = b64url(header) + "." + b64url(payload);
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(rsaKey).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = signingInput + "." + signature;

  const resp = await axios.post("https://account.docusign.com/oauth/token", new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  }), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 });

  accessToken = resp.data.access_token;
  tokenExpiresAt = Date.now() + (resp.data.expires_in * 1000);
  return accessToken;
}

// Envia contrato FUE via WhatsApp (requer Multi-Channel Delivery add-on)
async function enviarContratoFUE({ nome, cpf, valor, dataCirurgia, unidade, telefone, email }) {
  if (!isConfigured()) {
    return { ok: false, mode: "placeholder", message: "DocuSign nao configurado" };
  }
  const token = await obterAccessToken();
  const url = `${BASE_URI}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes`;
  const payload = {
    templateId: TEMPLATE_ID_FUE,
    templateRoles: [{
      email: email || `${cpf.replace(/\D/g,"")}@noemail.hairtech.local`,
      name: nome,
      roleName: "Paciente",
      deliveryMethod: "WhatsApp",
      phoneNumber: { countryCode: "55", number: telefone.replace(/\D/g, "") },
      tabs: {
        textTabs: [
          { tabLabel: "nome_paciente", value: nome },
          { tabLabel: "cpf_paciente", value: cpf },
          { tabLabel: "valor", value: valor.toString() },
          { tabLabel: "data_cirurgia", value: dataCirurgia },
          { tabLabel: "unidade", value: unidade }
        ]
      }
    }],
    status: "sent"
  };
  const resp = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    timeout: 30000
  });
  return { ok: true, envelopeId: resp.data.envelopeId, status: resp.data.status };
}

// Valida webhook HMAC SHA-256 (header X-DocuSign-Signature-1)
function validarWebhook(rawBody, signature) {
  if (!HMAC_SECRET) return false;
  const computed = crypto.createHmac("sha256", HMAC_SECRET).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch (_) { return false; }
}

module.exports = {
  isConfigured,
  enviarContratoFUE,
  validarWebhook,
  status: () => ({
    configured: isConfigured(),
    user_id: USER_ID,
    account_id: ACCOUNT_ID,
    base_uri: BASE_URI,
    missing: [
      !INTEGRATION_KEY && "DOCUSIGN_INTEGRATION_KEY",
      !RSA_PRIVATE_KEY_BASE64 && "DOCUSIGN_RSA_PRIVATE_KEY_BASE64",
      !HMAC_SECRET && "DOCUSIGN_HMAC_SECRET",
      !TEMPLATE_ID_FUE && "DOCUSIGN_TEMPLATE_ID_FUE"
    ].filter(Boolean)
  })
};
