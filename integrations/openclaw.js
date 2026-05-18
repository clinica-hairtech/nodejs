const axios = require("axios");

const BASE_URL = (process.env.OPENCLAW_URL || "http://hairtech-openclaw:18789").replace(/\/$/, "");
const TIMEOUT = parseInt(process.env.OPENCLAW_TIMEOUT_MS || "30000", 10);

async function tentar(method, paths, data) {
  let ultimoErro = null;
  for (const p of paths) {
    try {
      const r = await axios({
        method, url: `${BASE_URL}${p}`, data, timeout: TIMEOUT,
        validateStatus: () => true,
      });
      if (r.status < 400) return { ok: true, path: p, status: r.status, data: r.data };
      ultimoErro = { path: p, status: r.status, data: r.data };
    } catch (e) {
      ultimoErro = { path: p, error: e.message };
    }
  }
  return { ok: false, tried: paths, last: ultimoErro };
}

async function health() {
  return tentar("get", ["/health", "/api/health", "/status"]);
}

async function listAgents() {
  return tentar("get", ["/agents", "/api/agents", "/v1/agents"]);
}

async function invokeAgent(name, prompt, opts = {}) {
  const body = { prompt, agent: name, ...opts };
  return tentar("post", [
    `/agents/${encodeURIComponent(name)}/invoke`,
    `/api/agents/${encodeURIComponent(name)}/invoke`,
    `/v1/agents/${encodeURIComponent(name)}/invoke`,
    `/agents/${encodeURIComponent(name)}/messages`,
    `/invoke`,
  ], body);
}

function extractText(resp) {
  if (!resp || !resp.ok) return null;
  const d = resp.data;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    return d.text || d.response || d.message || d.output || d.content || JSON.stringify(d).slice(0, 500);
  }
  return null;
}

module.exports = { BASE_URL, health, listAgents, invokeAgent, extractText };
