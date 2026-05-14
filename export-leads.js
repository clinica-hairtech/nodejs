// Rotas de exportação completa de leads/contatos.
// Acesso: /admin/export?senha=...
const express = require("express");
const router = express.Router();
const { pool } = require("./db");

const ADMIN_PASS = process.env.ADMIN_PASS || "hairtech2026";

function auth(req, res, next) {
  const senha = req.query.senha || req.body?.senha;
  if (senha !== ADMIN_PASS) {
    return res.status(401).send("Nao autorizado. Use ?senha=...");
  }
  next();
}

function fmtDate(epochMs) {
  if (!epochMs) return "";
  const d = new Date(Number(epochMs));
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (s.includes('"') || s.includes(",") || s.includes(";")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function safeText(s, max = 200) {
  if (!s) return "";
  const str = String(s).replace(/\s+/g, " ").trim();
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchAllConversations() {
  if (!pool) throw new Error("Banco nao configurado");
  const result = await pool.query(`
    SELECT
      numero, status, tipo, temperatura, genero, nome, nota, tags, valor,
      origem, retomadas, ultima_atividade, historico, created_at, updated_at
    FROM conversations
    ORDER BY ultima_atividade DESC NULLS LAST
  `);
  return result.rows;
}

// ============================================================
// /admin/export — pagina inicial com links de download
// ============================================================
router.get("/", auth, async (req, res) => {
  let total = 0, quentes = 0, mornos = 0, frios = 0, semResposta = 0;
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE temperatura='quente') AS quentes,
        COUNT(*) FILTER (WHERE temperatura='morno') AS mornos,
        COUNT(*) FILTER (WHERE temperatura='frio') AS frios,
        COUNT(*) FILTER (
          WHERE historico::text LIKE '%"role":"user"%'
          AND NOT (historico::text LIKE '%"role":"assistant"%')
        ) AS sem_resposta
      FROM conversations
    `);
    const row = r.rows[0] || {};
    total = Number(row.total) || 0;
    quentes = Number(row.quentes) || 0;
    mornos = Number(row.mornos) || 0;
    frios = Number(row.frios) || 0;
    semResposta = Number(row.sem_resposta) || 0;
  } catch (e) {
    return res.status(500).send("Erro consultando banco: " + e.message);
  }

  const senha = encodeURIComponent(req.query.senha);
  res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Exportar contatos — HairTech</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,sans-serif;background:#0a0a1a;color:#fff;padding:40px;min-height:100vh}
h1{font-size:28px;margin-bottom:8px}
.sub{color:#888;margin-bottom:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px}
.stat{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:18px}
.stat .n{font-size:32px;font-weight:700;margin-bottom:4px}
.stat .l{color:#888;font-size:13px;text-transform:uppercase;letter-spacing:.5px}
.quentes .n{color:#ff3b30}
.mornos .n{color:#ff9f0a}
.frios .n{color:#8e8e93}
.semresp .n{color:#7c3aed}
.actions{display:flex;flex-direction:column;gap:12px;max-width:600px}
a.btn{display:block;background:#1a1a2e;border:1px solid #3a3a5a;color:#fff;text-decoration:none;
  padding:18px 24px;border-radius:12px;font-size:15px;font-weight:600;transition:all .15s}
a.btn:hover{background:#252548;border-color:#5a5a8a;transform:translateY(-1px)}
a.btn .desc{font-size:13px;color:#888;font-weight:400;margin-top:4px}
.btn-quente{border-color:#ff3b30}
.btn-quente:hover{background:#2a1010}
</style></head>
<body>
<h1>Exportar contatos da clinica</h1>
<p class="sub">Total no banco: ${total} conversas</p>

<div class="grid">
  <div class="stat quentes"><div class="n">${quentes}</div><div class="l">Quentes</div></div>
  <div class="stat mornos"><div class="n">${mornos}</div><div class="l">Mornos</div></div>
  <div class="stat frios"><div class="n">${frios}</div><div class="l">Frios</div></div>
  <div class="stat semresp"><div class="n">${semResposta}</div><div class="l">Sem resposta do bot</div></div>
</div>

<div class="actions">
  <a class="btn btn-quente" href="/admin/export/leads.html?senha=${senha}&filtro=sem-resposta">
    Ver contatos sem resposta do bot
    <div class="desc">Pacientes que escreveram mas o AV nao respondeu — recuperar primeiro</div>
  </a>
  <a class="btn" href="/admin/export/leads.html?senha=${senha}&filtro=quentes">
    Ver leads quentes
    <div class="desc">Pacientes que demonstraram intencao forte de fechar</div>
  </a>
  <a class="btn" href="/admin/export/leads.html?senha=${senha}">
    Ver todos os contatos (HTML navegavel)
    <div class="desc">Lista completa com link para cada conversa</div>
  </a>
  <a class="btn" href="/admin/export/leads.csv?senha=${senha}" download>
    Baixar CSV resumido (1 linha por contato)
    <div class="desc">Abre no Excel/Google Sheets — para campanhas e analise</div>
  </a>
  <a class="btn" href="/admin/export/mensagens.csv?senha=${senha}" download>
    Baixar CSV de todas as mensagens
    <div class="desc">Uma linha por mensagem trocada — historico completo</div>
  </a>
  <a class="btn" href="/admin/export/full.json?senha=${senha}" download>
    Baixar JSON completo (backup integral)
    <div class="desc">Todas as conversas + historicos integrais</div>
  </a>
</div>
</body></html>`);
});

// ============================================================
// /admin/export/leads.html — listagem HTML navegavel
// ============================================================
router.get("/leads.html", auth, async (req, res) => {
  let rows;
  try {
    rows = await fetchAllConversations();
  } catch (e) {
    return res.status(500).send("Erro: " + e.message);
  }

  const filtro = req.query.filtro || "";
  const senha = encodeURIComponent(req.query.senha);

  let filtrados = rows;
  let titulo = "Todos os contatos";

  if (filtro === "quentes") {
    filtrados = rows.filter(r => r.temperatura === "quente");
    titulo = "Leads quentes";
  } else if (filtro === "mornos") {
    filtrados = rows.filter(r => r.temperatura === "morno");
    titulo = "Leads mornos";
  } else if (filtro === "sem-resposta") {
    filtrados = rows.filter(r => {
      const h = Array.isArray(r.historico) ? r.historico : [];
      const temUser = h.some(m => m.role === "user");
      const temBot = h.some(m => m.role === "assistant");
      return temUser && !temBot;
    });
    titulo = "Contatos SEM resposta do bot";
  }

  const linhas = filtrados.map((r, i) => {
    const h = Array.isArray(r.historico) ? r.historico : [];
    const ultimaUser = [...h].reverse().find(m => m.role === "user");
    const primeiraUser = h.find(m => m.role === "user");
    const tempCor = { quente: "#ff3b30", morno: "#ff9f0a", frio: "#8e8e93" }[r.temperatura] || "#666";
    return `
    <tr>
      <td>${i + 1}</td>
      <td><a href="/admin/export/conversa.html?senha=${senha}&numero=${encodeURIComponent(r.numero)}" style="color:#7cf">+${escapeHtml(r.numero)}</a></td>
      <td>${escapeHtml(r.nome || "—")}</td>
      <td><span style="color:${tempCor}">●</span> ${escapeHtml(r.temperatura || "—")}</td>
      <td>${escapeHtml(r.status || "—")}</td>
      <td>${escapeHtml(r.tipo || "—")}</td>
      <td>${h.length}</td>
      <td title="${escapeHtml(primeiraUser?.content || "")}">${escapeHtml(safeText(primeiraUser?.content, 80))}</td>
      <td title="${escapeHtml(ultimaUser?.content || "")}">${escapeHtml(safeText(ultimaUser?.content, 80))}</td>
      <td>${fmtDate(r.ultima_atividade)}</td>
    </tr>`;
  }).join("");

  res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<title>${titulo} — HairTech</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,sans-serif;background:#0a0a1a;color:#fff;padding:20px}
h1{margin-bottom:8px}
.back{color:#7cf;text-decoration:none;font-size:14px;margin-bottom:16px;display:inline-block}
table{width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:12px;overflow:hidden;font-size:13px}
th{padding:14px 10px;text-align:left;background:#252548;color:#aaa;text-transform:uppercase;font-size:11px;letter-spacing:.5px;border-bottom:1px solid #3a3a5a}
td{padding:12px 10px;border-bottom:1px solid #2a2a4a;vertical-align:top}
tr:hover td{background:#252548}
.contagem{margin:16px 0;color:#888}
</style></head>
<body>
<a class="back" href="/admin/export?senha=${senha}">&larr; voltar</a>
<h1>${titulo}</h1>
<p class="contagem">${filtrados.length} contato(s) encontrado(s) — total no banco: ${rows.length}</p>
<table>
  <thead><tr>
    <th>#</th><th>Numero</th><th>Nome</th><th>Temp</th><th>Status</th><th>Tipo</th><th>Msgs</th>
    <th>1a mensagem</th><th>Ultima mensagem</th><th>Atualizado</th>
  </tr></thead>
  <tbody>${linhas}</tbody>
</table>
</body></html>`);
});

// ============================================================
// /admin/export/conversa.html?numero=XXX — conversa completa
// ============================================================
router.get("/conversa.html", auth, async (req, res) => {
  const numero = (req.query.numero || "").replace(/\D/g, "");
  if (!numero) return res.status(400).send("numero obrigatorio");

  const senha = encodeURIComponent(req.query.senha);

  let row;
  try {
    const r = await pool.query(`SELECT * FROM conversations WHERE numero=$1`, [numero]);
    row = r.rows[0];
  } catch (e) {
    return res.status(500).send("Erro: " + e.message);
  }
  if (!row) return res.status(404).send("Contato nao encontrado");

  let msgsExtras = [];
  try {
    const r = await pool.query(
      `SELECT role, content, created_at FROM mensagens WHERE numero=$1 ORDER BY created_at ASC LIMIT 1000`,
      [numero]
    );
    msgsExtras = r.rows;
  } catch (_) {}

  const historico = Array.isArray(row.historico) ? row.historico : [];

  const blocosHist = historico.map(m => {
    const isUser = m.role === "user";
    const bg = isUser ? "#1a3a5a" : "#3a1a5a";
    const align = isUser ? "left" : "right";
    return `<div style="margin:8px 0;text-align:${align}">
      <div style="display:inline-block;max-width:75%;background:${bg};padding:10px 14px;border-radius:14px;text-align:left">
        <div style="font-size:11px;color:#aaa;margin-bottom:4px">${isUser ? "Paciente" : "Bot"}</div>
        <div style="white-space:pre-wrap">${escapeHtml(m.content || "")}</div>
      </div>
    </div>`;
  }).join("");

  const blocosExtras = msgsExtras.map(m => {
    const isUser = m.role === "user";
    const bg = isUser ? "#1a3a5a" : "#3a1a5a";
    const align = isUser ? "left" : "right";
    return `<div style="margin:8px 0;text-align:${align}">
      <div style="display:inline-block;max-width:75%;background:${bg};padding:10px 14px;border-radius:14px;text-align:left">
        <div style="font-size:11px;color:#aaa;margin-bottom:4px">${isUser ? "Paciente" : "Bot"} — ${new Date(m.created_at).toLocaleString("pt-BR")}</div>
        <div style="white-space:pre-wrap">${escapeHtml(m.content || "")}</div>
      </div>
    </div>`;
  }).join("");

  res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<title>+${escapeHtml(numero)} — Conversa</title>
<style>
body{font-family:-apple-system,Segoe UI,sans-serif;background:#0a0a1a;color:#fff;padding:20px;max-width:900px;margin:0 auto}
.back{color:#7cf;text-decoration:none;font-size:14px}
h1{margin:12px 0 4px}
.meta{color:#888;font-size:13px;margin-bottom:24px}
.meta span{margin-right:16px}
.section{margin-top:24px;padding-top:16px;border-top:1px solid #2a2a4a}
.section h2{font-size:16px;color:#aaa;margin-bottom:12px}
a.zap{display:inline-block;background:#25d366;color:#000;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px}
</style></head>
<body>
<a class="back" href="/admin/export/leads.html?senha=${senha}">&larr; voltar</a>
<h1>+${escapeHtml(row.numero)}</h1>
<div class="meta">
  <span><strong>Nome:</strong> ${escapeHtml(row.nome || "—")}</span>
  <span><strong>Temp:</strong> ${escapeHtml(row.temperatura || "—")}</span>
  <span><strong>Status:</strong> ${escapeHtml(row.status || "—")}</span>
  <span><strong>Tipo:</strong> ${escapeHtml(row.tipo || "—")}</span>
  <span><strong>Ultima:</strong> ${fmtDate(row.ultima_atividade)}</span>
</div>
<a class="zap" href="https://wa.me/${escapeHtml(row.numero)}" target="_blank">Abrir no WhatsApp</a>

<div class="section">
  <h2>Historico em conversations (${historico.length} mensagens)</h2>
  ${blocosHist || "<p style='color:#666'>Vazio</p>"}
</div>

${msgsExtras.length ? `<div class="section">
  <h2>Tabela mensagens (${msgsExtras.length} entradas)</h2>
  ${blocosExtras}
</div>` : ""}
</body></html>`);
});

// ============================================================
// /admin/export/leads.csv — CSV resumido
// ============================================================
router.get("/leads.csv", auth, async (req, res) => {
  let rows;
  try {
    rows = await fetchAllConversations();
  } catch (e) {
    return res.status(500).send("Erro: " + e.message);
  }

  const linhas = [
    ["numero", "nome", "temperatura", "status", "tipo", "total_mensagens",
     "primeira_mensagem", "ultima_mensagem_paciente", "ultima_resposta_bot",
     "ultima_atividade", "criado_em"].join(",")
  ];

  for (const r of rows) {
    const h = Array.isArray(r.historico) ? r.historico : [];
    const primeiraUser = h.find(m => m.role === "user")?.content || "";
    const ultimaUser = [...h].reverse().find(m => m.role === "user")?.content || "";
    const ultimaBot = [...h].reverse().find(m => m.role === "assistant")?.content || "";

    linhas.push([
      r.numero,
      r.nome || "",
      r.temperatura || "",
      r.status || "",
      r.tipo || "",
      h.length,
      primeiraUser,
      ultimaUser,
      ultimaBot,
      fmtDate(r.ultima_atividade),
      r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : ""
    ].map(csvEscape).join(","));
  }

  const csv = "﻿" + linhas.join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="hairtech-leads-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

// ============================================================
// /admin/export/mensagens.csv — todas mensagens individuais
// ============================================================
router.get("/mensagens.csv", auth, async (req, res) => {
  let rows = [];
  try {
    const r = await pool.query(`
      SELECT m.numero, c.nome, c.temperatura, m.role, m.content, m.created_at
      FROM mensagens m
      LEFT JOIN conversations c ON c.numero = m.numero
      ORDER BY m.created_at ASC
    `);
    rows = r.rows;
  } catch (e) {
    return res.status(500).send("Erro: " + e.message);
  }

  const linhas = [
    ["data", "numero", "nome", "temperatura", "role", "mensagem"].join(",")
  ];

  for (const m of rows) {
    linhas.push([
      m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : "",
      m.numero,
      m.nome || "",
      m.temperatura || "",
      m.role,
      m.content || ""
    ].map(csvEscape).join(","));
  }

  const csv = "﻿" + linhas.join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="hairtech-mensagens-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

// ============================================================
// /admin/export/full.json — backup integral
// ============================================================
router.get("/full.json", auth, async (req, res) => {
  let conversas = [];
  let mensagens = [];
  try {
    const r1 = await pool.query(`SELECT * FROM conversations ORDER BY ultima_atividade DESC NULLS LAST`);
    conversas = r1.rows;
    const r2 = await pool.query(`SELECT * FROM mensagens ORDER BY created_at ASC`);
    mensagens = r2.rows;
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="hairtech-backup-${new Date().toISOString().slice(0,10)}.json"`);
  res.send(JSON.stringify({
    gerado_em: new Date().toISOString(),
    total_conversas: conversas.length,
    total_mensagens: mensagens.length,
    conversas,
    mensagens
  }, null, 2));
});

module.exports = router;
