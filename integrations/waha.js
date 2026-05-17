const axios = require("axios");

const BASE_URL    = (process.env.WAHA_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const API_KEY     = process.env.WAHA_API_KEY || "";
const SESSION     = process.env.WAHA_SESSION || "ana";
const ENGINE      = (process.env.WAHA_ENGINE || "WEBJS").toUpperCase();
const WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL || "";

if (ENGINE !== "WEBJS") {
  throw new Error(`WAHA engine must be WEBJS (got '${ENGINE}'). NOWEB is forbidden by clinic policy.`);
}

function headers() {
  const h = { "Content-Type": "application/json" };
  if (API_KEY) h["X-Api-Key"] = API_KEY;
  return h;
}

function http(method, path, data) {
  return axios({
    method,
    url: `${BASE_URL}${path}`,
    headers: headers(),
    data,
    timeout: 15000,
    validateStatus: () => true,
  });
}

async function getSession(name = SESSION) {
  const r = await http("get", `/api/sessions/${encodeURIComponent(name)}`);
  if (r.status === 404) return null;
  if (r.status >= 400) throw new Error(`WAHA getSession ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function startSession(name = SESSION) {
  const config = { metadata: { clinic: "hairtech" } };
  if (WEBHOOK_URL) {
    config.webhooks = [{
      url: WEBHOOK_URL,
      events: ["message", "session.status"],
      retries: { policy: "linear", delaySeconds: 2, attempts: 3 },
    }];
  }
  const body = { name, start: true, config };
  const r = await http("post", "/api/sessions", body);
  if (r.status === 422 || r.status === 409) {
    const start = await http("post", `/api/sessions/${encodeURIComponent(name)}/start`);
    if (start.status >= 400) throw new Error(`WAHA start ${start.status}: ${JSON.stringify(start.data)}`);
    return start.data;
  }
  if (r.status >= 400) throw new Error(`WAHA create ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function stopSession(name = SESSION) {
  const r = await http("post", `/api/sessions/${encodeURIComponent(name)}/stop`);
  if (r.status >= 400 && r.status !== 404) {
    throw new Error(`WAHA stop ${r.status}: ${JSON.stringify(r.data)}`);
  }
  return r.data;
}

async function logoutSession(name = SESSION) {
  const r = await http("post", `/api/sessions/${encodeURIComponent(name)}/logout`);
  if (r.status >= 400 && r.status !== 404) {
    throw new Error(`WAHA logout ${r.status}: ${JSON.stringify(r.data)}`);
  }
  return r.data;
}

async function getQr(name = SESSION, format = "raw") {
  const r = await http("get", `/api/${encodeURIComponent(name)}/auth/qr?format=${format}`);
  if (r.status === 404 || r.status === 422) return null;
  if (r.status >= 400) throw new Error(`WAHA qr ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function sendText(chatId, text, name = SESSION) {
  const r = await http("post", "/api/sendText", { session: name, chatId, text });
  if (r.status >= 400) throw new Error(`WAHA sendText ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function waitForStatus(targetStatuses, { name = SESSION, timeoutMs = 60000, intervalMs = 2000 } = {}) {
  const targets = new Set(targetStatuses);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await getSession(name);
    const status = s && (s.status || s.state);
    if (status && targets.has(status)) return s;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

module.exports = {
  BASE_URL,
  SESSION,
  ENGINE,
  getSession,
  startSession,
  stopSession,
  logoutSession,
  getQr,
  sendText,
  waitForStatus,
};
