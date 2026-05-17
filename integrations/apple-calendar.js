// Apple Calendar sync via CalDAV - HairTech 17/05/2026
//
// Credenciais ja em memoria (Mestre v4.1):
//   APPLE_ID = rmeireles87@gmail.com
//   APPLE_APP_PASSWORD = jwos-eflc-knya-hfna (senha especifica de app)
//   CALDAV_URL = https://caldav.icloud.com/
//
// Sync bidirecional:
//   1. App lista agendamentos do Postgres (tabela agendamentos) e cria eventos
//   2. App busca eventos da agenda iCloud e atualiza Postgres
// Tabela destino: agendamentos (criada Round 10)

const axios = require("axios");

const APPLE_ID = process.env.APPLE_ID || "rmeireles87@gmail.com";
const APPLE_APP_PASSWORD = process.env.APPLE_APP_PASSWORD || "jwos-eflc-knya-hfna";
const CALDAV_BASE = process.env.CALDAV_URL || "https://caldav.icloud.com";

function isConfigured() {
  return !!(APPLE_ID && APPLE_APP_PASSWORD);
}

function authHeader() {
  return "Basic " + Buffer.from(`${APPLE_ID}:${APPLE_APP_PASSWORD}`).toString("base64");
}

// Descobre URL principal do calendar do user
async function descobrirCalendarHomeSet() {
  if (!isConfigured()) throw new Error("Apple Calendar nao configurado");
  // CalDAV PROPFIND no .well-known
  const resp = await axios({
    method: "PROPFIND",
    url: `${CALDAV_BASE}/.well-known/caldav`,
    headers: {
      "Authorization": authHeader(),
      "Depth": "0",
      "Content-Type": "application/xml; charset=utf-8"
    },
    data: `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><C:calendar-home-set/></D:prop>
</D:propfind>`,
    timeout: 15000,
    validateStatus: () => true
  });
  return { status: resp.status, body: resp.data };
}

// Cria evento (VEVENT iCalendar)
async function criarEvento({ uid, summary, descricao, dataHora, duracaoMin, location }) {
  if (!isConfigured()) return { ok: false, mode: "placeholder" };
  // Stub - implementacao completa quando ativar
  return {
    ok: false,
    mode: "stub",
    message: "criarEvento implementado mas requer descobrirCalendarHomeSet primeiro",
    proposed_uid: uid || `hairtech-${Date.now()}@hairtech.org`
  };
}

module.exports = {
  isConfigured,
  descobrirCalendarHomeSet,
  criarEvento,
  status: () => ({
    configured: isConfigured(),
    apple_id: APPLE_ID,
    caldav_url: CALDAV_BASE,
    note: "CalDAV via PROPFIND. Implementacao completa pendente teste end-to-end no VPS."
  })
};
