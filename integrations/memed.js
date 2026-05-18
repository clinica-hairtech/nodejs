// Memed - prescricao digital certificada ICP-Brasil (gratis pro medico)
// Site: https://memed.com.br/integracao
// Ativacao: medico cadastra CRM + assina termo + recebe API key gratuita
const axios = require("axios");

const BASE_URL = (process.env.MEMED_BASE_URL || "https://api.memed.com.br").replace(/\/$/, "");
const API_KEY = process.env.MEMED_API_KEY || "";
const API_SECRET = process.env.MEMED_API_SECRET || "";
const CRM = process.env.MEMED_CRM || ""; // ex: "52.999/RJ"

function ready() { return Boolean(API_KEY && API_SECRET && CRM); }

function headers() {
  return {
    "X-Api-Key": API_KEY,
    "X-Api-Secret": API_SECRET,
    "Content-Type": "application/json",
  };
}

async function criarPrescricao({ pacienteCpf, pacienteNome, medicamentos }) {
  if (!ready()) {
    return { ok: false, error: "Memed nao configurada (MEMED_API_KEY/SECRET/CRM no .env)" };
  }
  const body = {
    paciente: { cpf: pacienteCpf, nome: pacienteNome },
    medico_crm: CRM,
    medicamentos: medicamentos.map((m) => ({
      nome: m.nome,
      posologia: m.posologia,
      quantidade: m.quantidade || "1",
      via: m.via || "uso oral",
    })),
  };
  try {
    const r = await axios.post(`${BASE_URL}/v1/prescricoes`, body, { headers: headers(), timeout: 10000 });
    return { ok: true, data: r.data, url_pdf: r.data?.url_pdf };
  } catch (e) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}

async function status() {
  if (!ready()) return { configurado: false, motivo: "credenciais ausentes" };
  try {
    const r = await axios.get(`${BASE_URL}/v1/medico`, { headers: headers(), timeout: 5000 });
    return { configurado: true, crm: CRM, medico: r.data?.nome };
  } catch (e) {
    return { configurado: false, motivo: e.message };
  }
}

module.exports = { ready, criarPrescricao, status };
