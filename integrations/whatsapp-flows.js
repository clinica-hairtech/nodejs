// Helper para enviar WhatsApp Flows (Meta Business / Cloud API).
// Pre-requisitos:
// 1. Subir JSON do docs/whatsapp-flows/ no Meta Business Manager -> Flows
// 2. Publicar e copiar flow_id
// 3. Adicionar ao .env:
//    FLOW_ID_TRIAGEM=<id>
//    FLOW_ID_ANAMNESE=<id>
//    FLOW_ID_TCLE=<id>
//    FLOW_DATA_BASE_URL=https://hairtech.org/webhook/flows  (endpoint que recebe tela)

const axios = require("axios");
const crypto = require("crypto");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const FLOWS = {
  triagem: process.env.FLOW_ID_TRIAGEM || "",
  anamnese: process.env.FLOW_ID_ANAMNESE || "",
  tcle: process.env.FLOW_ID_TCLE || "",
};

function configured(flow) {
  return Boolean(WHATSAPP_TOKEN && PHONE_NUMBER_ID && FLOWS[flow]);
}

function gerarFlowToken() {
  return crypto.randomBytes(16).toString("hex");
}

async function enviarFlow({ to, flow, headerText, bodyText, footerText, cta, firstScreen, payload }) {
  if (!configured(flow)) {
    return { ok: false, motivo: `Flow ${flow} nao configurado (FLOW_ID_${flow.toUpperCase()})` };
  }
  const flowToken = gerarFlowToken();
  const body = {
    messaging_product: "whatsapp",
    to: to.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "flow",
      header: headerText ? { type: "text", text: headerText } : undefined,
      body: { text: bodyText || "Por favor, preencha o formulario abaixo:" },
      footer: footerText ? { text: footerText } : undefined,
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: flowToken,
          flow_id: FLOWS[flow],
          flow_cta: cta || "Iniciar",
          flow_action: "navigate",
          flow_action_payload: {
            screen: firstScreen || "DADOS_BASICOS",
            data: payload || {},
          },
        },
      },
    },
  };
  try {
    const r = await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      body,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
    return { ok: true, message_id: r.data.messages?.[0]?.id, flow_token: flowToken };
  } catch (e) {
    return { ok: false, error: e.response?.data?.error?.message || e.message };
  }
}

// Heuristica simples pra detectar intencao - usar antes de chamar IA cara
function detectarIntencaoFlow(texto) {
  const t = (texto || "").toLowerCase();
  if (/(quanto custa|preço|valor|orçamento|quanto sai)/i.test(t) &&
      /(transplante|fue|capilar|cabelo|calvicie)/i.test(t)) {
    return "triagem";
  }
  if (/(consentimento|tcle|autorizar|assinar termo)/i.test(t)) {
    return "tcle";
  }
  if (/(anamnese|historico|condicao saude|alergia|medicamento que uso)/i.test(t) &&
      /(pre cirurgia|pre fue|preparar)/i.test(t)) {
    return "anamnese";
  }
  return null;
}

function status() {
  return {
    cloud_api_pronta: Boolean(WHATSAPP_TOKEN && PHONE_NUMBER_ID),
    flows: Object.fromEntries(Object.entries(FLOWS).map(([k, v]) => [k, Boolean(v)])),
  };
}

module.exports = { enviarFlow, detectarIntencaoFlow, configured, status, FLOWS };
