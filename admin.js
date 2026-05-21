const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const db = require("./db");

const ADMIN_PASS = process.env.ADMIN_PASS || "hairtech2026";
const SESSION_COOKIE = "ht_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessoes = new Map();

setInterval(() => {
  const agora = Date.now();
  for (const [t, s] of sessoes) if (s.expira < agora) sessoes.delete(t);
}, 60 * 60 * 1000);

function lerCookie(req, nome) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === nome) return rest.join("=");
  }
  return null;
}

function sessaoValida(req) {
  const token = lerCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const s = sessoes.get(token);
  if (!s || s.expira < Date.now()) { sessoes.delete(token); return null; }
  return { token, ...s };
}

function setCookieSessao(res, token, secure) {
  const flags = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_TTL_MS/1000}`];
  if (secure) flags.push("Secure");
  res.setHeader("Set-Cookie", flags.join("; "));
}

const DOT_TEMP   = { quente: "#ff3b30", morno: "#ff9f0a", frio: "#8e8e93" };
const COR_TEMP   = { quente: "rgba(255,59,48,0.2)", morno: "rgba(255,159,10,0.2)", frio: "rgba(120,120,128,0.15)" };
const DOT_STATUS = { ativo: "#34c759", pausado: "#ff9f0a", humano: "#007aff", encerrado: "#8e8e93" };

const CSS_BASE = `
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:linear-gradient(135deg,#1a0533 0%,#0d1b4b 40%,#0a2a3a 70%,#001a1a 100%);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;color:#fff}
.glass{background:rgba(255,255,255,0.06);backdrop-filter:blur(40px) saturate(180%);
  -webkit-backdrop-filter:blur(40px) saturate(180%);border:1px solid rgba(255,255,255,0.12);
  border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.1)}
.card{background:rgba(255,255,255,0.07);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
  border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:20px 24px;
  box-shadow:0 8px 32px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.08)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:12px;
  font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;border:1px solid transparent;
  transition:all .2s;white-space:nowrap}
.btn:hover{transform:translateY(-1px);filter:brightness(1.12)}
.tag{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.07);
  border:1px solid rgba(255,255,255,0.1);padding:4px 12px;border-radius:20px;
  font-size:12px;color:rgba(255,255,255,0.65)}
input,textarea,select{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
  border-radius:12px;padding:10px 16px;color:#fff;font-size:14px;outline:none;
  transition:all .2s;font-family:inherit;width:100%}
input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.3)}
input:focus,textarea:focus,select:focus{border-color:rgba(255,255,255,0.28);background:rgba(255,255,255,0.1)}
select option{background:#1a0533;color:#fff}
table{width:100%;border-collapse:collapse}
th{padding:12px 16px;text-align:left;font-size:11px;color:rgba(255,255,255,0.3);
  text-transform:uppercase;letter-spacing:.8px;font-weight:500;border-bottom:1px solid rgba(255,255,255,0.06)}
.row:hover td{background:rgba(255,255,255,0.03)}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:4px}
`;

function paginaLogin(erro) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>HairTech — Entrar</title>
<style>${CSS_BASE}body{display:flex;align-items:center;justify-content:center}</style>
</head>
<body>
<div class="card" style="width:380px;padding:48px 40px">
  <div style="font-size:24px;font-weight:700;margin-bottom:6px;letter-spacing:-0.5px">✦ HairTech</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:36px">Ambiente Virtual</div>
  ${erro ? `<div style="background:rgba(255,59,48,0.15);border:1px solid rgba(255,59,48,0.4);color:#ff6961;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:16px">${erro}</div>` : ""}
  <form method="POST" action="/admin/login">
    <input name="senha" type="password" placeholder="Senha de acesso" autofocus style="margin-bottom:12px"/>
    <button type="submit" class="btn" style="width:100%;justify-content:center;background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.2);font-size:15px;padding:14px">Entrar</button>
  </form>
  <div style="font-size:11px;color:rgba(255,255,255,0.3);text-align:center;margin-top:20px">Sessao expira em 8h</div>
</div>
</body></html>`;
}

function autenticar(req, res, next) {
  if (sessaoValida(req)) return next();
  const senha = req.query.senha || req.body?.senha;
  if (senha === ADMIN_PASS) return next();
  if (req.method === "GET" && req.accepts("html")) {
    return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  return res.status(401).send(paginaLogin("Senha invalida"));
}

router.get("/login", (req, res) => {
  if (sessaoValida(req)) return res.redirect("/admin/portal");
  res.send(paginaLogin(null));
});

router.post("/login", (req, res) => {
  const senha = (req.body?.senha || "").toString();
  if (senha !== ADMIN_PASS) return res.status(401).send(paginaLogin("Senha invalida"));
  const token = crypto.randomBytes(24).toString("hex");
  sessoes.set(token, { user: "doctor", expira: Date.now() + SESSION_TTL_MS, criado: Date.now() });
  const isHttps = (req.headers["x-forwarded-proto"] || req.protocol) === "https";
  setCookieSessao(res, token, isHttps);
  const next = req.query.next && req.query.next.startsWith("/admin") ? req.query.next : "/admin/portal";
  res.redirect(next);
});

router.get("/logout", (req, res) => {
  const s = sessaoValida(req);
  if (s) sessoes.delete(s.token);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  res.redirect("/admin/login");
});

function navbar(senha, ativa) {
  const q = senha ? `?senha=${senha}` : "";
  const links = [
    { href: `/admin/portal`, label: "Portal", id: "portal" },
    { href: `/admin/blitz${q}`, label: "⚡ BLITZ", id: "blitz" },
    { href: `/admin/importar${q}`, label: "Importar", id: "importar" },
    { href: `/admin/grupo${q}`, label: "Grupo Timeless", id: "grupo" },
    { href: `/admin/investigacao${q}`, label: "🔍 WhatsApp", id: "investigacao" },
    { href: `/admin/system-check${q}`, label: "Check", id: "system-check" },
    { href: `/admin/dual-ai${q}`, label: "🤖+🤖", id: "dual-ai" },
    { href: `/admin/auto-cadastro${q}`, label: "Auto-cadastro", id: "auto-cadastro" },
    { href: `/admin${q}`, label: "Conversas", id: "dash" },
    { href: `/admin/dashboard${q}`, label: "Dashboard", id: "dashboard" },
    { href: `/admin/kanban${q}`, label: "Pipeline", id: "kanban" },
    { href: `/admin/agentes${q}`, label: "Agentes", id: "agentes" },
    { href: `/admin/status${q}`, label: "Status", id: "status" },
    { href: `/admin/handoff${q}`, label: "Handoff", id: "handoff" },
    { href: `/admin/aprovar-fila${q}`, label: "Fila", id: "aprovar-fila" },
    { href: `/admin/templates${q}`, label: "Templates", id: "templates" },
    { href: `/admin/broadcast${q}`, label: "Broadcast", id: "broadcast" },
    { href: `/admin/agendamentos${q}`, label: "Agenda", id: "agendamentos" },
    { href: `/admin/prontuario${q}`, label: "Prontuario", id: "prontuario" },
    { href: `/admin/contratos${q}`, label: "📄 Contratos", id: "contratos" },
    { href: `/admin/compliance${q}`, label: "Compliance", id: "compliance" },
    { href: `/admin/lgpd${q}`, label: "LGPD", id: "lgpd" },
    { href: `/admin/incidentes${q}`, label: "Incidentes", id: "incidentes" },
    { href: `/admin/help${q}`, label: "Ajuda", id: "help" },
    { href: `/admin/audit${q}`, label: "Audit", id: "audit" },
    { href: `/admin/logout`, label: "Sair", id: "logout" },
  ];
  return `
<nav style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:12px;flex-shrink:0">
  <div style="font-size:20px;font-weight:700;letter-spacing:-0.5px">✦ HairTech</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${links.map(l => `<a href="${l.href}" class="btn" style="background:${ativa===l.id ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)'};border-color:rgba(255,255,255,${ativa===l.id ? '0.22' : '0.08'});color:${ativa===l.id ? '#fff' : 'rgba(255,255,255,0.5)'}">${l.label}</a>`).join("")}
  </div>
</nav>`;
}

module.exports = function(conversas, enviarMensagem) {

  // ===== DASHBOARD =====
  router.get("/", autenticar, async (req, res) => {
    const senha        = req.query.senha;
    const agora        = Date.now();
    const filtroTemp   = req.query.temp   || "";
    const filtroStatus = req.query.status || "";
    const busca        = (req.query.q || "").toLowerCase();
    const metricas     = await db.buscarMetricas().catch(() => null);

    const todos    = Object.values(conversas);
    const total    = Object.keys(conversas).length;
    const ativos   = todos.filter(c => c.status === "ativo").length;
    const pausados = todos.filter(c => c.status === "pausado").length;
    const humanos  = todos.filter(c => c.status === "humano").length;
    const quentes  = todos.filter(c => c.temperatura === "quente").length;
    const mornos   = todos.filter(c => c.temperatura === "morno").length;

    const linhas = Object.entries(conversas)
      .filter(([num, c]) => {
        if (filtroTemp   && c.temperatura !== filtroTemp)   return false;
        if (filtroStatus && c.status      !== filtroStatus) return false;
        if (busca && !num.includes(busca) && !(c.nome || "").toLowerCase().includes(busca)) return false;
        return true;
      })
      .sort((a, b) => {
        const ord = { quente: 0, morno: 1, frio: 2 };
        return (ord[a[1].temperatura] ?? 3) - (ord[b[1].temperatura] ?? 3) ||
               (b[1].ultimaAtividade || 0) - (a[1].ultimaAtividade || 0);
      })
      .map(([numero, c]) => {
        const min    = Math.floor((agora - (c.ultimaAtividade || agora)) / 60000);
        const inaStr = min < 60 ? `${min}min` : min < 1440 ? `${Math.floor(min/60)}h` : `${Math.floor(min/1440)}d`;
        const hist   = c.historico || [];
        const ultima = hist.length ? hist[hist.length-1].content.replace(/\[.*?\]/g,"").trim().substring(0,55) : "—";
        const temp   = c.temperatura || "frio";
        return `
<tr class="row" onclick="location.href='/admin/conversa/${numero}?senha=${senha}'" style="cursor:pointer">
  <td style="padding:14px 16px">
    <div style="font-weight:600;font-size:14px">${c.nome || ('+' + numero)}</div>
    ${c.nome ? `<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px">+${numero}</div>` : ""}
  </td>
  <td style="padding:14px 16px">
    <span class="tag"><span style="width:6px;height:6px;border-radius:50%;background:${DOT_STATUS[c.status]||'#8e8e93'}"></span>${c.status}</span>
  </td>
  <td style="padding:14px 16px">
    <span style="background:${COR_TEMP[temp]};border:1px solid ${DOT_TEMP[temp]}55;color:${DOT_TEMP[temp]};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">${temp.toUpperCase()}</span>
  </td>
  <td style="padding:14px 16px;color:rgba(255,255,255,0.5);font-size:13px">${c.tipo || "novo"}</td>
  <td style="padding:14px 16px;font-size:13px;font-weight:600;color:${c.valor ? '#34c759' : 'rgba(255,255,255,0.2)'}">${c.valor ? 'R$'+Number(c.valor).toLocaleString('pt-BR') : '—'}</td>
  <td style="padding:14px 16px;color:rgba(255,255,255,0.4);font-size:12px">${inaStr} atrás</td>
  <td style="padding:14px 16px;font-size:12px;color:rgba(255,255,255,0.3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ultima}</td>
  <td style="padding:14px 16px" onclick="event.stopPropagation()">
    <div style="display:flex;gap:6px">
      <a href="/admin/conversa/${numero}?senha=${senha}" class="btn" style="background:rgba(120,80,255,0.25);border-color:rgba(120,80,255,0.45);color:#c4b5fd;padding:5px 12px">Ver</a>
      ${c.status !== "pausado"
        ? `<a href="/admin/pausar/${numero}?senha=${senha}" class="btn" style="background:rgba(255,159,10,0.18);border-color:rgba(255,159,10,0.38);color:#ff9f0a;padding:5px 12px">Pausar</a>`
        : `<a href="/admin/retomar/${numero}?senha=${senha}" class="btn" style="background:rgba(52,199,89,0.18);border-color:rgba(52,199,89,0.38);color:#34c759;padding:5px 12px">Retomar</a>`}
    </div>
  </td>
</tr>`;
      }).join("");

    const filtroBtn = (label, t, s, cor) => {
      const ativo = t ? filtroTemp === t && !filtroStatus : s ? filtroStatus === s : !filtroTemp && !filtroStatus;
      const url   = t ? `/admin?senha=${senha}&temp=${t}` : s ? `/admin?senha=${senha}&status=${s}` : `/admin?senha=${senha}`;
      return `<a href="${url}" class="btn" style="background:${ativo?'rgba(255,255,255,0.14)':'rgba(255,255,255,0.04)'};border-color:${cor}${ativo?'88':'33'};color:${ativo?cor:'rgba(255,255,255,0.45)'};">${label}</a>`;
    };

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="manifest" href="/manifest.json"/>
<meta name="theme-color" content="#1a0533"/>
<title>HairTech — Dashboard</title>
<meta http-equiv="refresh" content="30"/>
<style>${CSS_BASE}body{padding:24px}</style>
</head>
<body>
${navbar(senha, "dash")}

<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px">
  ${[["Total",total,"#fff"],["Bot ativo",ativos,"#34c759"],["Com humano",humanos,"#007aff"],["Pausados",pausados,"#ff9f0a"],["Quentes",quentes,"#ff3b30"],["Mornos",mornos,"#ff9f0a"]].map(([l,v,c])=>`
  <div class="card" style="min-width:100px;text-align:center">
    <div style="font-size:28px;font-weight:700;color:${c};letter-spacing:-1px">${v}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.38);margin-top:4px">${l}</div>
  </div>`).join("")}
  ${metricas ? `
  <div class="card" style="flex:1;min-width:220px;display:flex;flex-direction:column;justify-content:center">
    <div style="font-size:11px;color:rgba(255,255,255,0.28);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Histórico Geral</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      <span style="font-size:13px;color:rgba(255,255,255,0.55)">7 dias: <strong style="color:#a78bfa">${metricas.conversas_semana}</strong></span>
      <span style="font-size:13px;color:rgba(255,255,255,0.55)">Transplantes: <strong style="color:#c4b5fd">${metricas.transplantes}</strong></span>
      <span style="font-size:13px;color:rgba(255,255,255,0.55)">Convertidos: <strong style="color:#34c759">${metricas.convertidos}</strong></span>
    </div>
  </div>` : ""}
</div>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
  <div style="display:flex;gap:6px;flex-wrap:wrap">
    ${filtroBtn("Todos","","","rgba(255,255,255,0.7)")}
    ${filtroBtn("Quente","quente","","#ff3b30")}
    ${filtroBtn("Morno","morno","","#ff9f0a")}
    ${filtroBtn("Frio","frio","","#8e8e93")}
    <span style="width:1px;background:rgba(255,255,255,0.1);margin:0 2px;align-self:stretch"></span>
    ${filtroBtn("Ativo","","ativo","#34c759")}
    ${filtroBtn("Humano","","humano","#007aff")}
    ${filtroBtn("Pausado","","pausado","#ff9f0a")}
  </div>
  <form method="GET" style="display:flex;gap:8px">
    <input type="hidden" name="senha" value="${senha}"/>
    <input type="text" name="q" value="${req.query.q||''}" placeholder="Buscar nome ou número…" style="width:220px"/>
  </form>
</div>

<div class="glass">
  <table>
    <thead><tr>
      <th>Paciente</th><th>Status</th><th>Lead</th><th>Tipo</th><th>Valor</th><th>Inativo</th><th>Última mensagem</th><th>Ações</th>
    </tr></thead>
    <tbody>
      ${linhas || `<tr><td colspan="8" style="padding:40px;text-align:center;color:rgba(255,255,255,0.2);font-size:14px">Nenhuma conversa encontrada</td></tr>`}
    </tbody>
  </table>
</div>
</body></html>`);
  });

  // ===== KANBAN / PIPELINE =====
  router.get("/kanban", autenticar, (req, res) => {
    const senha = req.query.senha;
    const agora = Date.now();

    const cols = {
      frio:   { label: "❄️ Frio",   cor: "#8e8e93", bg: "rgba(120,120,128,0.1)", items: [] },
      morno:  { label: "🔥 Morno",  cor: "#ff9f0a", bg: "rgba(255,159,10,0.1)",  items: [] },
      quente: { label: "🚀 Quente", cor: "#ff3b30", bg: "rgba(255,59,48,0.1)",   items: [] },
      humano: { label: "👤 Humano", cor: "#007aff", bg: "rgba(0,122,255,0.1)",   items: [] },
    };

    for (const [num, c] of Object.entries(conversas)) {
      if (c.status === "encerrado") continue;
      const col = c.status === "humano" ? "humano" : (c.temperatura || "frio");
      if (cols[col]) cols[col].items.push([num, c]);
    }
    for (const col of Object.values(cols))
      col.items.sort((a,b) => (b[1].ultimaAtividade||0) - (a[1].ultimaAtividade||0));

    const card = ([num, c]) => {
      const min    = Math.floor((agora - (c.ultimaAtividade||agora)) / 60000);
      const inaStr = min < 60 ? `${min}min` : min < 1440 ? `${Math.floor(min/60)}h` : `${Math.floor(min/1440)}d`;
      const hist   = c.historico || [];
      const ultima = hist.length ? hist[hist.length-1].content.replace(/\[.*?\]/g,"").trim().substring(0,55) : "—";
      return `
<a href="/admin/conversa/${num}?senha=${senha}" style="text-decoration:none;display:block;margin-bottom:10px">
  <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px;transition:background .2s"
       onmouseover="this.style.background='rgba(255,255,255,0.11)'" onmouseout="this.style.background='rgba(255,255,255,0.07)'">
    <div style="font-weight:600;font-size:14px;margin-bottom:3px">${c.nome||('+'+num)}</div>
    ${c.nome?`<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:7px">+${num}</div>`:''}
    <div style="font-size:12px;color:rgba(255,255,255,0.38);margin-bottom:8px;line-height:1.4">${ultima}</div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:11px;color:rgba(255,255,255,0.28)">${inaStr} atrás</span>
      ${c.valor?`<span style="font-size:12px;color:#34c759;font-weight:600">R$${Number(c.valor).toLocaleString('pt-BR')}</span>`:''}
    </div>
    ${c.tags?`<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">${c.tags.split(',').filter(Boolean).map(t=>`<span style="background:rgba(124,58,237,0.2);border:1px solid rgba(124,58,237,0.35);color:#c4b5fd;padding:2px 8px;border-radius:10px;font-size:10px">${t.trim()}</span>`).join('')}</div>`:''}
  </div>
</a>`;
    };

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>HairTech — Pipeline</title>
<meta http-equiv="refresh" content="60"/>
<style>${CSS_BASE}body{padding:24px}</style>
</head>
<body>
${navbar(senha, "kanban")}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;align-items:start">
  ${Object.entries(cols).map(([key,col])=>`
  <div style="background:${col.bg};border:1px solid ${col.cor}33;border-radius:18px;padding:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <span style="font-weight:700;color:${col.cor};font-size:14px">${col.label}</span>
      <span style="background:rgba(255,255,255,0.1);padding:2px 10px;border-radius:20px;font-size:12px;color:rgba(255,255,255,0.45)">${col.items.length}</span>
    </div>
    ${col.items.length ? col.items.map(card).join("") : `<div style="text-align:center;padding:30px 0;color:rgba(255,255,255,0.18);font-size:13px">Vazio</div>`}
  </div>`).join("")}
</div>
</body></html>`);
  });

  // ===== CONVERSA INDIVIDUAL =====
  router.get("/conversa/:numero", autenticar, async (req, res) => {
    const { numero } = req.params;
    const senha = req.query.senha;
    const c = conversas[numero];
    if (!c) return res.redirect(`/admin?senha=${senha}`);

    const temp = c.temperatura || "frio";
    const agora = Date.now();

    let hist = c.historico || [];
    try {
      if (db.pool) {
        const r = await db.pool.query(
          `SELECT role, content, created_at FROM mensagens WHERE numero=$1 ORDER BY created_at ASC LIMIT 300`,
          [numero]
        );
        if (r.rows.length > 0)
          hist = r.rows.map(row => ({ role: row.role, content: row.content, ts: new Date(row.created_at).getTime() }));
      }
    } catch (_) {}

    const msgs = hist.map(m => {
      const bot = m.role === "assistant";
      const txt = (m.content || "")
        .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
        .replace(/\[BOTAO_ESPECIALISTA\]/g,"<em style='color:#a78bfa;font-style:normal'>⬡ Botão Especialista</em>")
        .replace(/\[MENU_INICIAL\]/g,"<em style='color:#a78bfa;font-style:normal'>⊞ Menu enviado</em>")
        .replace(/\[PDF_FOTOS_M\]/g,"<em style='color:#a78bfa;font-style:normal'>📎 Guia masculino</em>")
        .replace(/\[PDF_FOTOS_F\]/g,"<em style='color:#a78bfa;font-style:normal'>📎 Guia feminino</em>")
        .replace(/\[PDF_FOTOS\]/g,"<em style='color:#a78bfa;font-style:normal'>📎 PDF enviado</em>")
        .replace(/\[NOTIF_AGENDAMENTO\]/g,"").replace(/\[NOTIF_TRANSPLANTE\]/g,"").replace(/\[HUMANO\]/g,"")
        .trim();
      if (!txt) return "";
      const hora = m.ts ? new Date(m.ts).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"}) : "";
      return `
<div style="display:flex;justify-content:${bot?'flex-start':'flex-end'};margin-bottom:14px;align-items:flex-end;gap:8px">
  ${bot?`<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0">✦</div>`:''}
  <div style="max-width:72%;${bot
    ?'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);'
    :'background:linear-gradient(135deg,rgba(124,58,237,0.55),rgba(59,130,246,0.45));border:1px solid rgba(124,58,237,0.38);'
  }padding:12px 16px;border-radius:${bot?'4px 18px 18px 18px':'18px 18px 4px 18px'};font-size:14px;white-space:pre-wrap;line-height:1.55;box-shadow:0 4px 16px rgba(0,0,0,0.18)">
    ${hora?`<div style="font-size:10px;color:rgba(255,255,255,0.32);margin-bottom:5px;font-weight:500">${bot?'BOT':'PACIENTE'} · ${hora}</div>`:''}
    <div style="color:rgba(255,255,255,${bot?'0.85':'0.95'})">${txt}</div>
  </div>
  ${!bot?`<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">👤</div>`:''}
</div>`;
    }).join("");

    const min    = Math.floor((agora - (c.ultimaAtividade||agora)) / 60000);
    const inaStr = min < 60 ? `${min}min atrás` : min < 1440 ? `${Math.floor(min/60)}h atrás` : `${Math.floor(min/1440)}d atrás`;

    const TEMPLATES = [
      "Olá! Aqui é da clínica HairTech 🌟 Vi que você entrou em contato. Posso te ajudar?",
      "Temos horários disponíveis esta semana nas unidades de Rio Bonito e Niterói. Qual prefere?",
      "Para confirmar sua consulta, pedimos um sinal de R$150 via Pix CNPJ. Posso te passar os dados?",
      "Nosso WhatsApp da clínica para agendamento: (21) 96781-3366",
      "Ficou alguma dúvida sobre o procedimento? Estou aqui para ajudar 😊",
    ];

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>+${numero} — HairTech</title>
<style>
${CSS_BASE}
html,body{height:100%;overflow:hidden}
body{padding:16px;display:flex;flex-direction:column}
.layout{display:flex;gap:14px;flex:1;min-height:0;overflow:hidden}
.chat-col{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden}
.side-col{width:272px;flex-shrink:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.chat-msgs{flex:1;overflow-y:auto;padding:18px}
label{font-size:11px;color:rgba(255,255,255,0.38);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
@media(max-width:700px){.layout{flex-direction:column}.side-col{width:100%;max-height:40vh}}
</style>
</head>
<body>
<!-- Topo -->
<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-shrink:0;flex-wrap:wrap">
  <a href="/admin?senha=${senha}" style="color:rgba(255,255,255,0.38);text-decoration:none;font-size:13px">← Painel</a>
  <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0">${(c.nome||numero).charAt(0).toUpperCase()}</div>
  <div>
    <div style="font-size:18px;font-weight:700">${c.nome||('+'+numero)}</div>
    ${c.nome?`<div style="font-size:11px;color:rgba(255,255,255,0.35)">+${numero}</div>`:''}
  </div>
  <div style="display:flex;gap:6px;margin-left:auto;flex-wrap:wrap">
    <span class="tag"><span style="width:6px;height:6px;border-radius:50%;background:${DOT_STATUS[c.status]||'#8e8e93'}"></span>${c.status}</span>
    <span class="tag" style="color:${DOT_TEMP[temp]}">${temp}</span>
    <span class="tag">${c.tipo||"novo"}</span>
    <span class="tag" style="color:rgba(255,255,255,0.28)">${hist.length} msgs · ${inaStr}</span>
  </div>
</div>

<div class="layout">
  <!-- Chat -->
  <div class="chat-col">
    <div class="glass" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
      <div class="chat-msgs" id="chat">
        ${msgs || `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.18);font-size:14px">Sem histórico de mensagens</div>`}
      </div>
    </div>
    <!-- Enviar -->
    <div class="glass" style="padding:14px;margin-top:12px;flex-shrink:0">
      <form method="POST" action="/admin/enviar/${numero}?senha=${senha}" id="fEnvio">
        <textarea name="mensagem" id="msgTxt" rows="2" placeholder="Escreva uma mensagem como bot… (Ctrl+Enter para enviar)" style="resize:none;margin-bottom:10px"></textarea>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button type="submit" class="btn" style="background:rgba(124,58,237,0.35);border-color:rgba(124,58,237,0.55);color:#e9d5ff">Enviar</button>
          <a href="/admin/pausar/${numero}?senha=${senha}" class="btn" style="background:rgba(255,159,10,0.18);border-color:rgba(255,159,10,0.38);color:#ff9f0a">Pausar bot</a>
          <a href="/admin/retomar/${numero}?senha=${senha}" class="btn" style="background:rgba(52,199,89,0.18);border-color:rgba(52,199,89,0.38);color:#34c759">Retomar bot</a>
          <a href="/admin/humano/${numero}?senha=${senha}" class="btn" style="background:rgba(0,122,255,0.18);border-color:rgba(0,122,255,0.38);color:#007aff">Assumir</a>
          <a href="/admin/encerrar/${numero}?senha=${senha}" class="btn" style="background:rgba(255,59,48,0.18);border-color:rgba(255,59,48,0.38);color:#ff3b30" onclick="return confirm('Encerrar conversa?')">Encerrar</a>
        </div>
      </form>
    </div>
  </div>

  <!-- Sidebar -->
  <div class="side-col">
    <!-- Editar contato -->
    <div class="card">
      <div style="font-size:11px;color:rgba(255,255,255,0.28);text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px">Contato</div>
      <form method="POST" action="/admin/conversa/${numero}/editar?senha=${senha}">
        <div style="margin-bottom:10px"><label>Nome</label><input name="nome" value="${c.nome||''}" placeholder="Nome do paciente"/></div>
        <div style="margin-bottom:10px"><label>Tags</label><input name="tags" value="${c.tags||''}" placeholder="transplante, retorno…"/></div>
        <div style="margin-bottom:10px"><label>Valor (R$)</label><input name="valor" type="number" value="${c.valor||''}" placeholder="0"/></div>
        <div style="margin-bottom:10px">
          <label>Temperatura</label>
          <select name="temperatura">
            ${['frio','morno','quente'].map(t=>`<option value="${t}"${c.temperatura===t?' selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:12px"><label>Nota</label><textarea name="nota" rows="3" placeholder="Observações…" style="resize:none">${c.nota||''}</textarea></div>
        <button type="submit" class="btn" style="width:100%;justify-content:center;background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.18)">Salvar</button>
      </form>
    </div>

    <!-- Templates -->
    <div class="card">
      <div style="font-size:11px;color:rgba(255,255,255,0.28);text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px">Templates</div>
      ${TEMPLATES.map(t=>`
      <div onclick="document.getElementById('msgTxt').value=\`${t.replace(/`/g,'\\`')}\`;document.getElementById('msgTxt').focus()"
           style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;margin-bottom:8px;cursor:pointer;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.45;transition:background .18s"
           onmouseover="this.style.background='rgba(255,255,255,0.09)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">${t.substring(0,75)}${t.length>75?'…':''}</div>`).join('')}
    </div>
  </div>
</div>

<script>
  const ch = document.getElementById("chat");
  if(ch) ch.scrollTop = ch.scrollHeight;
  document.getElementById("msgTxt").addEventListener("keydown", e => {
    if(e.key==="Enter" && (e.metaKey||e.ctrlKey)) document.getElementById("fEnvio").submit();
  });
</script>
</body></html>`);
  });

  // ===== EDITAR CONTATO =====
  router.post("/conversa/:numero/editar", autenticar, async (req, res) => {
    const { numero } = req.params;
    const senha = req.query.senha;
    const c = conversas[numero];
    if (!c) return res.redirect(`/admin?senha=${senha}`);

    c.nome       = (req.body.nome  || "").trim() || null;
    c.tags       = (req.body.tags  || "").trim();
    c.valor      = parseFloat(req.body.valor) || 0;
    c.temperatura= req.body.temperatura || c.temperatura || "frio";
    c.nota       = (req.body.nota  || "").trim() || null;

    await db.salvarConversa(numero, c).catch(() => {});
    res.redirect(`/admin/conversa/${numero}?senha=${senha}`);
  });

  // ===== ENVIAR MENSAGEM =====
  router.post("/enviar/:numero", autenticar, async (req, res) => {
    const { numero } = req.params;
    const senha = req.query.senha;
    const msg   = (req.body?.mensagem || "").trim();
    if (msg && enviarMensagem) {
      try {
        await enviarMensagem(numero, msg);
        if (conversas[numero]) {
          conversas[numero].historico.push({ role: "assistant", content: msg, ts: Date.now() });
          conversas[numero].ultimaAtividade = Date.now();
          db.salvarConversa(numero, conversas[numero]).catch(() => {});
          db.salvarMensagem(numero, "assistant", msg).catch(() => {});
        }
      } catch (e) { console.error("Erro ao enviar do painel:", e.message); }
    }
    res.redirect(`/admin/conversa/${numero}?senha=${senha}`);
  });

  // ===== INCIDENTES LGPD =====
  const INC_FILE = path.join(__dirname, "data", "incidentes.json");
  function lerIncidentes() {
    try { return JSON.parse(fs.readFileSync(INC_FILE, "utf8")); }
    catch (_) { return []; }
  }
  function salvarIncidentes(lista) { fs.writeFileSync(INC_FILE, JSON.stringify(lista, null, 2)); }

  router.get("/incidentes", autenticar, (req, res) => {
    const lista = lerIncidentes();
    const items = lista.length === 0
      ? `<div style="padding:60px 20px;text-align:center;color:rgba(255,255,255,0.4)">Nenhum incidente registrado.<br/><span style="font-size:12px">Que continue assim.</span></div>`
      : lista.slice().reverse().map(i => {
          const cor = i.severidade === "alta" ? "#ef4444" : i.severidade === "media" ? "#f59e0b" : "#3b82f6";
          return `<div class="card" style="margin-bottom:12px;padding:18px;border-left:3px solid ${cor}">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:8px;flex-wrap:wrap">
              <div style="font-weight:600">${i.id} - ${i.categoria}</div>
              <span class="tag" style="background:${cor}33;border-color:${cor}66;color:${cor}">${i.severidade}</span>
            </div>
            <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:8px">${i.descricao}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.4);font-family:monospace">
              ${i.data} · titulares afetados: ${i.titulares_afetados_estimado || 0} · ANPD: ${i.notificacao_anpd || "—"}
            </div>
          </div>`;
        }).join("");

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Incidentes LGPD — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:980px;margin:0 auto;padding:32px 24px">
${navbar("", "incidentes")}
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px;flex-wrap:wrap;gap:10px">
  <h1 style="font-size:24px;font-weight:700">Incidentes LGPD</h1>
  <a href="/admin/incidentes/novo" class="btn" style="background:rgba(239,68,68,0.2);color:#fca5a5">+ Registrar incidente</a>
</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:18px">Notificacao ANPD obrigatoria em 2 dias uteis para incidentes de risco relevante. Plano em <code>docs/PLANO-INCIDENTES.md</code>.</div>
${items}
</div></body></html>`);
  });

  router.get("/incidentes/novo", autenticar, (req, res) => {
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Novo incidente — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:780px;margin:0 auto;padding:32px 24px">
${navbar("", "incidentes")}
<h1 style="font-size:24px;margin:18px 0">Registrar incidente LGPD</h1>
<form method="POST" action="/admin/incidentes" class="card" style="padding:24px">
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Categoria</label>
  <select name="categoria" required style="margin-bottom:14px">
    <option value="vazamento_credencial">Vazamento de credencial</option>
    <option value="acesso_nao_autorizado">Acesso nao autorizado</option>
    <option value="compromisso_container">Compromisso de container</option>
    <option value="perda_dados">Perda de dados</option>
    <option value="vazamento_pii_ia">Vazamento PII via IA</option>
    <option value="exposicao_publica">Exposicao publica</option>
    <option value="outro">Outro</option>
  </select>
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Severidade</label>
  <select name="severidade" required style="margin-bottom:14px">
    <option value="baixa">Baixa</option>
    <option value="media" selected>Media</option>
    <option value="alta">Alta</option>
  </select>
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Descricao</label>
  <textarea name="descricao" rows="4" required style="margin-bottom:14px"></textarea>
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Titulares afetados (estimativa)</label>
  <input name="titulares_afetados_estimado" type="number" min="0" value="0" style="margin-bottom:14px"/>
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Dados envolvidos (separados por virgula)</label>
  <input name="dados_envolvidos" placeholder="nome, telefone, cpf, anamnese..." style="margin-bottom:14px"/>
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Contencao aplicada</label>
  <textarea name="contencao_aplicada" rows="3" style="margin-bottom:18px"></textarea>
  <button type="submit" class="btn" style="background:rgba(239,68,68,0.3);border-color:rgba(239,68,68,0.5);color:#fca5a5;width:100%;justify-content:center;padding:14px">Registrar</button>
</form>
</div></body></html>`);
  });

  router.post("/incidentes", autenticar, (req, res) => {
    const lista = lerIncidentes();
    const ano = new Date().getFullYear();
    const numero = String(lista.filter(i => i.id.startsWith(`INC-${ano}`)).length + 1).padStart(3, "0");
    const inc = {
      id: `INC-${ano}-${numero}`,
      data: new Date().toISOString(),
      categoria: req.body?.categoria || "outro",
      severidade: req.body?.severidade || "media",
      descricao: (req.body?.descricao || "").toString(),
      titulares_afetados_estimado: parseInt(req.body?.titulares_afetados_estimado || "0", 10),
      dados_envolvidos: (req.body?.dados_envolvidos || "").toString().split(",").map(s => s.trim()).filter(Boolean),
      contencao_aplicada: (req.body?.contencao_aplicada || "").toString(),
      notificacao_anpd: null,
      notificacao_titular: null,
    };
    lista.push(inc);
    salvarIncidentes(lista);

    // Telegram alerta crítico
    const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
    const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
    const txt = `🚨 INCIDENTE LGPD ${inc.id}\nCategoria: ${inc.categoria}\nSeveridade: ${inc.severidade}\n${inc.descricao}\n\nProtocolo: docs/PLANO-INCIDENTES.md\nANPD: 2 dias uteis se risco relevante`;
    require("axios").post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      chat_id: tgChat, text: txt,
    }, { timeout: 5000 }).catch(() => {});

    res.redirect("/admin/incidentes");
  });

  // ===== LGPD: portabilidade (art. 18, V) =====
  // Doctor pode exportar dados de UM paciente em JSON pra atender solicitacao.
  router.get("/paciente/:numero/exportar-lgpd", autenticar, async (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    const c = conversas[num] || {};
    let prontuario = {};
    try { prontuario = JSON.parse(fs.readFileSync(path.join(__dirname, "prontuarios", `${num}.json`), "utf8")); } catch (_) {}

    let agendamentos = [], pagamentos = [], mensagens = [];
    try {
      if (db.pool) {
        const a = await db.pool.query("SELECT * FROM agendamentos WHERE wa_id=$1", [num]);
        agendamentos = a.rows;
        const p = await db.pool.query("SELECT * FROM pagamentos WHERE wa_id=$1 OR lead_id=(SELECT id FROM leads WHERE wa_id=$1 LIMIT 1)", [num]).catch(() => ({rows:[]}));
        pagamentos = p.rows;
        const m = await db.pool.query("SELECT * FROM mensagens WHERE wa_id=$1 ORDER BY ts DESC LIMIT 500", [num]).catch(() => ({rows:[]}));
        mensagens = m.rows;
      }
    } catch (_) {}

    const pacote = {
      gerado_em: new Date().toISOString(),
      numero_whatsapp: num,
      nome: c.nome || null,
      base_legal: "LGPD art. 11, II, f (tutela da saude) + art. 18, V (direito a portabilidade)",
      controlador: "Clinica HairTech - CRM Dr. Ricardo Meireles Marcelino",
      encarregado: "dpo@hairtech.org",
      conversa_atual: { status: c.status, temperatura: c.temperatura, ultima_atividade: c.ultimaAtividade, historico_resumido_msgs: (c.historico || []).length },
      prontuario,
      agendamentos,
      pagamentos,
      mensagens,
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=lgpd-portabilidade-${num}-${new Date().toISOString().slice(0,10)}.json`);
    res.send(JSON.stringify(pacote, null, 2));
  });

  // ===== LGPD: exclusao (art. 18, VI) - marca para apagar =====
  router.post("/paciente/:numero/excluir-lgpd", autenticar, async (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    let resultado = { numero: num, etapas: [] };
    try {
      if (conversas[num]) {
        conversas[num].status = "excluido_lgpd";
        conversas[num].excluido_em = new Date().toISOString();
        delete conversas[num].historico;
        if (db.salvarConversa) await db.salvarConversa(num, conversas[num]).catch(()=>{});
        resultado.etapas.push("conversa marcada excluido_lgpd + historico zerado");
      }
      if (db.pool) {
        await db.pool.query("UPDATE conversations SET historico='[]', nome='[EXCLUIDO LGPD]', status='excluido_lgpd' WHERE numero=$1", [num]).catch(()=>{});
        await db.pool.query("DELETE FROM mensagens WHERE wa_id=$1", [num]).catch(()=>{});
        resultado.etapas.push("DB: mensagens deletadas, conversation anonimizada");
      }
      try {
        fs.unlinkSync(path.join(__dirname, "prontuarios", `${num}.json`));
        resultado.etapas.push("prontuario JSON deletado");
      } catch (_) {}
      resultado.ok = true;
    } catch (e) { resultado.ok = false; resultado.error = e.message; }
    res.json(resultado);
  });

  // ===== LGPD (status visual) =====
  router.get("/lgpd", autenticar, async (req, res) => {
    const wflows = (() => { try { return require("./integrations/whatsapp-flows").status(); } catch (_) { return null; } })();
    const itens = [
      { ok: true, lbl: "Disclosure CFM 2.454/2026", det: "Primeira mensagem do bot informa uso de IA" },
      { ok: true, lbl: "Audit log IA (5 anos)", det: "Tabela audit_ai_calls — viewer em /admin/audit" },
      { ok: true, lbl: "Politica de Privacidade publica", det: "https://hairtech.org/privacidade" },
      { ok: true, lbl: "Termos de Uso publicos", det: "https://hairtech.org/termos" },
      { ok: true, lbl: "DPO designado e publico", det: "https://hairtech.org/dpo (precisa preencher CRM no .env)" },
      { ok: true, lbl: "HTTPS obrigatorio", det: "Traefik + Let's Encrypt" },
      { ok: true, lbl: "Backup encriptado em transito", det: "B2 via TLS + Postgres rede interna" },
      { ok: true, lbl: "Hashing de prompts/respostas no audit", det: "PII nao em claro no audit log" },
      { ok: false, lbl: "Criptografia em repouso (Postgres)", det: "Volume Docker normal - migrar pra LUKS ou pgcrypto coluna" },
      { ok: true, lbl: "Anonimizacao de PII antes da IA", det: "integrations/anonimizar.js - CPF/CNPJ/email/tel/nome trocados por tokens [NOME_1]" },
      { ok: true, lbl: "Direito de portabilidade (art. 18, V)", det: "GET /admin/paciente/:numero/exportar-lgpd retorna JSON completo" },
      { ok: true, lbl: "Direito de exclusao (art. 18, VI)", det: "POST /admin/paciente/:numero/excluir-lgpd anonimiza + deleta" },
      { ok: true, lbl: "Log de acesso ao prontuario", det: "Tabela prontuario_access_log registra cada leitura (ts, wa_id, ip)" },
      { ok: true, lbl: "RIPD (Relatorio de Impacto)", det: "docs/RIPD-RELATORIO-IMPACTO.md - revisao semestral marcada" },
      { ok: true, lbl: "Plano resposta a incidentes", det: "docs/PLANO-INCIDENTES.md + /admin/incidentes para registro" },
      { ok: true, lbl: "Cadeia de processadores documentada", det: "RIPD secao 6 - Meta, Google, OpenAI, Anthropic, Hostinger, B2" },
    ];
    const ok = itens.filter(i => i.ok).length;
    const total = itens.length;
    const pct = Math.round((ok / total) * 100);

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>LGPD — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:980px;margin:0 auto;padding:32px 24px">
${navbar("", "lgpd")}
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px;flex-wrap:wrap;gap:10px">
  <h1 style="font-size:24px;font-weight:700">LGPD - conformidade</h1>
  <div style="font-size:28px;font-weight:700;color:${pct>=80?'#22c55e':pct>=50?'#f59e0b':'#ef4444'}">${pct}%</div>
</div>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px">${ok} de ${total} itens. Documentacao completa em <code>docs/LGPD-CONFORMIDADE.md</code></div>

<div class="card">
${itens.map(i => `<div style="display:flex;align-items:start;gap:14px;padding:14px;border-bottom:1px solid rgba(255,255,255,0.06)">
  <div style="font-size:18px;color:${i.ok?'#22c55e':'#8e8e93'}">${i.ok?'✓':'○'}</div>
  <div style="flex:1">
    <div style="font-size:14px;font-weight:500">${i.lbl}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px">${i.det}</div>
  </div>
</div>`).join("")}
</div>

<div class="card" style="margin-top:18px;border-color:rgba(124,58,237,0.4)">
  <div style="font-size:13px;color:#a78bfa;font-weight:600;margin-bottom:6px">WhatsApp Flows status</div>
  <pre style="font-size:11px;color:rgba(255,255,255,0.6);font-family:monospace">${JSON.stringify(wflows, null, 2)}</pre>
</div>
</div></body></html>`);
  });

  // ===== COMPLIANCE (vencimentos) =====
  const VENC_FILE = path.join(__dirname, "data", "vencimentos.json");
  function lerVenc() {
    try { return JSON.parse(fs.readFileSync(VENC_FILE, "utf8")); }
    catch (_) { return []; }
  }
  function salvarVenc(lista) {
    fs.mkdirSync(path.dirname(VENC_FILE), { recursive: true });
    fs.writeFileSync(VENC_FILE, JSON.stringify(lista, null, 2));
  }

  router.get("/compliance", autenticar, (req, res) => {
    const lista = lerVenc();
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const itens = lista.map(v => {
      const dias = v.vence_em ? Math.floor((new Date(v.vence_em) - hoje) / 86400000) : null;
      let cor = "#8e8e93";
      if (dias !== null) {
        if (dias < 0) cor = "#ef4444";
        else if (dias <= 7) cor = "#f59e0b";
        else if (dias <= 30) cor = "#facc15";
        else if (dias <= 60) cor = "#3b82f6";
        else cor = "#22c55e";
      }
      return `<div class="card" style="margin-bottom:10px;padding:16px;border-left:3px solid ${cor}">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:600;font-size:15px;display:flex;align-items:center;gap:8px">
              ${v.titulo}
              ${v.ativo ? "" : '<span class="tag" style="font-size:10px">inativo</span>'}
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:3px">${v.descricao}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:6px">categoria: ${v.categoria || "—"}${v.notas ? ' · '+v.notas : ''}</div>
          </div>
          <div style="text-align:right;min-width:140px">
            <div style="font-size:18px;font-weight:600;color:${cor}">${v.vence_em ? v.vence_em : "—"}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.5)">${dias === null ? "" : (dias < 0 ? "vencido " + (-dias) + "d" : dias === 0 ? "vence hoje" : "em " + dias + "d")}</div>
            ${v.renovacao_link ? `<a class="btn" href="${v.renovacao_link}" target="_blank" style="margin-top:8px;background:rgba(59,130,246,0.2);color:#60a5fa;font-size:11px;padding:6px 10px">Renovar</a>` : ""}
          </div>
        </div>
      </div>`;
    }).join("");

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Compliance — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:1080px;margin:0 auto;padding:32px 24px">
${navbar("", "compliance")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Compliance e vencimentos</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px">Alerta semanal Telegram para itens com &lt;60 dias.</div>
${itens || '<div class="card" style="padding:40px;text-align:center;color:rgba(255,255,255,0.4)">Sem vencimentos cadastrados</div>'}
<div style="margin-top:20px;font-size:12px;color:rgba(255,255,255,0.4)">Editar em <code>data/vencimentos.json</code></div>
</div></body></html>`);
  });

  // ===== AUDIT IA (CFM 2.454/2026 - log de 5 anos) =====
  router.get("/audit", autenticar, async (req, res) => {
    const dias = Math.min(parseInt(req.query.dias || "7", 10), 90);
    const exportar = req.query.export === "csv";
    let rows = [];
    let stats = { total: 0, por_modelo: [], por_agente: [] };
    let erro = null;

    try {
      if (db.pool) {
        const r1 = await db.pool.query(`
          SELECT id, ts, agente, modelo, tokens_in, tokens_out, prompt_hash, response_hash
          FROM audit_ai_calls
          WHERE ts > NOW() - ($1 || ' days')::interval
          ORDER BY ts DESC
          LIMIT 500
        `, [String(dias)]);
        rows = r1.rows;
        const r2 = await db.pool.query(`
          SELECT modelo, COUNT(*)::int AS qtd, COALESCE(SUM(tokens_in+tokens_out),0)::bigint AS tokens
          FROM audit_ai_calls WHERE ts > NOW() - ($1 || ' days')::interval GROUP BY modelo ORDER BY qtd DESC
        `, [String(dias)]);
        stats.por_modelo = r2.rows;
        const r3 = await db.pool.query(`
          SELECT agente, COUNT(*)::int AS qtd FROM audit_ai_calls
          WHERE ts > NOW() - ($1 || ' days')::interval GROUP BY agente ORDER BY qtd DESC
        `, [String(dias)]);
        stats.por_agente = r3.rows;
        stats.total = rows.length;
      }
    } catch (e) { erro = e.message; }

    if (exportar) {
      const csv = ["id,ts,agente,modelo,tokens_in,tokens_out,prompt_hash,response_hash",
        ...rows.map(r => `${r.id},${r.ts?.toISOString?.()||r.ts},"${r.agente||""}","${r.modelo||""}",${r.tokens_in||0},${r.tokens_out||0},${r.prompt_hash||""},${r.response_hash||""}`)
      ].join("\n");
      res.setHeader("Content-Type", "text/csv;charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=audit-ia-${dias}d.csv`);
      return res.send("﻿" + csv);
    }

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Audit IA — HairTech</title><style>${CSS_BASE}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}</style></head>
<body><div style="max-width:1280px;margin:0 auto;padding:32px 24px">
${navbar("", "audit")}
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px;flex-wrap:wrap;gap:10px">
  <h1 style="font-size:24px;font-weight:700">Auditoria de chamadas IA</h1>
  <div style="display:flex;gap:8px">
    <a href="/admin/audit?dias=7" class="btn" style="background:rgba(255,255,255,0.06)">7d</a>
    <a href="/admin/audit?dias=30" class="btn" style="background:rgba(255,255,255,0.06)">30d</a>
    <a href="/admin/audit?dias=90" class="btn" style="background:rgba(255,255,255,0.06)">90d</a>
    <a href="/admin/audit?dias=${dias}&export=csv" class="btn" style="background:rgba(34,197,94,0.2);color:#86efac">↓ CSV</a>
  </div>
</div>
<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:18px">CFM 2.454/2026 exige retencao de 5 anos. Prompts e respostas armazenados apenas como hash (LGPD).</div>

${erro ? `<div class="card" style="border-color:rgba(239,68,68,0.4);color:#fca5a5">${erro}</div>` : ""}

<div class="grid" style="margin-bottom:18px">
  ${stats.por_modelo.map(m => `<div class="card" style="padding:16px">
    <div style="font-size:11px;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:4px">${m.modelo}</div>
    <div style="font-size:22px;font-weight:600">${m.qtd}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">${m.tokens.toLocaleString('pt-BR')} tokens</div>
  </div>`).join("")}
</div>

<div class="card">
  <table style="font-size:12px">
    <thead><tr>
      <th style="padding:10px 14px">Timestamp</th>
      <th style="padding:10px 14px">Agente</th>
      <th style="padding:10px 14px">Modelo</th>
      <th style="padding:10px 14px;text-align:right">Tokens</th>
      <th style="padding:10px 14px;font-family:monospace">Hash</th>
    </tr></thead>
    <tbody>
      ${rows.slice(0, 200).map(r => `<tr class="row">
        <td style="padding:10px 14px;font-family:monospace;color:rgba(255,255,255,0.6)">${new Date(r.ts).toLocaleString("pt-BR")}</td>
        <td style="padding:10px 14px">${r.agente || "—"}</td>
        <td style="padding:10px 14px;color:rgba(255,255,255,0.6)">${r.modelo}</td>
        <td style="padding:10px 14px;text-align:right">${(r.tokens_in||0)+(r.tokens_out||0)}</td>
        <td style="padding:10px 14px;font-family:monospace;font-size:10px;color:rgba(255,255,255,0.4)">${(r.prompt_hash||"").slice(0,12)}…${(r.response_hash||"").slice(0,8)}</td>
      </tr>`).join("") || '<tr><td colspan="5" style="padding:40px;text-align:center;color:rgba(255,255,255,0.4)">Sem registros</td></tr>'}
    </tbody>
  </table>
</div>
</div></body></html>`);
  });

  // ===== DASHBOARD EXECUTIVO (graficos com Chart.js via CDN) =====
  router.get("/dashboard", autenticar, async (req, res) => {
    let dados = { leads_por_dia: [], temperatura: {}, agendamentos_por_dia: [], receita_30d: 0, conversas_total: 0 };

    try {
      if (db.pool) {
        // Leads por dia, ultimos 30 dias
        const r1 = await db.pool.query(`
          SELECT TO_CHAR(DATE(to_timestamp(ultima_atividade/1000)), 'YYYY-MM-DD') AS dia,
                 COUNT(*)::int AS qtd
          FROM conversations
          WHERE ultima_atividade > EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000
          GROUP BY dia ORDER BY dia
        `);
        dados.leads_por_dia = r1.rows;

        const r2 = await db.pool.query(`
          SELECT temperatura, COUNT(*)::int AS qtd
          FROM conversations WHERE status='ativo' GROUP BY temperatura
        `);
        r2.rows.forEach(r => { dados.temperatura[r.temperatura || "indef"] = r.qtd; });

        const r3 = await db.pool.query("SELECT COUNT(*)::int AS qtd FROM conversations");
        dados.conversas_total = r3.rows[0].qtd;

        try {
          const r4 = await db.pool.query(`
            SELECT TO_CHAR(DATE(data_hora), 'YYYY-MM-DD') AS dia, COUNT(*)::int AS qtd
            FROM agendamentos
            WHERE data_hora > NOW() - INTERVAL '30 days' AND data_hora < NOW() + INTERVAL '30 days'
            GROUP BY dia ORDER BY dia
          `);
          dados.agendamentos_por_dia = r4.rows;

          const r5 = await db.pool.query(`
            SELECT COALESCE(SUM(valor), 0) AS total
            FROM pagamentos
            WHERE status IN ('pago','confirmado') AND created_at > NOW() - INTERVAL '30 days'
          `);
          dados.receita_30d = Number(r5.rows[0].total || 0);
        } catch (_) {}
      }
    } catch (e) { dados.erro = e.message; }

    const dadosJSON = JSON.stringify(dados);
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Dashboard executivo — HairTech</title>
<style>${CSS_BASE}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.kpi{padding:24px;text-align:center}.kpi .v{font-size:32px;font-weight:700;letter-spacing:-1px}.kpi .l{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.4);margin-top:6px}
canvas{max-width:100%}
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body><div style="max-width:1280px;margin:0 auto;padding:32px 24px">
${navbar("", "dashboard")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Dashboard executivo</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px">Visao 30 dias</div>

<div class="grid" style="margin-bottom:20px">
  <div class="card kpi"><div class="v" id="kpi-conversas">—</div><div class="l">Conversas total</div></div>
  <div class="card kpi"><div class="v" id="kpi-quentes">—</div><div class="l">Leads quentes ativos</div></div>
  <div class="card kpi"><div class="v" id="kpi-agend">—</div><div class="l">Agendamentos 30d</div></div>
  <div class="card kpi"><div class="v" id="kpi-rec">—</div><div class="l">Receita 30d</div></div>
</div>

<div class="grid">
  <div class="card" style="padding:24px"><h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:14px">Leads ativos por dia</h2><canvas id="g-leads" height="180"></canvas></div>
  <div class="card" style="padding:24px"><h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:14px">Distribuicao temperatura</h2><canvas id="g-temp" height="180"></canvas></div>
</div>

<div class="card" style="padding:24px;margin-top:18px"><h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:14px">Agendamentos por dia (-30d / +30d)</h2><canvas id="g-agend" height="120"></canvas></div>

<script>
  const dados = ${dadosJSON};
  document.getElementById('kpi-conversas').textContent = dados.conversas_total || 0;
  document.getElementById('kpi-quentes').textContent = dados.temperatura.quente || 0;
  document.getElementById('kpi-agend').textContent = (dados.agendamentos_por_dia || []).reduce((s,d) => s+d.qtd, 0);
  document.getElementById('kpi-rec').textContent = 'R$ ' + Number(dados.receita_30d || 0).toFixed(2).replace('.', ',');

  const corBase = 'rgba(124,58,237,0.6)';
  Chart.defaults.color = 'rgba(255,255,255,0.6)';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';

  new Chart(document.getElementById('g-leads'), {
    type: 'line',
    data: {
      labels: dados.leads_por_dia.map(d => d.dia.slice(5)),
      datasets: [{ label: 'leads ativos', data: dados.leads_por_dia.map(d => d.qtd), borderColor: corBase, backgroundColor: 'rgba(124,58,237,0.15)', fill: true, tension: 0.3 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  new Chart(document.getElementById('g-temp'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(dados.temperatura),
      datasets: [{ data: Object.values(dados.temperatura), backgroundColor: ['#ff3b30', '#ff9f0a', '#8e8e93', '#666'] }]
    },
    options: { responsive: true }
  });

  new Chart(document.getElementById('g-agend'), {
    type: 'bar',
    data: {
      labels: dados.agendamentos_por_dia.map(d => d.dia.slice(5)),
      datasets: [{ label: 'agendamentos', data: dados.agendamentos_por_dia.map(d => d.qtd), backgroundColor: 'rgba(59,130,246,0.6)' }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
</script>
</div></body></html>`);
  });

  // ===== CONTRATOS DOCUSIGN =====
  router.get("/contratos", autenticar, (req, res) => {
    const ds = (() => { try { return require("./integrations/docusign").status(); } catch (_) { return null; } })();
    const pacientes = Object.entries(conversas)
      .filter(([_, c]) => c.status === "ativo" || c.status === "humano")
      .map(([num, c]) => ({ numero: num, nome: c.nome, temperatura: c.temperatura, tipo: c.tipo }))
      .sort((a, b) => {
        const order = { quente: 0, morno: 1, frio: 2 };
        return (order[a.temperatura] || 9) - (order[b.temperatura] || 9);
      })
      .slice(0, 50);

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Contratos DocuSign — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:1000px;margin:0 auto;padding:32px 24px">
${navbar("", "contratos")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Contratos DocuSign</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:16px">Enviar contrato Paciente Modelo via DocuSign WhatsApp. Paciente assina pelo celular sem precisar de email.</div>

<div class="card" style="margin-bottom:16px;padding:18px;border-left:3px solid ${ds && ds.configured ? '#22c55e' : '#f59e0b'}">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
    <div style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:${ds && ds.configured ? '#22c55e' : '#f59e0b'};font-weight:600">Status DocuSign</div>
    <div style="font-size:13px;font-weight:600;color:${ds && ds.configured ? '#22c55e' : '#f59e0b'}">${ds && ds.configured ? "PRONTO" : "FALTAM " + (ds?.missing?.length || 0) + " CHAVES"}</div>
  </div>
  <div style="font-size:12px;color:rgba(255,255,255,0.65);line-height:1.7;font-family:monospace">
    USER_ID: ${ds?.user_id || "—"}<br/>
    ACCOUNT_ID: ${ds?.account_id || "—"}<br/>
    BASE_URI: ${ds?.base_uri || "—"}<br/>
    ${ds?.missing?.length > 0 ? `<br/><span style="color:#f59e0b">Faltam:</span><br/>${ds.missing.map(m => `${m}`).join("<br/>")}` : '<span style="color:#22c55e">✓ Todas configuradas</span>'}
  </div>
  ${!ds || !ds.configured ? '<a href="/admin/contratos/guia" class="btn" style="margin-top:14px;background:rgba(245,158,11,0.25);color:#fbbf24">📖 Como obter as chaves (passo a passo)</a>' : ""}
</div>

${ds && ds.configured ? `
<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin:24px 0 12px">Enviar contrato pra paciente</h2>

<div class="card">
  ${pacientes.length === 0 ? '<div style="padding:30px;text-align:center;color:rgba(255,255,255,0.4)">Nenhum paciente ativo no momento.</div>' : pacientes.map(p => `<div style="padding:14px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
    <div>
      <div style="font-weight:600">${p.nome || "(sem nome)"}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);font-family:monospace">+${p.numero} · ${p.tipo}</div>
    </div>
    <a href="/admin/contratos/enviar/${p.numero}" class="btn" style="background:rgba(34,197,94,0.25);color:#86efac;font-size:12px;padding:8px 14px">Enviar contrato →</a>
  </div>`).join("")}
</div>
` : ""}

</div></body></html>`);
  });

  router.get("/contratos/enviar/:numero", autenticar, (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    const c = conversas[num] || {};
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Enviar contrato — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:680px;margin:0 auto;padding:32px 24px">
${navbar("", "contratos")}
<a href="/admin/contratos" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:13px">← Voltar pra contratos</a>
<h1 style="font-size:22px;margin:18px 0">Enviar contrato Paciente Modelo</h1>
<form method="POST" action="/admin/contratos/enviar/${num}" class="card" style="padding:22px">
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase">Nome completo do paciente</label>
  <input name="nome" value="${c.nome || ''}" required style="margin:8px 0 14px"/>

  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase">CPF (so numeros)</label>
  <input name="cpf" placeholder="00000000000" required style="margin:8px 0 14px"/>

  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase">Email (opcional - usa WhatsApp se vazio)</label>
  <input name="email" type="email" placeholder="paciente@email.com" style="margin:8px 0 14px"/>

  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase">Telefone WhatsApp (com 55)</label>
  <input name="telefone" value="${num}" required style="margin:8px 0 14px"/>

  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase">Valor (R$)</label>
  <select name="valor" required style="margin:8px 0 14px">
    <option value="8500">R$ 8.500 (à vista, metade antes/metade dia)</option>
    <option value="9000">R$ 9.000 (12x sem juros - R$ 750/mês)</option>
  </select>

  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase">Data prevista cirurgia</label>
  <input name="dataCirurgia" type="date" required style="margin:8px 0 14px"/>

  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase">Unidade</label>
  <select name="unidade" required style="margin:8px 0 18px">
    <option value="Rio Bonito">Rio Bonito</option>
    <option value="Niteroi">Niterói</option>
    <option value="Barra">Barra da Tijuca</option>
  </select>

  <button type="submit" class="btn" style="background:rgba(34,197,94,0.3);border-color:rgba(34,197,94,0.5);color:#86efac;width:100%;padding:14px;font-size:15px;justify-content:center">📄 Enviar contrato via DocuSign</button>
</form>
</div></body></html>`);
  });

  router.post("/contratos/enviar/:numero", autenticar, async (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    let resultado;
    try {
      const ds = require("./integrations/docusign");
      resultado = await ds.enviarContratoFUE({
        nome: req.body?.nome,
        cpf: (req.body?.cpf || "").replace(/\D/g, ""),
        valor: parseFloat(req.body?.valor || "0"),
        dataCirurgia: req.body?.dataCirurgia,
        unidade: req.body?.unidade,
        telefone: req.body?.telefone || num,
        email: req.body?.email,
      });

      // Notifica Telegram
      const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
      const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
      require("axios").post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        chat_id: tgChat,
        text: `📄 Contrato DocuSign enviado pra ${req.body?.nome} (+${num}). EnvelopeId: ${resultado?.envelopeId || 'N/A'}`,
      }, { timeout: 5000 }).catch(() => {});
    } catch (e) {
      resultado = { ok: false, error: e.message };
    }
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Resultado</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:680px;margin:0 auto;padding:32px 24px">
${navbar("", "contratos")}
<h1 style="font-size:22px;margin:18px 0">${resultado.ok ? "✅ Contrato enviado" : "❌ Falhou"}</h1>
<div class="card" style="white-space:pre-wrap;font-family:monospace;font-size:12px;color:rgba(255,255,255,0.7)">${JSON.stringify(resultado, null, 2)}</div>
<div style="margin-top:18px"><a href="/admin/contratos" class="btn" style="background:rgba(255,255,255,0.1)">← contratos</a></div>
</div></body></html>`);
  });

  router.get("/contratos/guia", autenticar, (req, res) => {
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Guia DocuSign — HairTech</title><style>${CSS_BASE}.step{padding:18px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:14px}.step h3{font-size:14px;color:#a78bfa;margin-bottom:8px}.step ol{margin-left:22px}.step li{margin-bottom:6px;font-size:13px}code{background:rgba(0,0,0,0.4);padding:2px 6px;border-radius:4px;font-size:11px}</style></head>
<body><div style="max-width:780px;margin:0 auto;padding:32px 24px">
${navbar("", "contratos")}
<a href="/admin/contratos" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:13px">← Voltar</a>
<h1 style="font-size:24px;margin:18px 0">Guia: obter as 4 chaves DocuSign faltantes</h1>

<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:18px">Tempo total: ~15 min. Você ja tem 3 IDs (USER_ID, ACCOUNT_ID, BASE_URI). Falta:</div>

<div class="step">
  <h3>1. DOCUSIGN_INTEGRATION_KEY (~3 min)</h3>
  <ol>
    <li>Acesse <a href="https://admin.docusign.com" target="_blank" style="color:#60a5fa">admin.docusign.com</a></li>
    <li>Login com sua conta (clinica.hairtech@icloud.com)</li>
    <li>Menu lateral: <strong>Integrations</strong> → <strong>Apps and Keys</strong></li>
    <li>Botão <strong>ADD APP / INTEGRATION KEY</strong></li>
    <li>Nome do app: <code>HairTech-WhatsApp</code></li>
    <li>Copia o <strong>Integration Key (GUID)</strong> que aparece</li>
    <li>Adiciona ao .env: <code>DOCUSIGN_INTEGRATION_KEY=&lt;cola_aqui&gt;</code></li>
  </ol>
</div>

<div class="step">
  <h3>2. DOCUSIGN_RSA_PRIVATE_KEY_BASE64 (~5 min)</h3>
  <ol>
    <li>Na mesma página do app criado, role até <strong>Authentication</strong></li>
    <li>Aba <strong>Service Integration</strong> (ou similar)</li>
    <li>Botão <strong>+ ADD RSA KEYPAIR</strong></li>
    <li>DocuSign mostra a <strong>Private Key</strong> (texto com -----BEGIN RSA PRIVATE KEY-----...) <strong>UMA UNICA VEZ</strong>. Copia tudo.</li>
    <li>No Mac, abre Terminal e cola:<br/><code>echo "&lt;chave_com_quebras&gt;" | base64</code></li>
    <li>Resultado é uma string longa em base64. Adiciona ao .env:<br/><code>DOCUSIGN_RSA_PRIVATE_KEY_BASE64=&lt;string_base64&gt;</code></li>
  </ol>
</div>

<div class="step">
  <h3>3. DOCUSIGN_HMAC_SECRET (~2 min)</h3>
  <ol>
    <li>Menu lateral: <strong>Integrations</strong> → <strong>Connect</strong></li>
    <li>Botão <strong>+ ADD CONFIGURATION</strong> → <strong>Custom</strong></li>
    <li>URL: <code>https://hairtech.org/webhooks/docusign</code></li>
    <li>Eventos: marca todos os de "Envelope" (Sent, Delivered, Completed, Voided)</li>
    <li>Em <strong>HMAC Authentication</strong>: clica <strong>Add Secret</strong></li>
    <li>Copia o secret gerado</li>
    <li>Adiciona ao .env: <code>DOCUSIGN_HMAC_SECRET=&lt;secret&gt;</code></li>
  </ol>
</div>

<div class="step">
  <h3>4. DOCUSIGN_TEMPLATE_ID_FUE (~5 min)</h3>
  <ol>
    <li>Acesse <a href="https://app.docusign.com/templates" target="_blank" style="color:#60a5fa">app.docusign.com/templates</a></li>
    <li>Botão <strong>NEW</strong> → <strong>Create Template</strong></li>
    <li>Faz upload do PDF <code>contrato_paciente_modelo_transplante_capilar.docx</code> (que o Codex criou)</li>
    <li>Adiciona campos:
      <ul style="margin-left:20px;margin-top:4px">
        <li>Recipient: nome <code>Paciente</code></li>
        <li>Text fields: <code>nome_paciente</code>, <code>cpf_paciente</code>, <code>valor</code>, <code>data_cirurgia</code>, <code>unidade</code></li>
        <li>Signature: Paciente (linha onde ele assina)</li>
      </ul>
    </li>
    <li>Save Template. Copia o <strong>Template ID</strong> da URL</li>
    <li>Adiciona ao .env: <code>DOCUSIGN_TEMPLATE_ID_FUE=&lt;id&gt;</code></li>
  </ol>
</div>

<div class="card" style="margin-top:18px;border-color:rgba(124,58,237,0.5);padding:18px">
  <div style="font-size:13px;color:#a78bfa;font-weight:600;margin-bottom:6px">Apos colocar tudo no .env</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.75);line-height:1.7">
    SSH na VPS:<br/>
    <code style="display:block;padding:10px;background:rgba(0,0,0,0.4);border-radius:6px;margin-top:6px">ssh root@72.62.100.6<br/>nano /home/user/nodejs/.env  # adiciona as 4 vars<br/>docker compose up -d --force-recreate assistente-virtual</code>
    <br/>OU simplesmente espera 2min: T26 do auto-apply.sh detecta .env mudou e recreate sozinho.
  </div>
</div>

<div class="card" style="margin-top:14px;border-color:rgba(245,158,11,0.4);padding:16px">
  <div style="font-size:12px;color:#fbbf24;font-weight:600;margin-bottom:6px">⚠ Multi-Channel Delivery (WhatsApp)</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.65);line-height:1.6">
    Pra enviar contrato direto via WhatsApp (em vez de email), precisa ativar o add-on <strong>Multi-Channel Delivery</strong> na conta DocuSign. Custa ~US$ 0.50 por envelope WhatsApp. Se preferir email gratuito, sem problema - o paciente recebe por email e assina lá.
  </div>
</div>

</div></body></html>`);
  });

  // ===== INVESTIGACAO WHATSAPP (auditoria do WhatsApp pessoal via WAHA) =====
  router.get("/investigacao", autenticar, async (req, res) => {
    let resultado = null;
    let erro = null;
    try {
      const wc = require("./integrations/waha-chats");
      resultado = await wc.auditarTudo({ limit: parseInt(req.query.limit || "100", 10) });
    } catch (e) { erro = e.message; }

    const cat = (tipo, cor, label) => {
      const lista = resultado?.por_categoria?.[tipo] || [];
      return `<div class="card" style="margin-bottom:14px;padding:18px;border-left:3px solid ${cor}">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
          <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:${cor}">${label}</h2>
          <span style="font-size:22px;font-weight:700;color:${cor}">${lista.length}</span>
        </div>
        ${lista.length === 0 ? '<div style="color:rgba(255,255,255,0.4);font-size:13px">nenhum</div>' :
          lista.slice(0, 30).map(item => `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <span style="font-weight:600">${item.nome || item.numero}</span>
              <span style="color:rgba(255,255,255,0.4);font-family:monospace">${item.numero}</span>
            </div>
            <div style="color:rgba(255,255,255,0.55);margin-top:2px">${(item.ultima_msg_preview || "").replace(/</g,"&lt;")}</div>
          </div>`).join("")}
        ${lista.length > 30 ? `<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:8px">+ ${lista.length - 30} outros</div>` : ""}
      </div>`;
    };

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Investigacao WhatsApp — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:1080px;margin:0 auto;padding:32px 24px">
${navbar("", "investigacao")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Investigacao WhatsApp pessoal</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:16px">Auditoria automatica das conversas do +5521967813366 (mesma sessao da ANA). Classificacao via regex: cobrancas, pacientes transplante, pacientes MMP, agendamentos, fornecedores, bancos, pessoal.</div>

${erro ? `<div class="card" style="border-color:rgba(239,68,68,0.4);color:#fca5a5;padding:14px;margin-bottom:18px">
  <div style="font-weight:600;margin-bottom:6px">Erro:</div>
  <pre style="font-size:11px;white-space:pre-wrap">${erro}</pre>
  <div style="font-size:12px;margin-top:8px;color:rgba(255,255,255,0.6)">Possiveis causas: WAHA offline, sessao desconectada, ou WAHA_API_KEY ausente. Verifique /admin/status.</div>
</div>` : `<div class="card" style="padding:12px;margin-bottom:16px;font-size:12px;color:rgba(255,255,255,0.5)">
  Total de chats lidos: <strong style="color:#fff">${resultado?.total || 0}</strong> · Erros: ${resultado?.erros?.length || 0}
</div>`}

${resultado ? `
${cat("cobranca", "#ef4444", "💸 Cobrancas detectadas")}
${cat("paciente_transplante", "#22c55e", "🩺 Pacientes transplante")}
${cat("paciente_mmp", "#3b82f6", "💉 Pacientes MMP/tratamento")}
${cat("agendamento", "#f59e0b", "📅 Agendamentos/reagendar")}
${cat("fornecedor", "#8b5cf6", "📦 Fornecedores")}
${cat("banco", "#06b6d4", "🏦 Bancos / Pix")}
${cat("pessoal_ou_outro", "#8e8e93", "📋 Pessoal / outros")}
` : ""}

<div style="margin-top:18px">
  <a href="/admin/investigacao?limit=300" class="btn" style="background:rgba(255,255,255,0.1)">Re-rodar com 300 chats</a>
  <a href="/admin/portal" class="btn" style="background:rgba(255,255,255,0.1);margin-left:8px">← portal</a>
</div>

</div></body></html>`);
  });

  // ===== GRUPO WAHA (Timeless) - add via WAHA ou link de convite =====
  router.get("/grupo", autenticar, async (req, res) => {
    let grupos = [];
    let timeless = null;
    let link = null;
    let erro = null;
    let wahaSt = null;
    try {
      const wg = require("./integrations/waha-groups");
      wahaSt = wg.status();
      try {
        const lista = await wg.listarGrupos();
        grupos = Array.isArray(lista) ? lista : (lista.groups || lista.data || []);
        timeless = grupos.find(g => {
          const n = (g.subject || g.name || g.title || "").toLowerCase();
          return n.includes("timeless");
        });
        if (timeless) {
          const id = timeless.id?._serialized || timeless.id || timeless.gid;
          try { link = await wg.obterLinkConvite(id); } catch (e) { erro = "Link: " + e.message; }
        }
      } catch (e) { erro = "Listagem: " + e.message; }
    } catch (e) { erro = "Modulo: " + e.message; }

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Grupo Timeless — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:32px 24px">
${navbar("", "grupo")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Grupo Timeless (WAHA / ANA)</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:16px">ANA usa mesma sessao do seu WhatsApp pessoal — ela ve seus grupos. Permite adicionar via WAHA ou via link de convite.</div>

<div class="card" style="margin-bottom:14px;padding:14px;border-left:3px solid ${wahaSt?.api_key_present?'#22c55e':'#ef4444'}">
  <div style="font-size:12px;color:rgba(255,255,255,0.5)">WAHA status</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.75);font-family:monospace;margin-top:4px">${JSON.stringify(wahaSt, null, 2)}</div>
  ${erro ? `<div style="margin-top:8px;font-size:12px;color:#ef4444">Erro: ${erro}</div>` : ""}
</div>

${timeless ? `<div class="card" style="padding:18px;margin-bottom:14px;border-left:3px solid #22c55e">
  <div style="font-weight:700;font-size:16px;margin-bottom:6px">✓ Grupo Timeless encontrado</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.5);font-family:monospace">${timeless.id?._serialized || timeless.id || ""}</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px">${(timeless.participants?.length || timeless.size || "?")} participantes</div>
</div>` : `<div class="card" style="padding:18px;margin-bottom:14px;border-left:3px solid #f59e0b">
  <div style="font-weight:600;color:#f59e0b">⚠ Grupo "Timeless" nao encontrado</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:6px">Pode ser que:<br/>1. Nome do grupo seja diferente (vide lista abaixo)<br/>2. ANA WAHA nao esteja conectada<br/>3. Voce ainda nao tenha sido adicionado ao grupo nesse numero</div>
  ${grupos.length > 0 ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:rgba(255,255,255,0.6)">Ver ${grupos.length} grupos que WAHA enxerga</summary><div style="margin-top:8px;font-family:monospace;font-size:11px;color:rgba(255,255,255,0.55);max-height:300px;overflow-y:auto">${grupos.map(g => `${g.subject || g.name || "?"} <span style="color:rgba(255,255,255,0.3)">${g.id?._serialized || g.id || ""}</span>`).join("<br/>")}</div></details>` : ""}
</div>`}

${link ? `<div class="card" style="padding:18px;margin-bottom:14px;background:linear-gradient(135deg,#22c55e15,#10b98115);border-color:rgba(34,197,94,0.4)">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:#22c55e;margin-bottom:10px">Link de convite (compartilhar com clientes)</h2>
  <input value="${link.url}" readonly style="margin-bottom:10px;font-family:monospace;font-size:12px"/>
  <form method="POST" action="/admin/grupo/incluir-no-blitz" style="display:flex;gap:8px;flex-wrap:wrap">
    <button type="submit" name="acao" value="adicionar_blitz" class="btn" style="background:rgba(34,197,94,0.3);color:#86efac;font-size:13px">+ Incluir link nas msgs do BLITZ</button>
    <a href="https://wa.me/?text=${encodeURIComponent("Acabei de te chamar pro grupo Timeless da HairTech: " + link.url)}" target="_blank" class="btn" style="background:rgba(37,211,102,0.25);color:#4ade80;font-size:13px">Compartilhar via WhatsApp</a>
  </form>
</div>` : ""}

${timeless ? `<div class="card" style="padding:18px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:10px">Adicionar direto (via WAHA)</h2>
  <div style="font-size:11px;color:#f59e0b;margin-bottom:12px">⚠ So funciona se a pessoa tem privacidade=Todos. Maioria nao tem. Recomendado: usar link de convite acima.</div>
  <form method="POST" action="/admin/grupo/add-direto">
    <input type="hidden" name="group_id" value="${timeless.id?._serialized || timeless.id || ""}"/>
    <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Numeros (um por linha, com 55 ou sem)</label>
    <textarea name="numeros" rows="6" placeholder="5521987654321&#10;5521912345678&#10;..." style="margin:8px 0 12px;font-family:monospace;font-size:13px"></textarea>
    <button type="submit" class="btn" style="background:rgba(124,58,237,0.3);border-color:rgba(124,58,237,0.5);color:#a78bfa;width:100%;justify-content:center;padding:12px">Adicionar tentar via WAHA</button>
  </form>
</div>` : ""}

</div></body></html>`);
  });

  router.post("/grupo/incluir-no-blitz", autenticar, async (req, res) => {
    try {
      const wg = require("./integrations/waha-groups");
      const grupos = await wg.listarGrupos();
      const lista = Array.isArray(grupos) ? grupos : (grupos.groups || grupos.data || []);
      const timeless = lista.find(g => (g.subject || g.name || "").toLowerCase().includes("timeless"));
      if (!timeless) return res.send("Grupo Timeless nao encontrado");
      const id = timeless.id?._serialized || timeless.id;
      const link = await wg.obterLinkConvite(id);

      // Atualiza blitz-mensagens.json adicionando link
      const arq = path.join(__dirname, "data", "blitz-mensagens.json");
      const msgs = JSON.parse(fs.readFileSync(arq, "utf8"));
      const linha = `\n\nGrupo Timeless (vagas + atualizacoes): ${link.url}`;
      if (!msgs.quentes.includes(link.url)) msgs.quentes += linha;
      if (!msgs.mornos.includes(link.url)) msgs.mornos += linha;
      fs.writeFileSync(arq, JSON.stringify(msgs, null, 2));
      res.redirect("/admin/blitz");
    } catch (e) {
      res.send(`Erro: ${e.message}`);
    }
  });

  router.post("/grupo/add-direto", autenticar, async (req, res) => {
    const groupId = req.body?.group_id;
    const numerosRaw = (req.body?.numeros || "").toString();
    const numeros = numerosRaw.split("\n").map(n => n.replace(/\D/g, "")).filter(n => n.length >= 12);
    if (!groupId || numeros.length === 0) return res.send("dados invalidos");

    let resultado;
    try {
      const wg = require("./integrations/waha-groups");
      resultado = await wg.adicionarParticipante(groupId, numeros);
    } catch (e) {
      resultado = { erro: e.message };
    }
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="background:#1a0533;color:#fff;font-family:sans-serif;padding:32px;max-width:800px;margin:0 auto">
<h1>Resultado adicao</h1>
<pre style="background:rgba(255,255,255,0.05);padding:16px;border-radius:8px;white-space:pre-wrap">${JSON.stringify(resultado, null, 2)}</pre>
<a href="/admin/grupo" style="color:#a78bfa">← voltar</a>
</body></html>`);
  });

  // ===== AUTO-CADASTRO (Anthropic Computer Use) =====
  // Claude opera browser virtual da Anthropic pra cadastrar em servicos externos.
  // Limitacoes: CAPTCHA -> handoff humano. Email verification: nesta versao Dr.
  // tem que clicar no link. Versao futura usa Gmail MCP pra auto-verificar.
  router.get("/auto-cadastro", autenticar, (req, res) => {
    const acu = (() => { try { return require("./integrations/anthropic-computer-use"); } catch (_) { return null; } })();
    const st = acu ? acu.status() : { configurado: false };

    const servicos = [
      { id: "backblaze", nome: "Backblaze B2 (backup)", url: "https://www.backblaze.com/b2/sign-up.html", cartao: false, custo: "Grátis até 10GB" },
      { id: "memed", nome: "Memed (prescrição)", url: "https://memed.com.br/integracao", cartao: false, custo: "Grátis pra médico" },
      { id: "cfm-prescricao", nome: "Solicitar credenciais CFM Prescrição", url: "https://sistemas.cfm.org.br/contatoprescricaoeletronica/br", cartao: false, custo: "R$ 0" },
      { id: "focusnfe", nome: "FocusNFe (NFS-e)", url: "https://focusnfe.com.br", cartao: true, custo: "R$ 0,15-0,40/nota (mín. R$ 30 pré-pago)" },
    ];

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Auto-cadastro — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:32px 24px">
${navbar("", "auto-cadastro")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Auto-cadastro via Anthropic Computer Use</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:16px">Claude opera browser virtual na sandbox da Anthropic pra fazer cadastro em servicos. Limitacoes: CAPTCHA = handoff humano. Email de verificacao: voce clica no link.</div>

<div class="card" style="margin-bottom:16px;padding:14px;border-left:3px solid ${st.configurado?'#22c55e':'#ef4444'}">
  <div style="font-size:12px;color:rgba(255,255,255,0.5)">Status:</div>
  <div style="font-size:13px;color:${st.configurado?'#86efac':'#fca5a5'};font-weight:600">${st.configurado?'OK - ANTHROPIC_API_KEY presente':'AUSENTE - falta ANTHROPIC_API_KEY no .env do AV'}</div>
  ${!st.configurado ? '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px">Adicionar: <code>ANTHROPIC_API_KEY=sk-ant-...</code> em /home/user/nodejs/.env</div>' : ''}
</div>

<div class="card" style="margin-bottom:16px;padding:14px;border-left:3px solid #f59e0b">
  <div style="font-size:12px;color:#f59e0b;font-weight:600;margin-bottom:4px">⚠ Beta / Custo</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.65);line-height:1.5">
    Computer Use API e beta. Cada cadastro consome ~50-200k tokens (R\$0.50-3 por tentativa). Pode falhar em sites com CAPTCHA. <strong>Use com criterio.</strong>
  </div>
</div>

<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin:24px 0 12px">Servicos disponiveis</h2>

${servicos.map(s => `<div class="card" style="margin-bottom:10px;padding:16px">
  <div style="display:flex;justify-content:space-between;align-items:start;gap:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:240px">
      <div style="font-weight:600;font-size:15px">${s.nome}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:3px">${s.custo}${s.cartao ? ' · <strong style="color:#f59e0b">precisa cartao</strong>' : ''}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:6px;font-family:monospace">${s.url}</div>
    </div>
    <form method="POST" action="/admin/auto-cadastro/${s.id}/executar" style="display:flex;gap:8px;align-items:center">
      <a href="${s.url}" target="_blank" class="btn" style="background:rgba(255,255,255,0.08);font-size:12px;padding:8px 14px">Manual</a>
      <button type="submit" class="btn" style="background:rgba(124,58,237,0.3);border-color:rgba(124,58,237,0.5);color:#c4b5fd;font-size:12px;padding:8px 14px" ${!st.configurado?'disabled':''}>🤖 Auto</button>
    </form>
  </div>
</div>`).join("")}

<div style="margin-top:24px;font-size:11px;color:rgba(255,255,255,0.4);line-height:1.6">
  <strong>Como funciona auto-cadastro:</strong><br/>
  1. Voce clica "Auto" no servico<br/>
  2. Sistema chama Anthropic Computer Use API com tarefa "cadastre em X usando email Y senha Z"<br/>
  3. Claude opera browser virtual deles (Linux + Firefox)<br/>
  4. Apos cadastro, voce recebe Telegram com status<br/>
  5. Se houver email de verificacao, voce clica no seu Gmail<br/>
  6. Em uma versao futura, sistema le seu Gmail via MCP e clica sozinho
</div>

</div></body></html>`);
  });

  router.post("/auto-cadastro/:servico/executar", autenticar, async (req, res) => {
    const servico = req.params.servico;
    const acu = (() => { try { return require("./integrations/anthropic-computer-use"); } catch (_) { return null; } })();
    if (!acu || !acu.configured()) {
      return res.send(`<div style="padding:40px;color:#ef4444;font-family:sans-serif">ANTHROPIC_API_KEY ausente. Adicione no .env do AV.</div>`);
    }

    const tarefas = {
      backblaze: `Acesse https://www.backblaze.com/b2/sign-up.html. Preencha cadastro com email rmeireles87@gmail.com e crie senha forte aleatoria. Submita o formulario. NAO clique link de email - apos preencher e enviar formulario, termine retornando DONE: aguardando email de verificacao em rmeireles87@gmail.com.`,
      memed: `Acesse https://memed.com.br/integracao e clique em criar conta de medico. Preencha com nome Ricardo Meireles Marcelino, email rmeireles87@gmail.com, e termine no passo onde pede CRM. Termine retornando DONE: chegou em passo de CRM, Dr. precisa preencher.`,
      "cfm-prescricao": `Acesse https://sistemas.cfm.org.br/contatoprescricaoeletronica/br e preencha formulario de solicitacao de credenciais com nome Ricardo Meireles Marcelino, email rmeireles87@gmail.com, finalidade integracao com sistema proprio HairTech. Submita.`,
      focusnfe: `Acesse https://focusnfe.com.br e clique em Comecar / Cadastre-se. Preencha email rmeireles87@gmail.com. Pare antes do cartao - termine com DONE: chegou em passo de pagamento, Dr. precisa fornecer cartao.`,
    };

    const tarefa = tarefas[servico];
    if (!tarefa) return res.status(400).send("servico desconhecido");

    // Resposta imediata pro Dr.
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta http-equiv="refresh" content="3;url=/admin/auto-cadastro"><title>Auto-cadastro iniciado</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:600px;margin:80px auto;padding:32px;text-align:center">
  <div style="font-size:48px;margin-bottom:18px">🤖</div>
  <h1 style="font-size:24px;margin-bottom:14px">Auto-cadastro ${servico} iniciado</h1>
  <div style="font-size:14px;color:rgba(255,255,255,0.6)">Claude esta operando browser virtual. Voce recebe Telegram em ~30s-3min com resultado.</div>
</div></body></html>`);

    // Executa em background
    (async () => {
      const inicio = Date.now();
      const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
      const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
      const axiosLib = require("axios");

      try {
        const result = await acu.executarTarefa(tarefa, { maxIter: 20 });
        const segs = Math.round((Date.now() - inicio) / 1000);
        const msg = `🤖 Auto-cadastro ${servico} (${segs}s)\n\n${result.ok ? '✅' : '❌'} ${result.ok ? 'Sucesso' : 'Falhou'}\n\n${result.mensagem || result.erro || '(sem detalhe)'}\n\nAcoes executadas: ${result.acoes?.length || 0}\nIteracoes: ${result.iteracoes}`;
        await axiosLib.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          chat_id: tgChat, text: msg.slice(0, 4000),
        }, { timeout: 5000 }).catch(() => {});
      } catch (e) {
        await axiosLib.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          chat_id: tgChat, text: `❌ Auto-cadastro ${servico} crashou: ${e.message}`,
        }, { timeout: 5000 }).catch(() => {});
      }
    })().catch(e => console.error("[auto-cadastro]", e));
  });

  // ===== DUAL-AI CONSULT (Claude + ChatGPT em paralelo + sintese) =====
  router.get("/dual-ai", autenticar, (req, res) => {
    const dualAI = (() => { try { return require("./integrations/dual-ai"); } catch (_) { return null; } })();
    const st = dualAI ? dualAI.status() : { claude_configurado: false, chatgpt_configurado: false };
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Dual-AI consult — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:32px 24px">
${navbar("", "dual-ai")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Dual-AI consult</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:16px">Pergunta vai pra Claude (Anthropic) + ChatGPT (OpenAI) em paralelo. Depois um sintetizador analisa convergencia/divergencia e da recomendacao pratica. Pra decisoes criticas (copy de venda, conduta etica, CFM, mensagem juridica).</div>

<div class="card" style="margin-bottom:18px;padding:16px">
  <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:6px">Status</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.75);font-family:monospace">
    Claude (Anthropic): <strong style="color:${st.claude_configurado?'#22c55e':'#ef4444'}">${st.claude_configurado?'OK':'AUSENTE - falta ANTHROPIC_API_KEY no .env'}</strong><br/>
    ChatGPT (OpenAI): <strong style="color:${st.chatgpt_configurado?'#22c55e':'#ef4444'}">${st.chatgpt_configurado?'OK':'AUSENTE - falta OPENAI_API_KEY no .env'}</strong><br/>
    ChatGPT Web Search: <strong style="color:${st.chatgpt_web_search?'#22c55e':'#8e8e93'}">${st.chatgpt_web_search?'ATIVO (CHATGPT_USE_WEB_SEARCH=1)':'DESATIVADO'}</strong>
  </div>
</div>

<form method="POST" action="/admin/dual-ai" class="card" style="padding:20px">
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Contexto opcional (background pra IA entender)</label>
  <textarea name="contexto" rows="3" placeholder="Ex: Sou medico tricologista, vou enviar essa mensagem a paciente que reclamou de resultado..." style="margin:8px 0 14px;font-size:13px"></textarea>

  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Pergunta / texto pra analisar</label>
  <textarea name="pergunta" rows="6" required placeholder="Ex: A mensagem abaixo passa no CFM 2.336/2023? Pode haver risco LGPD? ..." style="margin:8px 0 16px;font-size:13px"></textarea>

  <button type="submit" class="btn" style="background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;width:100%;padding:14px;font-size:14px;font-weight:600;justify-content:center">🤖+🤖 Consultar Claude + ChatGPT</button>
</form>
</div></body></html>`);
  });

  router.post("/dual-ai", autenticar, async (req, res) => {
    const pergunta = (req.body?.pergunta || "").toString();
    const contexto = (req.body?.contexto || "").toString();
    if (!pergunta) return res.redirect("/admin/dual-ai");
    let resultado;
    try {
      const dualAI = require("./integrations/dual-ai");
      resultado = await dualAI.consultar(pergunta, contexto);
    } catch (e) {
      return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="background:#1a0533;color:#fff;font-family:sans-serif;padding:32px"><h1>Erro</h1><pre>${e.message}</pre><a href="/admin/dual-ai" style="color:#a78bfa">← voltar</a></body></html>`);
    }
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Resultado dual-AI — HairTech</title><style>${CSS_BASE}.col h3{font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:10px}.txt{white-space:pre-wrap;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.85)}</style></head>
<body><div style="max-width:1280px;margin:0 auto;padding:32px 24px">
${navbar("", "dual-ai")}
<h1 style="font-size:22px;margin-bottom:16px">Resultado</h1>
<div class="card" style="margin-bottom:18px;padding:16px;border-left:3px solid #8b5cf6">
  <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">PERGUNTA</div>
  <div style="font-size:14px;white-space:pre-wrap">${pergunta.replace(/</g,"&lt;")}</div>
</div>

<div class="card" style="margin-bottom:18px;padding:20px;background:linear-gradient(135deg,#22c55e15,#10b98115);border-color:rgba(34,197,94,0.4)">
  <h3 style="font-size:14px;font-weight:700;color:#22c55e;margin-bottom:10px">🧠 SINTESE / RECOMENDACAO</h3>
  <div class="txt">${(resultado.sintese||"").replace(/</g,"&lt;")}</div>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:18px">
  <div class="card col" style="padding:18px">
    <h3>Claude (Anthropic) <span style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:400">${resultado.claude.modelo||""}</span></h3>
    <div class="txt">${(resultado.claude.texto||resultado.claude.erro||"(falhou)").replace(/</g,"&lt;")}</div>
  </div>
  <div class="card col" style="padding:18px">
    <h3>ChatGPT (OpenAI) <span style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:400">${resultado.chatgpt.modelo||""}</span></h3>
    <div class="txt">${(resultado.chatgpt.texto||resultado.chatgpt.erro||"(falhou)").replace(/</g,"&lt;")}</div>
  </div>
</div>

<div style="margin-top:18px;display:flex;gap:10px">
  <a class="btn" href="/admin/dual-ai" style="background:rgba(255,255,255,0.1)">Nova consulta</a>
  <a class="btn" href="/admin/portal" style="background:rgba(255,255,255,0.1)">← portal</a>
</div>
</div></body></html>`);
  });

  // ===== SYSTEM CHECK (verificacao rapida pre-BLITZ) =====
  router.get("/system-check", autenticar, async (req, res) => {
    const checks = [];

    // 1. Database
    try {
      if (db.pool) {
        await db.pool.query("SELECT 1");
        checks.push({ ok: true, item: "Postgres conectado", det: "DATABASE_URL responde" });
      } else { checks.push({ ok: false, item: "Postgres", det: "DATABASE_URL nao configurado" }); }
    } catch (e) { checks.push({ ok: false, item: "Postgres", det: e.message }); }

    // 2. WHATSAPP_TOKEN
    const hasToken = Boolean(process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID);
    checks.push({ ok: hasToken, item: "WhatsApp Cloud API", det: hasToken ? "Token e Phone ID presentes" : "WHATSAPP_TOKEN ou PHONE_NUMBER_ID ausentes - BLITZ nao envia" });

    // 3. Test WHATSAPP token actually works
    if (hasToken) {
      try {
        const r = await require("axios").get(
          `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}`,
          { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, timeout: 8000, validateStatus: () => true }
        );
        if (r.status === 200) checks.push({ ok: true, item: "WhatsApp Token valido", det: `Numero: ${r.data.display_phone_number}` });
        else checks.push({ ok: false, item: "WhatsApp Token", det: `HTTP ${r.status} - token pode ter expirado` });
      } catch (e) { checks.push({ ok: false, item: "WhatsApp Token", det: e.message }); }
    }

    // 4. Total de conversas
    const totConv = Object.keys(conversas).length;
    const quentes = Object.values(conversas).filter(c => c.status === "ativo" && c.temperatura === "quente").length;
    const mornos = Object.values(conversas).filter(c => c.status === "ativo" && c.temperatura === "morno").length;
    checks.push({ ok: totConv > 0, item: "Base de leads", det: `${totConv} conversas total · ${quentes} quentes ativos · ${mornos} mornos ativos` });

    // 5. AI fallback
    const hasAI = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.OLLAMA_ENABLED);
    checks.push({ ok: hasAI, item: "IA disponivel", det: process.env.OLLAMA_ENABLED ? "Ollama local + fallback cloud" : (process.env.GEMINI_API_KEY ? "Gemini + OpenAI fallback" : process.env.OPENAI_API_KEY ? "OpenAI" : "Nenhuma key configurada") });

    // 6. BLITZ messages OK
    let blitzOk = false;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "blitz-mensagens.json"), "utf8"));
      blitzOk = Boolean(m.quentes && m.mornos);
    } catch (_) {}
    checks.push({ ok: blitzOk, item: "Mensagens BLITZ", det: blitzOk ? "data/blitz-mensagens.json valido" : "Mensagens nao carregaram" });

    // 7. Apresentacao publica
    checks.push({ ok: true, item: "Apresentacao Paciente Modelo", det: "https://hairtech.org/admin/apresentacao-paciente-modelo" });

    // 8. Telegram bot configurado
    const hasTG = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
    checks.push({ ok: hasTG, item: "Telegram bot", det: hasTG ? "@HairTechBot configurado" : "TELEGRAM_BOT_TOKEN ou CHAT_ID ausentes" });

    const passou = checks.filter(c => c.ok).length;
    const total = checks.length;
    const pct = Math.round((passou / total) * 100);

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>System Check — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:780px;margin:0 auto;padding:32px 24px">
${navbar("", "system-check")}
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
  <h1 style="font-size:24px;font-weight:700">System check</h1>
  <div style="font-size:36px;font-weight:800;color:${pct>=85?'#22c55e':pct>=60?'#f59e0b':'#ef4444'}">${pct}%</div>
</div>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px">${passou} de ${total} OK. Atualize a pagina pra rodar de novo.</div>

<div class="card">
${checks.map(c => `<div style="display:flex;align-items:start;gap:14px;padding:14px;border-bottom:1px solid rgba(255,255,255,0.06)">
  <div style="font-size:22px;color:${c.ok?'#22c55e':'#ef4444'};min-width:30px">${c.ok?'✓':'✗'}</div>
  <div style="flex:1">
    <div style="font-size:15px;font-weight:500">${c.item}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.55);margin-top:3px;font-family:monospace">${c.det}</div>
  </div>
</div>`).join("")}
</div>

${pct >= 85 ? `<div class="card" style="margin-top:18px;background:linear-gradient(135deg,#10b98122,#22c55e22);border-color:rgba(34,197,94,0.4)">
  <div style="font-size:14px;color:#22c55e;font-weight:700;margin-bottom:6px">✓ Tudo pronto pro BLITZ</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.75);line-height:1.6">
    Sistema OK. Voce pode disparar o BLITZ com seguranca.<br/>
    Proximo passo: <a href="/admin/blitz" style="color:#86efac;font-weight:600">⚡ Ir pro BLITZ</a>
  </div>
</div>` : `<div class="card" style="margin-top:18px;border-color:rgba(239,68,68,0.4)">
  <div style="font-size:14px;color:#ef4444;font-weight:700;margin-bottom:6px">⚠ Sistema com pendencias</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.75);line-height:1.6">
    Resolva os itens vermelhos antes de disparar BLITZ. Se algum item nao se resolve em 5min, me avise.
  </div>
</div>`}

</div></body></html>`);
  });

  // ===== APRESENTACAO PACIENTE MODELO (PDF printavel) =====
  // Pagina que vira PDF via Imprimir do browser. Manda pro paciente que respondeu SIM no BLITZ.
  router.get("/apresentacao-paciente-modelo", (req, res) => {
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Programa Paciente Modelo — Clinica HairTech</title>
<style>
  @page { size: A4; margin: 14mm 14mm; }
  @media print { .no-print{display:none} body{color:#000;background:#fff} }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color:#1a1a2e; max-width:780px; margin:30px auto; padding:0 24px; line-height:1.55; background:#fafafa }
  .header { background:linear-gradient(135deg,#1a0533,#0d1b4b); color:#fff; padding:30px 28px; border-radius:14px; margin-bottom:24px }
  .header h1 { font-size:26px; font-weight:800; margin-bottom:4px; letter-spacing:-0.5px }
  .header .sub { font-size:14px; color:rgba(255,255,255,0.7) }
  h2 { font-size:18px; color:#5b2c80; margin:24px 0 10px; padding-bottom:6px; border-bottom:2px solid #ec4899 }
  h3 { font-size:15px; color:#1a1a2e; margin:14px 0 6px }
  p { margin-bottom:10px; font-size:14px }
  .badge { display:inline-block; background:#ec4899; color:#fff; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; letter-spacing:.5px; text-transform:uppercase }
  .box { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:18px 22px; margin:14px 0; box-shadow:0 1px 3px rgba(0,0,0,0.05) }
  .destaque { background:linear-gradient(135deg,#fef3c7,#fde68a); border-left:4px solid #f59e0b; padding:14px 18px; border-radius:8px; margin:14px 0; font-size:14px }
  table { width:100%; border-collapse:collapse; font-size:13px; margin:10px 0 }
  th,td { padding:10px 12px; text-align:left; border-bottom:1px solid #e5e7eb }
  th { background:#f3f4f6; font-weight:600 }
  .check { color:#10b981; font-weight:700 }
  ul { margin-left:22px; margin-bottom:10px }
  li { margin-bottom:6px; font-size:14px }
  .cta { background:linear-gradient(135deg,#dc2626,#f59e0b); color:#fff; padding:18px 22px; border-radius:14px; text-align:center; margin:24px 0; font-size:15px; font-weight:600 }
  .footer { margin-top:30px; padding-top:18px; border-top:1px solid #e5e7eb; font-size:11px; color:#666; text-align:center }
  .no-print { background:#3b82f6; color:#fff; padding:10px 14px; border-radius:8px; margin-bottom:18px; font-size:13px; text-align:center }
  .no-print button { background:#fff; color:#3b82f6; border:none; padding:6px 14px; border-radius:6px; font-weight:600; margin-left:10px; cursor:pointer }
</style></head>
<body>

<div class="no-print">
  Pra salvar como PDF: Imprimir (Ctrl/Cmd + P) → Salvar como PDF
  <button onclick="window.print()">Imprimir agora</button>
</div>

<div class="header">
  <div class="badge" style="margin-bottom:10px">Programa Exclusivo · Vagas limitadas</div>
  <h1>Paciente Modelo</h1>
  <div class="sub">Transplante Capilar FUE — Clinica HairTech / Dr. Ricardo Meireles Marcelino</div>
</div>

<h2>O que é o Programa Paciente Modelo</h2>
<p>O Programa Paciente Modelo é uma <strong>oportunidade exclusiva</strong> de realizar seu transplante FUE com condições especiais em troca de autorização para uso didático das imagens do procedimento (com rosto borrado e identidade preservada).</p>

<p>Vagas extremamente limitadas — abertas apenas em períodos específicos do calendário cirúrgico.</p>

<div class="destaque">
  <strong>Por que existe esse programa?</strong> A clínica produz material técnico-científico para apresentação em congressos médicos, publicações e formação de outros cirurgiões. Esse material exige documentação fotográfica de qualidade. Em troca, o paciente recebe o procedimento por valor consideravelmente menor que a tabela padrão.
</div>

<h2>O que está incluso</h2>
<div class="box">
  <table>
    <tr><th style="width:60%">Item</th><th>Detalhe</th></tr>
    <tr><td><span class="check">✓</span> Cirurgia FUE completa</td><td>Técnica Follicular Unit Extraction conduzida pelo Dr. Ricardo</td></tr>
    <tr><td><span class="check">✓</span> 6 sessões de MMP pós-operatório</td><td>Microinfusão de medicamentos pra acelerar e potencializar resultado</td></tr>
    <tr><td><span class="check">✓</span> 12 meses de acompanhamento</td><td>Consultas regulares com Dr. Ricardo até resultado final</td></tr>
    <tr><td><span class="check">✓</span> Spa Capilar</td><td>Lavagens supervisionadas no pós-imediato pra preservação dos folículos</td></tr>
    <tr><td><span class="check">✓</span> Material pós-op completo</td><td>Medicação, almofada cervical, kit de cuidados</td></tr>
    <tr><td><span class="check">✓</span> Foto-documentação</td><td>Para você e pra clínica (com identidade preservada)</td></tr>
  </table>
</div>

<h2>Investimento</h2>
<div class="box" style="text-align:center; padding:24px">
  <div style="font-size:14px; color:#666; margin-bottom:6px">Programa Paciente Modelo</div>
  <div style="font-size:30px; font-weight:800; color:#5b2c80; letter-spacing:-1px">R$ 8.500 à vista</div>
  <div style="font-size:14px; color:#666; margin-top:6px">(metade antes da cirurgia, metade no dia)</div>
  <div style="font-size:14px; color:#666; margin-top:14px">ou</div>
  <div style="font-size:30px; font-weight:800; color:#5b2c80; letter-spacing:-1px; margin-top:4px">R$ 9.000 em 12x sem juros</div>
  <div style="font-size:14px; color:#666; margin-top:4px">R$ 750 por mês</div>
  <div style="font-size:11px; color:#999; margin-top:14px">Tabela padrão da mesma cirurgia (sem participação no programa modelo): R$ 10.000 cartão 12x · R$ 9.500 à vista</div>
</div>

<h2>Termos de exclusividade</h2>
<ul>
  <li><strong>Autorização de imagem:</strong> você autoriza, por contrato, a clínica a usar fotos e vídeos da sua evolução (do pré-op ao resultado final de 12 meses) para fins didáticos: congressos, publicações científicas, material de ensino e mídias da clínica.</li>
  <li><strong>Identidade preservada:</strong> seu rosto é borrado/cortado em todas as imagens que viram material público. Sua identidade NÃO é divulgada.</li>
  <li><strong>Comparecimento obrigatório:</strong> as 6 sessões MMP e as 4 consultas de acompanhamento (1, 3, 6, 12 meses) são obrigatórias pro programa funcionar. Faltas reduzem qualidade do material e podem implicar em reajuste de valor.</li>
  <li><strong>Pré-avaliação:</strong> a vaga só é confirmada após análise das fotos iniciais pelo Dr. Ricardo. Nem todo caso é elegível pro programa modelo (depende de qualidade da área doadora, densidade desejada, etc).</li>
  <li><strong>Sinal:</strong> R$ 150 pra reservar a vaga. Esse valor é descontado do valor total da cirurgia.</li>
</ul>

<h2>Como reservar</h2>
<div class="box">
  <ol style="margin-left:22px">
    <li>Envie um <strong>SIM</strong> pelo WhatsApp pra confirmar interesse</li>
    <li>Envie fotos do seu caso conforme orientação que receberá</li>
    <li>Dr. Ricardo faz pré-avaliação (24-48h)</li>
    <li>Se elegível, você recebe link Pix de R$ 150 pra reservar vaga</li>
    <li>Marcamos cirurgia em data disponível</li>
  </ol>
</div>

<div class="cta">
  Vagas limitadas. Quem confirma primeiro, garante.
</div>

<div class="footer">
  Clinica HairTech · Dr. Ricardo Meireles Marcelino<br/>
  CRM-RJ · CNPJ 49.634.881/0001-91 · Niterói/Rio de Janeiro<br/>
  hairtech.org · +55 21 99354-2383
</div>

</body></html>`);
  });

  // ===== IMPORTAR contatos (do WhatsApp pessoal do Dr.) =====
  router.get("/importar", autenticar, (req, res) => {
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Importar leads — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:32px 24px">
${navbar("", "importar")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Importar leads do WhatsApp pessoal</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px">Cola a lista de contatos que falaram com voce no seu WhatsApp pessoal (5521967813366). Sistema classifica via IA local (sem gastar credito), adiciona ao CRM e inclui no proximo BLITZ.</div>

<div class="card" style="padding:24px;margin-bottom:18px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:12px">Formato aceito (uma linha por contato)</h2>
  <pre style="background:rgba(0,0,0,0.3);padding:12px;border-radius:8px;font-size:12px;color:rgba(255,255,255,0.7);overflow-x:auto;line-height:1.6">+5521987654321 Joao Silva - pediu grupo estetica
+5521912345678 Maria - transplante FUE
+5521911223344 Carlos
21999887766 Pedro - dermato
contato 11 98765-4321 Ana</pre>

  <form method="POST" action="/admin/importar">
    <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Cola aqui (max 200 contatos):</label>
    <textarea name="lista" rows="14" required style="margin:10px 0 14px;font-family:monospace;font-size:13px" placeholder="Cola a lista um por linha..."></textarea>

    <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Origem (ajuda na classificacao)</label>
    <select name="origem" style="margin-bottom:14px">
      <option value="grupo_estetica">Pediu pra entrar em grupo de estetica</option>
      <option value="whatsapp_pessoal">WhatsApp pessoal geral</option>
      <option value="indicacao">Indicacao</option>
      <option value="evento">Evento/feira</option>
    </select>

    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:18px">
      <input type="checkbox" name="incluir_blitz" value="1" checked style="width:auto"/>
      Marcar essas pessoas como temperatura "morno" pra serem incluidas no proximo BLITZ
    </label>

    <button type="submit" class="btn" style="background:rgba(34,197,94,0.3);border-color:rgba(34,197,94,0.5);color:#86efac;width:100%;justify-content:center;padding:14px;font-size:15px">Importar contatos</button>
  </form>
</div>

<div class="card" style="border-color:rgba(245,158,11,0.4);padding:18px">
  <div style="font-size:13px;color:#ff9f0a;font-weight:600;margin-bottom:6px">LGPD - consentimento</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.65);line-height:1.6">
    Quando alguem te manda mensagem voluntariamente pedindo info (ex: pedir grupo estetica), e consentimento implicito pra voce responder.<br/>
    A primeira mensagem que voce mandar via AV deve incluir opcao de descadastro ("responda PARAR pra nao receber mais"). O BLITZ ja faz isso automaticamente.
  </div>
</div>
</div></body></html>`);
  });

  router.post("/importar", autenticar, async (req, res) => {
    const lista = (req.body?.lista || "").toString();
    const origem = (req.body?.origem || "whatsapp_pessoal").toString();
    const incluirBlitz = req.body?.incluir_blitz === "1";

    const linhas = lista.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 200);
    let processadas = 0, novas = 0, atualizadas = 0, ignoradas = 0;
    const resultados = [];

    for (const linha of linhas) {
      // Extrai numero (qualquer sequencia >=10 digitos)
      const matchNum = linha.match(/(?:\+?55)?\s*\(?(\d{2})\)?\s*9?\s*(\d{4})\s*-?\s*(\d{4})|(\d{10,13})/);
      let numero = null;
      if (matchNum) {
        if (matchNum[4]) {
          numero = matchNum[4];
        } else {
          numero = matchNum[1] + (matchNum[2] || "") + (matchNum[3] || "");
        }
        numero = numero.replace(/\D/g, "");
        // Normaliza pra formato BR: 55 + DDD + 9 + 8 digitos
        if (numero.length === 10) numero = "55" + numero.slice(0, 2) + "9" + numero.slice(2);
        else if (numero.length === 11) numero = "55" + numero;
        else if (numero.length === 12 && !numero.startsWith("55")) numero = "55" + numero.slice(-10);
        else if (numero.length === 13 && numero.startsWith("55")) {} // ok
        else if (numero.length < 12 || numero.length > 13) { ignoradas++; continue; }
      }
      if (!numero || numero.length < 12) { ignoradas++; continue; }

      // Extrai nome e contexto
      const semNum = linha.replace(/\+?\d[\d\s\(\)\-]+\d/, "").trim();
      const [nomePart, ...contextoArr] = semNum.split(/[-–—:]/);
      const nome = (nomePart || "").trim() || null;
      const contexto = contextoArr.join(" ").trim();

      // Classificacao via heuristica (sem chamar IA pra economizar)
      const txt = (nome + " " + contexto).toLowerCase();
      let temperatura = "morno";
      let tipo = "novo";
      if (/(transplante|fue|calvic|implante capilar|enxert|foliculos|coroa|area doadora)/.test(txt)) {
        temperatura = "quente";
        tipo = "transplante";
      } else if (/(mmp|mesoterapia|prp|tratamento capilar|queda|alopecia)/.test(txt)) {
        temperatura = "morno";
        tipo = "tratamento_capilar";
      } else if (/(estetic|botox|preencher|peeling|facial)/.test(txt)) {
        temperatura = "morno";
        tipo = "estetica_geral";
      }

      if (!incluirBlitz) temperatura = "frio";

      // Insere/atualiza
      if (conversas[numero]) {
        atualizadas++;
        if (nome && !conversas[numero].nome) conversas[numero].nome = nome;
        if (incluirBlitz && conversas[numero].temperatura === "frio") conversas[numero].temperatura = temperatura;
        conversas[numero].nota = (conversas[numero].nota ? conversas[numero].nota + " | " : "") + `[importado ${new Date().toISOString().slice(0,10)} ${origem}] ${contexto}`;
        conversas[numero].ultimaAtividade = Date.now();
      } else {
        novas++;
        conversas[numero] = {
          historico: [],
          ultimaAtividade: Date.now(),
          status: "ativo",
          tipo,
          retomadas: 0,
          proximaRetomada: null,
          temperatura,
          genero: null,
          nome,
          nota: `[importado ${new Date().toISOString().slice(0,10)} ${origem}] ${contexto}`,
          origem,
        };
      }
      if (db && db.salvarConversa) db.salvarConversa(numero, conversas[numero]).catch(() => {});
      resultados.push({ numero, nome, temperatura, tipo, novo: !conversas[numero].historico?.length });
      processadas++;
    }

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Importacao concluida — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:32px 24px">
${navbar("", "importar")}
<h1 style="font-size:24px;margin-bottom:18px">Importacao concluida</h1>
<div class="card" style="padding:24px;margin-bottom:18px">
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;text-align:center">
    <div><div style="font-size:32px;font-weight:700;color:#34c759">${novas}</div><div style="font-size:11px;color:rgba(255,255,255,0.5)">novas</div></div>
    <div><div style="font-size:32px;font-weight:700;color:#3b82f6">${atualizadas}</div><div style="font-size:11px;color:rgba(255,255,255,0.5)">atualizadas</div></div>
    <div><div style="font-size:32px;font-weight:700;color:#f59e0b">${ignoradas}</div><div style="font-size:11px;color:rgba(255,255,255,0.5)">ignoradas (sem numero)</div></div>
    <div><div style="font-size:32px;font-weight:700;color:#a78bfa">${processadas}</div><div style="font-size:11px;color:rgba(255,255,255,0.5)">total processadas</div></div>
  </div>
</div>

<div class="card" style="padding:20px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:14px">Detalhe</h2>
  ${resultados.length === 0 ? '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4)">Nenhum contato valido encontrado.</div>' : `<table style="font-size:12px"><thead><tr>
    <th style="padding:8px 12px">Numero</th><th style="padding:8px 12px">Nome</th><th style="padding:8px 12px">Tipo</th><th style="padding:8px 12px">Temperatura</th>
  </tr></thead><tbody>${resultados.map(r => `<tr class="row">
    <td style="padding:8px 12px;font-family:monospace">+${r.numero}</td>
    <td style="padding:8px 12px">${r.nome || "—"}</td>
    <td style="padding:8px 12px;color:rgba(255,255,255,0.6)">${r.tipo}</td>
    <td style="padding:8px 12px">${r.temperatura}</td>
  </tr>`).join("")}</tbody></table>`}
</div>

<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
  <a href="/admin/blitz" class="btn" style="background:linear-gradient(135deg,#dc2626,#f59e0b);color:#fff;padding:14px 24px;font-weight:600">⚡ Ir pro BLITZ agora</a>
  <a href="/admin/importar" class="btn" style="background:rgba(255,255,255,0.1)">Importar mais</a>
  <a href="/admin/portal" class="btn" style="background:rgba(255,255,255,0.1)">← portal</a>
</div>
</div></body></html>`);
  });

  // ===== BLITZ (botao de panico - 1 clique dispara tudo) =====
  const BLITZ_MSGS_FILE = path.join(__dirname, "data", "blitz-mensagens.json");
  function lerMsgsBlitz() {
    try { return JSON.parse(fs.readFileSync(BLITZ_MSGS_FILE, "utf8")); }
    catch (_) { return { quentes: "", mornos: "", reagendamento: "", sem_resposta: "" }; }
  }

  // Protecao anti-madrugada: nao envia entre 22h e 8h BRT (UTC-3).
  // Se "forcar=1" no body, ignora. Se fora da janela, espera ate as 9h.
  function horaBrasilia() {
    const ag = new Date();
    const utc = ag.getTime() + (ag.getTimezoneOffset() * 60000);
    return new Date(utc - 3 * 3600000).getHours();
  }
  function dentroHorarioComercial() {
    const h = horaBrasilia();
    return h >= 8 && h < 22;
  }

  // Filtros extras de leads "esquecidos" - quem mandou msg e bot nao respondeu adequado
  function leadsSemRespostaAdequada() {
    return Object.entries(conversas)
      .filter(([num, c]) => {
        if (c.status !== "ativo") return false;
        const h = c.historico || [];
        if (h.length === 0) return false;
        // ultima msg foi do paciente (user) e bot nao respondeu, OU bot deu resposta generica
        const ult = h[h.length - 1];
        return ult.role === "user" && (Date.now() - (ult.ts || c.ultimaAtividade || 0)) > 6 * 3600000;
      })
      .map(([num]) => num);
  }
  function leadsQueriamReagendar() {
    const regex = /reagend|remarc|outro horario|outro dia|aparelho|manutenc|adiar|mover/i;
    return Object.entries(conversas)
      .filter(([num, c]) => {
        if (c.status !== "ativo" && c.status !== "humano") return false;
        const h = c.historico || [];
        return h.some(m => m.role === "user" && regex.test(m.content || ""));
      })
      .map(([num]) => num);
  }

  router.get("/blitz", autenticar, (req, res) => {
    const segs = segmentosDisponiveis();
    const msgs = lerMsgsBlitz();
    const reagendar = leadsQueriamReagendar();
    const semResp = leadsSemRespostaAdequada();
    const horaOk = dentroHorarioComercial();
    const hBR = horaBrasilia();

    // Top 10 quentes pra ligar
    const top10 = Object.entries(conversas)
      .filter(([_, c]) => c.status === "ativo" && c.temperatura === "quente")
      .map(([n, c]) => {
        const hist = c.historico || [];
        const ultDele = [...hist].reverse().find(m => m.role === "user");
        return {
          numero: n,
          nome: c.nome || "(sem nome)",
          ultima_msg: ultDele ? (ultDele.content || "").substring(0, 120) : "(sem msg do paciente)",
          dias_ult: c.ultimaAtividade ? Math.floor((Date.now() - c.ultimaAtividade) / 86400000) : "?",
        };
      })
      .sort((a, b) => a.dias_ult - b.dias_ult)
      .slice(0, 10);

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>BLITZ — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:32px 24px">
${navbar("", "blitz")}
<h1 style="font-size:28px;font-weight:800;margin-bottom:6px">⚡ BLITZ — captacao urgente</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:14px">1 clique dispara: broadcast quentes + mornos + reagendamento + sem resposta + Telegram com resumo + lista top 10 pra ligar.</div>

${!horaOk ? `<div class="card" style="margin-bottom:18px;border-color:rgba(239,68,68,0.5);background:rgba(239,68,68,0.1)">
  <div style="font-size:13px;color:#ef4444;font-weight:700;margin-bottom:4px">⚠ Fora do horario comercial (BRT atual: ${hBR}h)</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.7);line-height:1.5">Disparar agora pode acordar paciente. Botao abaixo agenda pra <strong>9h da manha proxima</strong>. Pra forcar dispatch imediato, marcar "Forcar agora".</div>
</div>` : ""}

<div class="card" style="padding:24px;margin-bottom:18px">
  <div style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:14px">O que vai acontecer agora se voce clicar</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:18px">
    <div style="background:rgba(239,68,68,0.15);padding:12px;border-radius:12px;border-left:3px solid #ef4444">
      <div style="font-size:22px;font-weight:700">${segs.quentes.length}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.6)">leads quentes</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">vagas urgentes</div>
    </div>
    <div style="background:rgba(245,158,11,0.15);padding:12px;border-radius:12px;border-left:3px solid #f59e0b">
      <div style="font-size:22px;font-weight:700">${segs.mornos.length}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.6)">leads mornos</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">educacional + vagas</div>
    </div>
    <div style="background:rgba(59,130,246,0.15);padding:12px;border-radius:12px;border-left:3px solid #3b82f6">
      <div style="font-size:22px;font-weight:700">${reagendar.length}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.6)">pediram reagendar</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">aparelho voltou</div>
    </div>
    <div style="background:rgba(168,85,247,0.15);padding:12px;border-radius:12px;border-left:3px solid #a855f7">
      <div style="font-size:22px;font-weight:700">${semResp.length}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.6)">sem resposta</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">tentou e nao respondi</div>
    </div>
    <div style="background:rgba(124,58,237,0.15);padding:12px;border-radius:12px;border-left:3px solid #7c3aed">
      <div style="font-size:22px;font-weight:700">${top10.length}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.6)">top 10 pra ligar</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">lista no fim</div>
    </div>
    <div style="background:rgba(34,197,94,0.15);padding:12px;border-radius:12px;border-left:3px solid #22c55e">
      <div style="font-size:22px;font-weight:700">${segs.quentes.length + segs.mornos.length + reagendar.length + semResp.length}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.6)">total disparado</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">delay 3s entre msgs</div>
    </div>
  </div>

  <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:14px">Mensagens (editaveis em data/blitz-mensagens.json):</div>
  <details style="margin-bottom:14px">
    <summary style="cursor:pointer;font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px">Ver mensagem quentes</summary>
    <div style="font-size:12px;color:rgba(255,255,255,0.7);background:rgba(0,0,0,0.2);padding:12px;border-radius:8px;white-space:pre-wrap;font-family:monospace">${msgs.quentes.replace(/</g,"&lt;")}</div>
  </details>
  <details style="margin-bottom:18px">
    <summary style="cursor:pointer;font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px">Ver mensagem mornos</summary>
    <div style="font-size:12px;color:rgba(255,255,255,0.7);background:rgba(0,0,0,0.2);padding:12px;border-radius:8px;white-space:pre-wrap;font-family:monospace">${msgs.mornos.replace(/</g,"&lt;")}</div>
  </details>

  <form method="POST" action="/admin/blitz/executar" onsubmit="return confirm('Tem certeza? Vai disparar ${segs.quentes.length + segs.mornos.length + reagendar.length + semResp.length} mensagens.');">
    ${!horaOk ? `<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#fca5a5;margin-bottom:14px;padding:10px;background:rgba(239,68,68,0.1);border-radius:8px">
      <input type="checkbox" name="forcar" value="1" style="width:auto"/>
      Forcar disparo agora (mesmo fora do horario comercial)
    </label>` : ""}
    <button type="submit" class="btn" style="background:linear-gradient(135deg,#dc2626,#f59e0b);border:none;color:#fff;width:100%;padding:24px;font-size:18px;font-weight:700;justify-content:center;letter-spacing:.5px">${horaOk ? "⚡ DISPARAR BLITZ AGORA" : "⏰ AGENDAR PARA 9H DA MANHA"}</button>
  </form>
</div>

<div class="card" style="padding:20px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:14px">Top 10 pra LIGAR (depois do broadcast)</h2>
  <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:14px">Ligacao converte 3-5x mais que mensagem. 60 segundos cada. Use: "Aqui e Dr. Ricardo, to abrindo 2 vagas Paciente Modelo essa semana, voce ainda tem interesse?"</div>
  ${top10.length === 0 ? '<div style="padding:30px;text-align:center;color:rgba(255,255,255,0.4)">Nenhum lead quente ativo no momento.</div>' : top10.map((p, i) => `<div style="display:flex;align-items:center;gap:14px;padding:12px;border-bottom:1px solid rgba(255,255,255,0.06)">
    <div style="font-size:22px;font-weight:700;color:#ef4444;min-width:30px">${i+1}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600">${p.nome}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5)">${p.ultima_msg}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:3px">${p.dias_ult} dias atras</div>
    </div>
    <a href="tel:+${p.numero}" class="btn" style="background:rgba(34,197,94,0.25);color:#86efac;font-size:12px;padding:8px 14px">📞 ligar</a>
    <a href="https://wa.me/${p.numero}" target="_blank" class="btn" style="background:rgba(37,211,102,0.25);color:#4ade80;font-size:12px;padding:8px 12px">WA</a>
  </div>`).join("")}
</div>

</div></body></html>`);
  });

  router.post("/blitz/executar", autenticar, (req, res) => {
    const segs = segmentosDisponiveis();
    const msgs = lerMsgsBlitz();
    const reagendar = leadsQueriamReagendar();
    const semResp = leadsSemRespostaAdequada();
    const forcar = req.body?.forcar === "1";
    const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
    const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
    const axiosLib = require("axios");

    // Se fora do horario comercial e nao forcou: agenda pras 9h da manha
    const horaOk = dentroHorarioComercial();
    let delayMs = 0;
    let textoStatus = "BLITZ disparado AGORA";
    if (!horaOk && !forcar) {
      const ag = new Date();
      const utc = ag.getTime() + (ag.getTimezoneOffset() * 60000);
      const brt = new Date(utc - 3 * 3600000);
      const target = new Date(brt);
      target.setHours(9, 0, 0, 0);
      if (brt.getHours() >= 9) target.setDate(target.getDate() + 1);
      delayMs = target.getTime() - brt.getTime();
      const horasAte = Math.round(delayMs / 3600000 * 10) / 10;
      textoStatus = `BLITZ AGENDADO pra ${target.toLocaleString("pt-BR")} BRT (em ${horasAte}h)`;
    }

    // Responde imediato pro doctor saber
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta http-equiv="refresh" content="3;url=/admin/portal"><title>BLITZ</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:600px;margin:80px auto;padding:32px;text-align:center">
  <div style="font-size:48px;margin-bottom:18px">${delayMs > 0 ? "⏰" : "⚡"}</div>
  <h1 style="font-size:22px;margin-bottom:14px">${textoStatus}</h1>
  <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:20px">
    Total: ${segs.quentes.length + segs.mornos.length + reagendar.length + semResp.length} mensagens.<br/>
    ETA: ${Math.round((segs.quentes.length + segs.mornos.length + reagendar.length + semResp.length) * 3 / 60)}min de execucao.
  </div>
  <div style="font-size:13px;color:rgba(255,255,255,0.4)">Telegram avisa quando finalizar. Redirecionando...</div>
</div></body></html>`);

    // Helper de envio com dedupe (mesmo numero so recebe 1 msg do blitz, mesmo se em multiplos segmentos)
    const enviarSegmento = async (numeros, msg, label, jaEnviados) => {
      let ok = 0, falha = 0;
      for (const num of numeros) {
        if (jaEnviados.has(num)) continue;
        jaEnviados.add(num);
        if (!enviarMensagem) break;
        try {
          await enviarMensagem(num, msg);
          ok++;
          if (conversas[num]) {
            conversas[num].historico = conversas[num].historico || [];
            conversas[num].historico.push({ role: "assistant", content: msg, ts: Date.now(), origem: `blitz-${label}` });
            conversas[num].ultimaAtividade = Date.now();
            db.salvarConversa(num, conversas[num]).catch(() => {});
            db.salvarMensagem(num, "assistant", msg).catch(() => {});
          }
        } catch (e) { falha++; console.error(`[blitz ${label}]`, num, e.message); }
        await new Promise(r => setTimeout(r, 3000));
      }
      return { ok, falha };
    };

    // Dispatch em background (com delay se agendado)
    (async () => {
      if (delayMs > 0) {
        // Aviso de agendamento
        await axiosLib.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          chat_id: tgChat,
          text: `⏰ BLITZ agendado pra 9h da manha\n${segs.quentes.length} quentes + ${segs.mornos.length} mornos + ${reagendar.length} reagendar + ${semResp.length} sem resposta`,
        }, { timeout: 5000 }).catch(() => {});
        await new Promise(r => setTimeout(r, delayMs));
      }

      const inicio = Date.now();
      // Aviso de inicio
      await axiosLib.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        chat_id: tgChat,
        text: `⚡ BLITZ iniciado\nQuentes: ${segs.quentes.length}\nMornos: ${segs.mornos.length}\nReagendar: ${reagendar.length}\nSem resposta: ${semResp.length}`,
      }, { timeout: 5000 }).catch(() => {});

      const enviados = new Set();
      // Ordem: reagendamento (mais quente) -> sem_resposta -> quentes -> mornos
      const r1 = await enviarSegmento(reagendar, msgs.reagendamento || msgs.quentes, "reagendar", enviados);
      const r2 = await enviarSegmento(semResp, msgs.sem_resposta || msgs.quentes, "sem-resposta", enviados);
      const r3 = await enviarSegmento(segs.quentes, msgs.quentes, "quente", enviados);
      const r4 = await enviarSegmento(segs.mornos, msgs.mornos, "morno", enviados);

      const min = Math.round((Date.now() - inicio) / 60000);
      const totalOk = r1.ok + r2.ok + r3.ok + r4.ok;
      const totalFalha = r1.falha + r2.falha + r3.falha + r4.falha;
      const resumo = `⚡ BLITZ finalizado em ${min}min\n\nReagendar: ${r1.ok}/${reagendar.length}\nSem resposta: ${r2.ok}/${semResp.length}\nQuentes: ${r3.ok}/${segs.quentes.length}\nMornos: ${r4.ok}/${segs.mornos.length}\n\nTotal enviadas: ${totalOk}\nFalhas: ${totalFalha}\n\nProximo: liga pra top 10 em https://hairtech.org/admin/blitz`;
      await axiosLib.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        chat_id: tgChat, text: resumo,
      }, { timeout: 5000 }).catch(() => {});
    })().catch(e => console.error("[blitz] erro fatal:", e));
  });

  // ===== BROADCAST (mensagem em massa segmentada) =====
  function segmentosDisponiveis() {
    const todas = Object.entries(conversas);
    return {
      ativos: todas.filter(([_,c]) => c.status === "ativo").map(([n]) => n),
      quentes: todas.filter(([_,c]) => c.status === "ativo" && c.temperatura === "quente").map(([n]) => n),
      mornos: todas.filter(([_,c]) => c.status === "ativo" && c.temperatura === "morno").map(([n]) => n),
      frios: todas.filter(([_,c]) => c.status === "ativo" && c.temperatura === "frio").map(([n]) => n),
      sem_resposta_7d: todas.filter(([_,c]) => {
        const h = c.historico || [];
        const inativo = c.ultimaAtividade && (Date.now() - c.ultimaAtividade) > 7*86400000;
        const aguardando = h.length > 0 && h[h.length-1].role === "assistant";
        return c.status === "ativo" && inativo && aguardando;
      }).map(([n]) => n),
    };
  }

  router.get("/broadcast", autenticar, (req, res) => {
    const segs = segmentosDisponiveis();
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Broadcast — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:780px;margin:0 auto;padding:32px 24px">
${navbar("", "broadcast")}
<h1 style="font-size:24px;margin-bottom:6px">Broadcast segmentado</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px">Enviar uma mensagem pra um grupo de leads. Delay 3s entre envios pra nao bater rate limit. So envia pra status='ativo' (preserva LGPD).</div>

<form method="POST" action="/admin/broadcast" class="card" style="padding:24px">
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Segmento</label>
  <select name="segmento" required style="margin-bottom:14px">
    <option value="quentes">Leads quentes ativos (${segs.quentes.length})</option>
    <option value="mornos">Leads mornos ativos (${segs.mornos.length})</option>
    <option value="frios">Leads frios ativos (${segs.frios.length})</option>
    <option value="sem_resposta_7d">Sem resposta ha 7+ dias (${segs.sem_resposta_7d.length})</option>
    <option value="ativos">TODOS ativos (${segs.ativos.length})</option>
  </select>

  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Mensagem</label>
  <textarea name="mensagem" rows="6" required placeholder="Olá! Estamos com uma novidade..." style="margin-bottom:14px"></textarea>

  <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:10px">
    <input type="checkbox" name="incluir_optout" value="1" checked style="width:auto"/>
    Incluir aviso de descadastro no final (LGPD/recomendado)
  </label>

  <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:18px">
    <input type="checkbox" name="confirmar" value="sim" required style="width:auto"/>
    Confirmo que revisei a mensagem e quero disparar agora
  </label>

  <button type="submit" class="btn" style="background:rgba(239,68,68,0.3);border-color:rgba(239,68,68,0.5);color:#fca5a5;width:100%;justify-content:center;padding:14px;font-size:15px">▶ Disparar broadcast</button>
</form>
</div></body></html>`);
  });

  router.post("/broadcast", autenticar, async (req, res) => {
    const segs = segmentosDisponiveis();
    const seg = (req.body?.segmento || "").toString();
    const msgOriginal = (req.body?.mensagem || "").toString().trim();
    const incluirOptout = req.body?.incluir_optout === "1";
    if (!msgOriginal || !segs[seg]) return res.status(400).send("dados invalidos");
    const numeros = segs[seg];

    let msgFinal = msgOriginal;
    if (incluirOptout) {
      msgFinal += "\n\n_Se nao quiser mais receber mensagens, responda PARAR._";
    }

    // Dispara em background com delay e responde imediato
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Broadcast iniciado</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:780px;margin:0 auto;padding:32px 24px">
${navbar("", "broadcast")}
<h1 style="font-size:22px;margin-bottom:10px">Broadcast iniciado</h1>
<div class="card" style="padding:20px">
  <div style="font-size:14px;margin-bottom:10px">Disparando pra ${numeros.length} destinatario(s) com delay 3s entre envios.</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.5)">Voce recebe Telegram quando terminar (${Math.round(numeros.length * 3 / 60)} min estimado).</div>
</div>
<a class="btn" href="/admin/portal" style="margin-top:18px;background:rgba(255,255,255,0.1)">← portal</a>
</div></body></html>`);

    // Background dispatch (não aguarda)
    (async () => {
      let ok = 0, erro = 0;
      const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
      const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
      const axiosLib = require("axios");
      const inicio = Date.now();
      for (const num of numeros) {
        try {
          if (enviarMensagem) {
            await enviarMensagem(num, msgFinal);
            ok++;
            if (conversas[num]) {
              conversas[num].historico = conversas[num].historico || [];
              conversas[num].historico.push({ role: "assistant", content: msgFinal, ts: Date.now(), origem: "broadcast" });
              conversas[num].ultimaAtividade = Date.now();
              db.salvarConversa(num, conversas[num]).catch(()=>{});
              db.salvarMensagem(num, "assistant", msgFinal).catch(()=>{});
            }
          }
        } catch (e) { erro++; console.error("[broadcast] falha", num, e.message); }
        await new Promise(r => setTimeout(r, 3000));
      }
      const min = Math.round((Date.now() - inicio) / 60000);
      const resumo = `HairTech broadcast finalizado.\nSegmento: ${seg}\nEnviadas: ${ok}\nFalhas: ${erro}\nDuracao: ${min}min`;
      axiosLib.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, { chat_id: tgChat, text: resumo }, { timeout: 5000 }).catch(()=>{});
    })();
  });

  // ===== TEMPLATES de mensagem =====
  const TMPL_FILE = path.join(__dirname, "data", "templates-msg.json");
  function lerTemplates() {
    try { return JSON.parse(fs.readFileSync(TMPL_FILE, "utf8")); }
    catch (_) { return []; }
  }

  router.get("/templates", autenticar, (req, res) => {
    const tpls = lerTemplates();
    const categorias = [...new Set(tpls.map(t => t.categoria))];
    const html = categorias.map(cat => {
      const itens = tpls.filter(t => t.categoria === cat);
      return `<div style="margin-bottom:28px">
        <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:14px">${cat}</h2>
        ${itens.map(t => `<div class="card" style="margin-bottom:10px;padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:8px">
            <div style="font-weight:600">${t.titulo}</div>
            <button onclick="navigator.clipboard.writeText(this.parentElement.parentElement.querySelector('.txt').textContent).then(()=>{this.textContent='copiado';setTimeout(()=>this.textContent='Copiar',1500);})" class="btn" style="background:rgba(124,58,237,0.2);color:#a78bfa;font-size:11px;padding:6px 10px">Copiar</button>
          </div>
          <div class="txt" style="font-size:13px;color:rgba(255,255,255,0.7);white-space:pre-wrap;line-height:1.6">${t.texto.replace(/</g,"&lt;")}</div>
        </div>`).join("")}
      </div>`;
    }).join("");

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Templates — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:980px;margin:0 auto;padding:32px 24px">
${navbar("", "templates")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Templates de mensagem</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px">Clique em "Copiar" e cole na conversa. Editar em <code>data/templates-msg.json</code>.</div>
${html}
</div></body></html>`);
  });

  // ===== FOTOS no prontuario =====
  const FOTOS_DIR = path.join(__dirname, "prontuarios", "fotos");
  try { fs.mkdirSync(FOTOS_DIR, { recursive: true }); } catch (_) {}

  router.get("/prontuario/:numero/foto/:nome", autenticar, (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    const nome = path.basename(req.params.nome);
    const arq = path.join(FOTOS_DIR, num, nome);
    if (!arq.startsWith(FOTOS_DIR + path.sep + num)) return res.status(403).end();
    if (!fs.existsSync(arq)) return res.status(404).end();
    res.sendFile(arq);
  });

  router.post("/prontuario/:numero/foto", autenticar, async (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    const dir = path.join(FOTOS_DIR, num);
    fs.mkdirSync(dir, { recursive: true });

    // Recebe upload via multipart simples (sem dep multer - parse manual)
    const chunks = [];
    let total = 0;
    const MAX = 12 * 1024 * 1024; // 12MB max
    req.on("data", c => {
      total += c.length;
      if (total > MAX) {
        try { req.destroy(); } catch (_) {}
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (total === 0) return res.redirect(`/admin/prontuario/${num}`);
      const buf = Buffer.concat(chunks);
      const ct = (req.headers["content-type"] || "");
      const boundary = (ct.match(/boundary=(.+)/) || [])[1];
      if (!boundary) return res.status(400).send("multipart faltando");
      const partes = buf.toString("latin1").split(`--${boundary}`);
      let salvas = 0;
      for (const parte of partes) {
        const m = parte.match(/Content-Disposition: form-data; name="foto"; filename="([^"]+)"\r\nContent-Type: ([^\r\n]+)/);
        if (!m) continue;
        const filename = m[1];
        const ext = (filename.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!["jpg","jpeg","png","webp","heic"].includes(ext)) continue;
        const idx = parte.indexOf("\r\n\r\n");
        if (idx < 0) continue;
        const conteudo = Buffer.from(parte.slice(idx + 4, parte.length - 2), "latin1");
        const nomeArq = `${Date.now()}-${Math.floor(Math.random()*9999)}.${ext}`;
        fs.writeFileSync(path.join(dir, nomeArq), conteudo);

        // Adiciona ao prontuario JSON
        const p = lerProntuario(num);
        p.fotos = p.fotos || [];
        p.fotos.push({ arquivo: nomeArq, enviada_em: new Date().toISOString(), tamanho: conteudo.length });
        salvarProntuario(num, p);
        salvas++;
      }
      res.redirect(`/admin/prontuario/${num}`);
    });
    req.on("error", () => res.status(500).end());
  });

  // ===== AGENDA-LINK (URL secreta do feed ICS pra assinar no app de calendar) =====
  router.get("/agenda-link", autenticar, (req, res) => {
    const token = process.env.AGENDA_ICS_TOKEN || "trocar-este-token-no-env";
    const url = `https://hairtech.org/agenda.ics?token=${encodeURIComponent(token)}`;
    const urlWebcal = url.replace(/^https?:/, "webcal:");
    const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(urlWebcal)}`;
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sincronizar agenda — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:780px;margin:0 auto;padding:32px 24px">
${navbar("", "agendamentos")}
<h1 style="font-size:24px;margin-bottom:6px">Sincronizar agenda com seu celular</h1>
<div style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:24px">Funciona com Apple Calendar, Google Calendar, Outlook, Fantastical e qualquer app que suporte feed iCal.</div>

<div class="card" style="margin-bottom:18px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:12px">Apple Calendar (iPhone/iPad)</h2>
  <ol style="font-size:13px;color:rgba(255,255,255,0.7);line-height:2;margin-left:20px">
    <li>Aponte a camera do iPhone pro QR Code abaixo, OU copie o link</li>
    <li>Toque em "Abrir no Calendario" — vai oferecer adicionar como calendario assinado</li>
    <li>Confirme "Adicionar" e escolha frequencia de atualizacao (sugiro 15 min)</li>
  </ol>
  <div style="text-align:center;margin:20px 0">
    <img src="${qrApi}" alt="QR" style="border-radius:12px;border:6px solid rgba(255,255,255,0.1)"/>
  </div>
</div>

<div class="card" style="margin-bottom:18px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:12px">Google Calendar</h2>
  <ol style="font-size:13px;color:rgba(255,255,255,0.7);line-height:2;margin-left:20px">
    <li>Abre calendar.google.com em desktop</li>
    <li>Sidebar esquerda → "Outros calendarios" → "+" → "Por URL"</li>
    <li>Cola a URL abaixo (versao HTTPS) e salva</li>
  </ol>
</div>

<div class="card" style="margin-bottom:18px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:12px">URLs</h2>
  <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">webcal (iPhone/Mac):</div>
  <input value="${urlWebcal}" readonly style="margin-bottom:14px;font-family:monospace;font-size:11px"/>
  <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">https (Google/Outlook):</div>
  <input value="${url}" readonly style="font-family:monospace;font-size:11px"/>
</div>

<div class="card" style="border-color:rgba(245,158,11,0.4)">
  <div style="font-size:13px;color:#ff9f0a;font-weight:600;margin-bottom:6px">Mantenha esta URL secreta</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.65);line-height:1.6">
    Qualquer pessoa com este link ve sua agenda (nomes de pacientes, telefones, valores).
    Pra trocar o token: edita <code>AGENDA_ICS_TOKEN</code> no .env e remove+adiciona o calendar.
  </div>
</div>
</div></body></html>`);
  });

  // ===== AGENDAMENTOS (visualizacao) =====
  router.get("/agendamentos", autenticar, async (req, res) => {
    let rows = [];
    let erro = null;
    try {
      const r = await db.pool.query(`
        SELECT a.id, a.wa_id, a.tipo, a.data_hora, a.duracao_min, a.status, a.valor, a.observacoes,
               c.nome
        FROM agendamentos a
        LEFT JOIN conversations c ON c.numero = a.wa_id
        WHERE a.data_hora > NOW() - INTERVAL '7 days'
          AND a.data_hora < NOW() + INTERVAL '60 days'
        ORDER BY a.data_hora ASC
      `);
      rows = r.rows;
    } catch (e) { erro = e.message; }

    const corStatus = { agendado: "#3b82f6", confirmado: "#10b981", realizada: "#22c55e", cancelado: "#ef4444", no_show: "#f59e0b" };
    const formatDH = (dh) => {
      const d = new Date(dh);
      return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) +
        " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    };

    let html = "";
    if (rows.length === 0) {
      html = `<div style="padding:60px 20px;text-align:center;color:rgba(255,255,255,0.4)">Nenhum agendamento nos proximos 60 dias.</div>`;
    } else {
      // Agrupa por dia
      const byDay = new Map();
      rows.forEach(r => {
        const k = new Date(r.data_hora).toISOString().slice(0, 10);
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(r);
      });
      html = [...byDay.entries()].map(([dia, lista]) => {
        const d = new Date(dia + "T12:00:00Z");
        const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
        const itens = lista.map(r => {
          const cor = corStatus[r.status] || "#8e8e93";
          return `<div style="display:flex;align-items:center;gap:14px;padding:14px;border-left:3px solid ${cor};background:rgba(255,255,255,0.03);border-radius:0 12px 12px 0;margin-bottom:8px">
            <div style="font-family:monospace;font-size:14px;font-weight:600;min-width:60px">${new Date(r.data_hora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"})}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:500">${r.nome || r.wa_id}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5)">${r.tipo} · ${r.duracao_min}min ${r.valor?'· '+Number(r.valor).toFixed(2):''}</div>
              ${r.observacoes ? `<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px">${r.observacoes.substring(0,100)}</div>` : ""}
            </div>
            <span class="tag" style="background:${cor}33;border-color:${cor}66;color:${cor};white-space:nowrap">${r.status}</span>
          </div>`;
        }).join("");
        return `<div style="margin-bottom:24px">
          <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:12px">${label}</h2>
          ${itens}
        </div>`;
      }).join("");
    }

    res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Agenda — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:1100px;margin:0 auto;padding:32px 24px">
${navbar("", "agendamentos")}
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px;flex-wrap:wrap;gap:10px">
  <h1 style="font-size:24px;font-weight:700">Agenda — proximos 60 dias</h1>
  <div style="font-size:12px;color:rgba(255,255,255,0.4)">${rows.length} agendamento(s)</div>
</div>
${erro ? `<div class="card" style="border-color:rgba(239,68,68,0.4);color:#fca5a5;margin-bottom:18px">${erro}</div>` : ""}
${html}
</div></body></html>`);
  });

  // ===== APROVAR-FILA (re-engajamento pro-ativo) =====
  const CRM_FILA_FILE = path.join(__dirname, "crm-fila.json");

  function lerFila() {
    try { const f = JSON.parse(fs.readFileSync(CRM_FILA_FILE, "utf8")); return Array.isArray(f) ? f : []; }
    catch (_) { return []; }
  }
  function salvarFila(f) { fs.writeFileSync(CRM_FILA_FILE, JSON.stringify(f, null, 2)); }

  router.get("/aprovar-fila", autenticar, (req, res) => {
    const fila = lerFila();
    const pendentes = fila.filter(p => p.status === "pendente");

    const cards = pendentes.length === 0
      ? `<div style="padding:60px 20px;text-align:center;color:rgba(255,255,255,0.4)">Nenhum lead aguardando re-engajamento.<br/><span style="font-size:12px">O CRM pro-ativo roda 1x/dia (10h) e popula esta fila.</span></div>`
      : pendentes.map(p => {
          const dias = p.ultima_atividade ? Math.floor((Date.now() - Number(p.ultima_atividade)) / 86400000) : "?";
          const corTemp = p.temperatura === "quente" ? "#ff3b30" : "#ff9f0a";
          return `<div class="card" style="margin-bottom:14px;padding:18px">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;flex-wrap:wrap;gap:10px">
              <div>
                <div style="font-weight:600;font-size:16px">${p.nome}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.5);font-family:monospace">${p.numero} · ${dias} dias inativo</div>
              </div>
              <span class="tag" style="background:${corTemp}33;border-color:${corTemp}66;color:${corTemp}">${p.temperatura}</span>
            </div>
            <form method="POST" action="/admin/aprovar-fila/${p.id}/aprovar">
              <textarea name="mensagem" rows="3" style="margin-bottom:10px;font-size:13px">${(p.mensagem_sugerida||"").replace(/</g,"&lt;")}</textarea>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="submit" class="btn" style="background:rgba(34,197,94,0.25);border-color:rgba(34,197,94,0.5);color:#86efac;flex:1;justify-content:center">✓ Aprovar e enviar</button>
                <button type="submit" formaction="/admin/aprovar-fila/${p.id}/rejeitar" class="btn" style="background:rgba(239,68,68,0.2);border-color:rgba(239,68,68,0.5);color:#fca5a5">✗ Rejeitar</button>
              </div>
            </form>
          </div>`;
        }).join("");

    res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Aprovar fila — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:32px 24px">
${navbar("", "aprovar-fila")}
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px;flex-wrap:wrap;gap:10px">
  <h1 style="font-size:24px;font-weight:700">Re-engajamento pro-ativo (${pendentes.length})</h1>
  <div style="font-size:12px;color:rgba(255,255,255,0.4)">Mensagem editavel antes de enviar</div>
</div>
${cards}
</div></body></html>`);
  });

  router.post("/aprovar-fila/:id/aprovar", autenticar, async (req, res) => {
    const fila = lerFila();
    const item = fila.find(p => p.id === req.params.id && p.status === "pendente");
    if (!item) return res.redirect("/admin/aprovar-fila");
    const msg = (req.body?.mensagem || item.mensagem_sugerida || "").toString().trim();
    if (!msg) return res.redirect("/admin/aprovar-fila");

    let enviado = false;
    if (enviarMensagem) {
      try { await enviarMensagem(item.numero, msg); enviado = true; }
      catch (e) { console.error("[aprovar-fila] envio falhou:", e.message); }
    }

    item.status = enviado ? "enviado" : "falha_envio";
    item.mensagem_final = msg;
    item.enviado_em = new Date().toISOString();
    item.aprovado_por = "doctor";
    salvarFila(fila);

    if (enviado && conversas[item.numero]) {
      conversas[item.numero].historico = conversas[item.numero].historico || [];
      conversas[item.numero].historico.push({ role: "assistant", content: msg, ts: Date.now(), origem: "proactive-crm" });
      conversas[item.numero].ultimaAtividade = Date.now();
      db.salvarConversa(item.numero, conversas[item.numero]).catch(() => {});
      db.salvarMensagem(item.numero, "assistant", msg).catch(() => {});
    }
    res.redirect("/admin/aprovar-fila");
  });

  router.post("/aprovar-fila/:id/rejeitar", autenticar, (req, res) => {
    const fila = lerFila();
    const item = fila.find(p => p.id === req.params.id);
    if (item) { item.status = "rejeitado"; item.rejeitado_em = new Date().toISOString(); salvarFila(fila); }
    res.redirect("/admin/aprovar-fila");
  });

  // ===== PRONTUARIO (auxiliar, NAO substitui certificado SBIS) =====
  const PRONT_DIR = path.join(__dirname, "prontuarios");
  try { fs.mkdirSync(PRONT_DIR, { recursive: true }); } catch (_) {}

  function lerProntuario(numero) {
    try { return JSON.parse(fs.readFileSync(path.join(PRONT_DIR, `${numero}.json`), "utf8")); }
    catch (_) { return { numero, anamnese: "", conduta: "", consultas: [], fotos: [] }; }
  }
  function salvarProntuario(numero, dados) {
    fs.writeFileSync(path.join(PRONT_DIR, `${numero}.json`), JSON.stringify(dados, null, 2));
  }

  router.get("/prontuario", autenticar, (req, res) => {
    const pacientes = Object.entries(conversas).map(([num, c]) => ({
      numero: num,
      nome: c.nome || "Sem nome",
      ultima: c.ultimaAtividade ? new Date(c.ultimaAtividade).toLocaleDateString("pt-BR") : "—",
      temp: c.temperatura || "frio",
    })).sort((a,b) => (b.ultima||"").localeCompare(a.ultima||""));

    const linhas = pacientes.map(p => `<tr class="row">
      <td style="padding:14px 16px"><a href="/admin/prontuario/${p.numero}" style="color:#fff;text-decoration:none;font-weight:500">${p.nome}</a></td>
      <td style="padding:14px 16px;color:rgba(255,255,255,0.5);font-family:monospace">${p.numero}</td>
      <td style="padding:14px 16px;color:rgba(255,255,255,0.5)">${p.ultima}</td>
      <td style="padding:14px 16px"><span class="tag" style="background:${COR_TEMP[p.temp]};color:${DOT_TEMP[p.temp]};border-color:${DOT_TEMP[p.temp]}66">${p.temp}</span></td>
    </tr>`).join("");

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Prontuario — HairTech</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:1280px;margin:0 auto;padding:32px 24px">
${navbar("", "prontuario")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Prontuario</h1>
<div class="card" style="border-color:rgba(245,158,11,0.4);margin-bottom:18px">
  <div style="font-size:13px;color:#ff9f0a;font-weight:600;margin-bottom:6px">Aviso legal</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.65);line-height:1.6">
    Este modulo e <strong>auxiliar</strong>. Para validade legal plena use:<br/>
    <strong>· Receitas:</strong> Prescricao Eletronica Nacional CFM (botao "Prescrever" no paciente)<br/>
    <strong>· Atestados:</strong> Atesta CFM (obrigatorio desde 05/03/2025 — Res. 2.382/2024)<br/>
    <strong>· Laudo/relatorio:</strong> "Laudo PDF" + assinatura ICP-Brasil via VIDaaS ou certificado A3 CFM em nuvem<br/>
    <strong style="color:#34d399">· Certificado digital: GRATIS via CRM Virtual CFM</strong> (Res. 2.296/2021 — economiza R\$300/ano).
  </div>
</div>
<div class="card">
  <table><thead><tr>
    <th style="padding:12px 16px">Nome</th><th style="padding:12px 16px">Numero</th><th style="padding:12px 16px">Ultima atividade</th><th style="padding:12px 16px">Lead</th>
  </tr></thead><tbody>${linhas || '<tr><td colspan="4" style="padding:30px;text-align:center;color:rgba(255,255,255,0.4)">Nenhum paciente ainda</td></tr>'}</tbody></table>
</div>
</div></body></html>`);
  });

  router.get("/prontuario/:numero", autenticar, (req, res) => {
    const num = req.params.numero.replace(/\D/g,"");
    const c = conversas[num] || {};
    const p = lerProntuario(num);

    // LGPD: log de acesso ao prontuario
    if (db.pool) {
      db.pool.query(
        "INSERT INTO prontuario_access_log (wa_id, acessado_por, acao, ip) VALUES ($1, $2, $3, $4)",
        [num, "doctor", "leitura", req.ip || ""]
      ).catch(() => {});
    }
    const historicoMsg = (c.historico || []).slice(-30).map(m => `<div style="padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:6px"><div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:3px">${m.role}</div><div style="font-size:13px">${(m.content||"").substring(0,400)}</div></div>`).join("");

    const consultasHTML = (p.consultas || []).map(co => `<div class="card" style="margin-bottom:10px;padding:14px">
      <div style="font-weight:600;margin-bottom:4px">${co.data} · ${co.tipo || "consulta"}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);white-space:pre-wrap">${co.observacoes || ""}</div>
    </div>`).join("") || '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4)">Sem consultas registradas</div>';

    const fotosHTML = (p.fotos || []).map(f => `<a href="/admin/prontuario/${num}/foto/${f.arquivo}" target="_blank" style="display:block">
      <img src="/admin/prontuario/${num}/foto/${f.arquivo}" style="width:100%;border-radius:10px;border:1px solid rgba(255,255,255,0.1);object-fit:cover;aspect-ratio:1"/>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);text-align:center;margin-top:4px">${new Date(f.enviada_em).toLocaleDateString("pt-BR")}</div>
    </a>`).join("");

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${c.nome || num} — Prontuario</title><style>${CSS_BASE}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}</style></head>
<body><div style="max-width:1280px;margin:0 auto;padding:32px 24px">
${navbar("", "prontuario")}
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px;flex-wrap:wrap;gap:10px">
  <div>
    <h1 style="font-size:24px;font-weight:700">${c.nome || "Sem nome"}</h1>
    <div style="font-size:13px;color:rgba(255,255,255,0.5);font-family:monospace">${num}</div>
  </div>
  <a href="/admin/prontuario" style="color:rgba(255,255,255,0.5);text-decoration:none">← lista</a>
</div>
<div class="grid2">
  <div>
    <form method="POST" action="/admin/prontuario/${num}/salvar" class="card" style="padding:20px;margin-bottom:14px">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:12px">Anamnese</h2>
      <textarea name="anamnese" rows="6" style="margin-bottom:12px" placeholder="QP, HMA, antecedentes, exame fisico...">${p.anamnese || ""}</textarea>
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:12px">Conduta / Plano</h2>
      <textarea name="conduta" rows="4" style="margin-bottom:14px" placeholder="Protocolo, prescricao, retorno...">${p.conduta || ""}</textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="submit" class="btn" style="background:rgba(124,58,237,0.3);border-color:rgba(124,58,237,0.5);color:#a78bfa;flex:1;min-width:100px;justify-content:center">Salvar</button>
        <a href="/admin/prontuario/${num}/laudo" target="_blank" class="btn" style="background:rgba(16,185,129,0.3);border-color:rgba(16,185,129,0.5);color:#34d399">Laudo</a>
        <a href="/admin/prontuario/${num}/prescrever" class="btn" style="background:rgba(59,130,246,0.3);border-color:rgba(59,130,246,0.5);color:#60a5fa">Prescrever</a>
        <a href="/admin/prontuario/${num}/cobrar" class="btn" style="background:rgba(34,197,94,0.3);border-color:rgba(34,197,94,0.5);color:#86efac">Cobrar</a>
      </div>
    </form>
    <form method="POST" action="/admin/prontuario/${num}/consulta" class="card" style="padding:20px">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:12px">Nova consulta</h2>
      <input name="tipo" placeholder="tipo (avaliacao, retorno, FUE...)" style="margin-bottom:10px"/>
      <textarea name="observacoes" rows="4" placeholder="observacoes da consulta" style="margin-bottom:12px"></textarea>
      <button type="submit" class="btn" style="background:rgba(236,72,153,0.3);border-color:rgba(236,72,153,0.5);color:#f9a8d4;width:100%;justify-content:center">Registrar consulta</button>
    </form>
  </div>
  <div>
    <div class="card" style="padding:20px;margin-bottom:14px">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:12px">Consultas (${(p.consultas||[]).length})</h2>
      ${consultasHTML}
    </div>
    <div class="card" style="padding:20px;margin-bottom:14px">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:12px">Fotos (${(p.fotos||[]).length})</h2>
      ${fotosHTML ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:14px">${fotosHTML}</div>` : '<div style="color:rgba(255,255,255,0.4);font-size:13px;margin-bottom:14px">Sem fotos ainda</div>'}
      <form method="POST" action="/admin/prontuario/${num}/foto" enctype="multipart/form-data">
        <input type="file" name="foto" accept="image/*" required style="margin-bottom:10px"/>
        <button type="submit" class="btn" style="background:rgba(236,72,153,0.3);border-color:rgba(236,72,153,0.5);color:#f9a8d4;width:100%;justify-content:center">Adicionar foto</button>
      </form>
    </div>
    <div class="card" style="padding:20px">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:12px">Conversa WhatsApp (ultimas 30 msgs)</h2>
      <div style="max-height:400px;overflow-y:auto">${historicoMsg || '<div style="color:rgba(255,255,255,0.4);font-size:13px">Sem conversa registrada</div>'}</div>
    </div>
  </div>
</div>
</div></body></html>`);
  });

  router.post("/prontuario/:numero/salvar", autenticar, (req, res) => {
    const num = req.params.numero.replace(/\D/g,"");
    const p = lerProntuario(num);
    p.anamnese = (req.body?.anamnese || "").toString();
    p.conduta = (req.body?.conduta || "").toString();
    p.atualizado_em = new Date().toISOString();
    salvarProntuario(num, p);
    res.redirect(`/admin/prontuario/${num}`);
  });

  // ===== CFM TOKEN (componente embarcado de prescricao) =====
  // Frontend chama isso pra obter token client_credentials. Cache 4min.
  router.get("/cfm-token", autenticar, async (req, res) => {
    try {
      const cfm = require("./integrations/cfm-prescricao");
      if (!cfm.configured()) {
        return res.status(503).json({
          error: "CFM nao configurado",
          como_ativar: "Solicitar credenciais em sistemas.cfm.org.br/contatoprescricaoeletronica/br e adicionar CFM_CLIENT_ID/SECRET ao .env",
          status: cfm.status(),
        });
      }
      const token = await cfm.obterToken();
      res.json({ access_token: token, expires_in: 240, ambiente: cfm.AMBIENTE });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/prontuario/:numero/prescrever", autenticar, (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    const c = conversas[num] || {};
    const cfm = (() => { try { return require("./integrations/cfm-prescricao").status(); } catch (_) { return null; } })();
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Prescrever — ${c.nome || num}</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:32px 24px">
${navbar("", "prontuario")}
<a href="/admin/prontuario/${num}" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:13px">← Voltar pro prontuario</a>
<h1 style="font-size:24px;margin:18px 0">Prescrever pra ${c.nome || num}</h1>

<div class="card" style="margin-bottom:18px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:12px">Caminho oficial: Prescricao Eletronica Nacional CFM</h2>
  <div style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.7">
    Status: <strong>${cfm && cfm.configurado ? cfm.ambiente : "nao configurado"}</strong><br/>
    Componente oficial embarcado, integra Atesta CFM (atestados) e farmacias (CFF).
    Doctor assina com certificado A3 em nuvem ICP-Brasil (gratuito via CRM Virtual CFM).<br/><br/>
    ${cfm && cfm.configurado
      ? `<a href="https://${cfm.ambiente === 'PRODUCAO' ? 'prescricaoeletronica' : 'prescricao-hml'}.cfm.org.br" target="_blank" class="btn" style="background:#3b82f622;border-color:#3b82f666;color:#3b82f6">Abrir CFM Prescricao Eletronica</a>`
      : `<div style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);padding:10px;border-radius:8px;font-size:12px">
          Para ativar:
          <ol style="margin-left:20px;margin-top:6px;line-height:1.8">
            <li>Solicitar credenciais em <a href="https://sistemas.cfm.org.br/contatoprescricaoeletronica/br" target="_blank" style="color:#fbbf24">sistemas.cfm.org.br</a></li>
            <li>Receber CFM_CLIENT_ID e CFM_CLIENT_SECRET (homologacao)</li>
            <li>Adicionar ao .env do AV</li>
            <li>Reiniciar AV (auto via T26)</li>
          </ol>
         </div>`
    }
  </div>
</div>

<div class="card" style="margin-bottom:18px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:12px">Alternativa: Memed</h2>
  <div style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.7">
    +323 integracoes nacionais. Grátis pro medico. Componente JS embarcavel.<br/>
    Status: ${process.env.MEMED_API_KEY ? "<strong>configurado</strong>" : "nao configurado"}<br/><br/>
    <a href="https://memed.com.br/integracao" target="_blank" class="btn" style="background:#7c3aed22;border-color:#7c3aed66;color:#a78bfa">Cadastrar no Memed</a>
  </div>
</div>

<div class="card" style="margin-bottom:18px">
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.5);margin-bottom:12px">Atestado oficial</h2>
  <div style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.7">
    Desde 05/03/2025 (Res. CFM 2.382/2024), atestados OBRIGATORIAMENTE devem ser emitidos pelo barramento Atesta CFM ou sistemas integrados.<br/><br/>
    <a href="https://atesta.cfm.org.br" target="_blank" class="btn" style="background:#10b98122;border-color:#10b98166;color:#10b981">Abrir Atesta CFM</a>
  </div>
</div>

<div class="card" style="border-color:rgba(16,185,129,0.4)">
  <div style="font-size:13px;color:#34d399;font-weight:600;margin-bottom:6px">Certificado digital — GRATUITO no CFM</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.65);line-height:1.6">
    Resolucao CFM 2.296/2021 garante <strong>A3 em nuvem ICP-Brasil grátis</strong> via CRM Virtual (AC Valid).<br/>
    Pre-requisitos: CRM ativo, CIM em policarbonato, biometria atualizada, sem certificado nos ultimos 12 meses.<br/>
    Obter em <a href="https://crmvirtual.cfm.org.br" target="_blank" style="color:#a7f3d0">crmvirtual.cfm.org.br</a> — assina prescricoes/atestados/laudos sem pagar R\$300/ano.
  </div>
</div>
</div></body></html>`);
  });

  // ===== LAUDO PDF (print-friendly, sem npm dep) =====
  // Usuario abre no browser e usa Imprimir > Salvar como PDF.
  // Pra valor legal pleno: assinar PDF gerado com e-CPF (Adobe Reader, ASSINA Brasil, etc).
  router.get("/prontuario/:numero/laudo", autenticar, (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    const c = conversas[num] || {};
    const p = lerProntuario(num);
    const hoje = new Date().toLocaleDateString("pt-BR");
    const clinica = process.env.CLINICA_NOME || "Clinica HairTech";
    const medico = process.env.MEDICO_NOME || "Dr. Ricardo Meireles Marcelino";
    const crm = process.env.MEDICO_CRM || "CRM-RJ XX.XXX";
    const endereco = process.env.CLINICA_ENDERECO || "Rio de Janeiro - RJ";

    const consultasHTML = (p.consultas || []).map(co => `
      <tr><td style="padding:8px;border:1px solid #ccc;width:120px;vertical-align:top">${co.data}</td>
      <td style="padding:8px;border:1px solid #ccc;width:140px;vertical-align:top">${co.tipo || "consulta"}</td>
      <td style="padding:8px;border:1px solid #ccc;white-space:pre-wrap">${(co.observacoes||"").replace(/</g,"&lt;")}</td></tr>`).join("");

    res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><title>Laudo - ${c.nome || num}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  @media print { .no-print { display:none } body { color:#000 } }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color:#222; max-width:780px; margin:30px auto; padding:0 20px; line-height:1.5 }
  h1 { font-size:18px; margin:0 0 6px; letter-spacing:-0.3px }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#666; border-bottom:1px solid #ccc; padding-bottom:4px; margin:24px 0 10px }
  .header { display:flex; justify-content:space-between; border-bottom:2px solid #222; padding-bottom:12px; margin-bottom:20px }
  .meta { font-size:12px; color:#666 }
  .field { margin:8px 0; font-size:13px }
  .field strong { display:inline-block; min-width:140px; color:#444 }
  .box { background:#fafafa; border:1px solid #ddd; padding:12px; border-radius:6px; white-space:pre-wrap; font-size:13px; min-height:60px }
  table { border-collapse:collapse; width:100%; font-size:12px; margin-top:6px }
  .assinatura { margin-top:60px; text-align:center; font-size:12px }
  .assinatura .linha { border-top:1px solid #222; width:280px; margin:0 auto 4px; padding-top:4px }
  .no-print { background:#fef3c7; border:1px solid #f59e0b; padding:10px 14px; border-radius:8px; margin-bottom:20px; font-size:13px }
</style></head>
<body>
<div class="no-print">
  Use <strong>Imprimir</strong> (Ctrl/Cmd + P) e <strong>Salvar como PDF</strong>. Depois assine com seu e-CPF (Adobe Reader, ASSINA Brasil, ou Acrobat Sign).
  <button onclick="window.print()" style="margin-left:12px;padding:6px 14px;background:#f59e0b;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimir</button>
</div>

<div class="header">
  <div>
    <h1>${clinica}</h1>
    <div class="meta">${endereco}</div>
  </div>
  <div class="meta" style="text-align:right">
    Documento emitido em<br/><strong>${hoje}</strong>
  </div>
</div>

<h1 style="text-align:center;margin:20px 0">Relatorio Medico</h1>

<h2>Identificacao do paciente</h2>
<div class="field"><strong>Nome:</strong> ${c.nome || "—"}</div>
<div class="field"><strong>Contato:</strong> +${num}</div>
<div class="field"><strong>Origem:</strong> ${c.origem || "WhatsApp"}</div>

<h2>Anamnese</h2>
<div class="box">${(p.anamnese || "—").replace(/</g,"&lt;")}</div>

<h2>Conduta / Plano terapeutico</h2>
<div class="box">${(p.conduta || "—").replace(/</g,"&lt;")}</div>

${consultasHTML ? `<h2>Historico de consultas</h2>
<table>
  <thead><tr style="background:#f0f0f0">
    <th style="padding:8px;border:1px solid #ccc;text-align:left">Data</th>
    <th style="padding:8px;border:1px solid #ccc;text-align:left">Tipo</th>
    <th style="padding:8px;border:1px solid #ccc;text-align:left">Observacoes</th>
  </tr></thead>
  <tbody>${consultasHTML}</tbody>
</table>` : ""}

<div class="assinatura">
  <div class="linha"></div>
  <strong>${medico}</strong><br/>
  ${crm}
  <div style="font-size:10px;color:#888;margin-top:8px">Para validade legal plena, este documento deve ser assinado digitalmente com certificado ICP-Brasil (e-CPF).</div>
</div>

</body></html>`);
  });

  // ===== COBRAR (gera link Pix InfinityPay + envia via WhatsApp) =====
  router.get("/prontuario/:numero/cobrar", autenticar, (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    const c = conversas[num] || {};
    const ip = (() => { try { return require("./integrations/infinitypay").status(); } catch (_) { return null; } })();
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Cobrar — ${c.nome || num}</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:780px;margin:0 auto;padding:32px 24px">
${navbar("", "prontuario")}
<a href="/admin/prontuario/${num}" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:13px">← Voltar pro prontuario</a>
<h1 style="font-size:24px;margin:18px 0">Cobrar ${c.nome || num}</h1>
<form method="POST" action="/admin/prontuario/${num}/cobrar" class="card" style="padding:24px">
  <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:14px">Status InfinityPay: <strong style="color:${ip && ip.configured ? '#22c55e' : '#f59e0b'}">${ip && ip.configured ? "pronto" : "nao configurado"}</strong></div>
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Valor (R$)</label>
  <input name="valor" type="number" step="0.01" min="0" placeholder="Ex: 400.00" required style="margin-bottom:14px"/>
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">CPF do paciente</label>
  <input name="cpf" type="text" placeholder="00000000000" style="margin-bottom:14px"/>
  <label style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.5px">Descricao</label>
  <input name="descricao" type="text" value="Atendimento Clinica HairTech" required style="margin-bottom:14px"/>
  <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:18px">
    <input type="checkbox" name="enviar_whatsapp" value="1" checked style="width:auto"/>
    Enviar link automaticamente pelo WhatsApp do paciente
  </label>
  <button type="submit" class="btn" style="background:rgba(34,197,94,0.3);border-color:rgba(34,197,94,0.5);color:#86efac;width:100%;justify-content:center;padding:14px;font-size:15px">Gerar link Pix</button>
</form>
</div></body></html>`);
  });

  router.post("/prontuario/:numero/cobrar", autenticar, async (req, res) => {
    const num = req.params.numero.replace(/\D/g, "");
    const c = conversas[num] || {};
    const valor = parseFloat((req.body?.valor || "0").toString().replace(",", "."));
    const cpf = (req.body?.cpf || "").toString().replace(/\D/g, "");
    const descricao = (req.body?.descricao || "Atendimento Clinica HairTech").toString();
    const enviarWa = req.body?.enviar_whatsapp === "1";

    if (!valor || valor <= 0) return res.status(400).send("valor invalido");

    let resultado = { ok: false };
    try {
      const ip = require("./integrations/infinitypay");
      resultado = await ip.criarLinkPix({
        valor, descricao,
        telefone: num,
        nomePaciente: c.nome || "Paciente",
        cpfPaciente: cpf || "00000000000",
        externalId: `cobranca-${num}-${Date.now()}`,
      });

      // Grava em pagamentos se DB tiver
      if (resultado.ok && db.pool) {
        await db.pool.query(
          `INSERT INTO pagamentos (wa_id, provider, invoice_slug, valor, status, link_pagamento, metadata)
           VALUES ($1, 'infinitepay', $2, $3, 'pendente', $4, $5)`,
          [num, resultado.invoice_slug, valor, resultado.link_pagamento, { descricao, gerado_por: "doctor" }]
        ).catch(() => {});
      }

      // Envia via WhatsApp se solicitado
      if (resultado.ok && enviarWa && enviarMensagem) {
        const msg = `Olá ${c.nome ? c.nome.split(" ")[0] : ""}!\n\nSegue link pra pagamento (${descricao}):\n\nValor: R$ ${valor.toFixed(2).replace(".", ",")}\n${resultado.link_pagamento}\n\nQualquer duvida, é so chamar.\n\nClinica HairTech`;
        try {
          await enviarMensagem(num, msg);
          resultado.whatsapp_enviado = true;
        } catch (e) { resultado.whatsapp_erro = e.message; }
      }
    } catch (e) {
      resultado = { ok: false, error: e.message };
    }

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Cobrar - resultado</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:780px;margin:0 auto;padding:32px 24px">
${navbar("", "prontuario")}
<h1 style="font-size:22px;margin-bottom:18px">Resultado da cobranca</h1>
<div class="card" style="white-space:pre-wrap;font-family:monospace;font-size:12px;color:rgba(255,255,255,0.7)">${JSON.stringify(resultado, null, 2)}</div>
<div style="margin-top:18px;display:flex;gap:8px">
  <a class="btn" href="/admin/prontuario/${num}" style="background:rgba(255,255,255,0.1)">← prontuario</a>
  ${resultado.link_pagamento ? `<a class="btn" href="${resultado.link_pagamento}" target="_blank" style="background:rgba(34,197,94,0.3);color:#86efac">Abrir link Pix</a>` : ""}
</div>
</div></body></html>`);
  });

  router.post("/prontuario/:numero/consulta", autenticar, (req, res) => {
    const num = req.params.numero.replace(/\D/g,"");
    const p = lerProntuario(num);
    p.consultas = p.consultas || [];
    p.consultas.unshift({
      id: crypto.randomBytes(6).toString("hex"),
      data: new Date().toLocaleDateString("pt-BR"),
      tipo: (req.body?.tipo || "consulta").toString().slice(0, 60),
      observacoes: (req.body?.observacoes || "").toString(),
    });
    salvarProntuario(num, p);
    res.redirect(`/admin/prontuario/${num}`);
  });

  // ===== AGENTES (lista + invoke teste) =====
  router.get("/agentes", autenticar, async (req, res) => {
    let agentes = [];
    try {
      const s = JSON.parse(fs.readFileSync(path.join(__dirname, "status.json"), "utf8"));
      agentes = (s.agents_list || []).slice();
    } catch (_) {}
    if (agentes.length === 0) {
      agentes = ["AV","ANA","MED","NF","CRM","MKT","POS","ADMIN","ESTOQUE","FOTO","FIN","EDU","COMP"];
    }
    let ocHealth = null;
    try {
      const oc = require("./integrations/openclaw");
      const h = await oc.health();
      ocHealth = h.ok ? h.data : { error: h.last };
    } catch (e) { ocHealth = { error: e.message }; }

    const cards = agentes.map(a => `<div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-weight:700;font-size:16px;letter-spacing:.5px">${a}</div>
        <span class="tag" style="background:#34c75933;border-color:#34c75966;color:#34c759">disponivel</span>
      </div>
      <form method="POST" action="/admin/agentes/${a}/invoke" style="display:flex;gap:8px">
        <input name="prompt" placeholder="testar prompt..." required style="flex:1;padding:8px 10px;font-size:12px"/>
        <button type="submit" class="btn" style="background:rgba(255,255,255,0.1);padding:8px 14px;font-size:12px">▶</button>
      </form>
    </div>`).join("");

    res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Agentes — HairTech</title><style>${CSS_BASE}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}</style></head>
<body><div style="max-width:1280px;margin:0 auto;padding:32px 24px">
${navbar("", "agentes")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:6px">Agentes OpenClaw</h1>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:20px">OpenClaw health: <code>${JSON.stringify(ocHealth).slice(0,160)}</code></div>
<div class="grid">${cards}</div>
</div></body></html>`);
  });

  router.post("/agentes/:nome/invoke", autenticar, express.urlencoded({extended:true}), async (req, res) => {
    const oc = require("./integrations/openclaw");
    const r = await oc.invokeAgent(req.params.nome, (req.body?.prompt || "").toString());
    const senha = req.query.senha;
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Resultado</title><style>${CSS_BASE}</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:32px 24px">
<h1 style="font-size:22px;margin-bottom:18px">Invoke ${req.params.nome}</h1>
<div class="card" style="white-space:pre-wrap;font-family:monospace;font-size:12px;color:rgba(255,255,255,0.7)">${JSON.stringify(r, null, 2)}</div>
<a class="btn" href="/admin/agentes${senha?'?senha='+senha:''}" style="margin-top:18px;background:rgba(255,255,255,0.1)">← voltar</a>
</div></body></html>`);
  });

  // ===== HELP / FEATURE INDEX =====
  router.get("/help", autenticar, (req, res) => {
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ajuda — HairTech</title><style>${CSS_BASE}.sec{margin-bottom:28px}.sec h2{font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:14px}.row{display:flex;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.05);align-items:start;gap:12px}.row code{font-family:monospace;font-size:12px;color:#60a5fa;min-width:200px}.row .d{font-size:13px;color:rgba(255,255,255,0.65);flex:1}</style></head>
<body><div style="max-width:1080px;margin:0 auto;padding:32px 24px">
${navbar("", "help")}
<h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Ajuda - indice de funcionalidades</h1>
<div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px">Todas as rotas e o que cada uma faz. Acesso por <code>/admin/login</code>.</div>

<div class="sec"><h2>Atendimento</h2><div class="card" style="padding:0">
  <div class="row"><code>/admin</code><div class="d">Lista de todas as conversas, filtros temperatura/status</div></div>
  <div class="row"><code>/admin/kanban</code><div class="d">Pipeline visual estilo Trello</div></div>
  <div class="row"><code>/admin/conversa/:numero</code><div class="d">Conversa individual, enviar msg, pausar/retomar/passar pra humano</div></div>
  <div class="row"><code>/admin/templates</code><div class="d">12 mensagens prontas, botao copiar</div></div>
  <div class="row"><code>/admin/broadcast</code><div class="d">Mensagem em massa segmentada (quentes/mornos/inativos/todos)</div></div>
  <div class="row"><code>/admin/aprovar-fila</code><div class="d">Re-engajamento pro-ativo aguardando aprovacao do Dr.</div></div>
  <div class="row"><code>/admin/handoff</code><div class="d">Pedidos OpenClaw precisando de CAPTCHA/login humano</div></div>
</div></div>

<div class="sec"><h2>Clinico</h2><div class="card" style="padding:0">
  <div class="row"><code>/admin/prontuario</code><div class="d">Lista de pacientes</div></div>
  <div class="row"><code>/admin/prontuario/:numero</code><div class="d">Ficha: anamnese, conduta, consultas, fotos, conversa</div></div>
  <div class="row"><code>/admin/prontuario/:numero/laudo</code><div class="d">PDF print-friendly pra assinar com e-CPF</div></div>
  <div class="row"><code>/admin/prontuario/:numero/prescrever</code><div class="d">Caminhos: CFM Prescricao Eletronica, Memed, Atesta CFM</div></div>
  <div class="row"><code>/admin/prontuario/:numero/cobrar</code><div class="d">Gerar link Pix InfinityPay + envia via WhatsApp</div></div>
  <div class="row"><code>/admin/agendamentos</code><div class="d">Calendario proximos 60d</div></div>
  <div class="row"><code>/admin/agenda-link</code><div class="d">Sincronizar com Apple/Google Calendar (QR Code)</div></div>
</div></div>

<div class="sec"><h2>Operacional / Gestao</h2><div class="card" style="padding:0">
  <div class="row"><code>/admin/dashboard</code><div class="d">Graficos Chart.js: leads, temperatura, agendamentos, receita</div></div>
  <div class="row"><code>/admin/status</code><div class="d">Saude containers, OpenClaw, marker flags</div></div>
  <div class="row"><code>/admin/agentes</code><div class="d">13 agentes OpenClaw com invoke de teste</div></div>
  <div class="row"><code>/admin/compliance</code><div class="d">Vencimentos VPS, dominio, alvara, anuidade</div></div>
  <div class="row"><code>/admin/exportar</code><div class="d">CSV de todos os leads</div></div>
</div></div>

<div class="sec"><h2>LGPD / Compliance</h2><div class="card" style="padding:0">
  <div class="row"><code>/admin/lgpd</code><div class="d">Status (100% dos 14 itens implementados)</div></div>
  <div class="row"><code>/admin/incidentes</code><div class="d">Registro de incidentes + notificacao ANPD</div></div>
  <div class="row"><code>/admin/audit</code><div class="d">Log de chamadas IA (retencao 5 anos), export CSV</div></div>
  <div class="row"><code>/admin/paciente/:numero/exportar-lgpd</code><div class="d">JSON com todos os dados (art. 18, V)</div></div>
  <div class="row"><code>/admin/paciente/:numero/excluir-lgpd</code><div class="d">POST anonimiza + deleta (art. 18, VI)</div></div>
  <div class="row"><code>/dpo</code><div class="d">Pagina publica do Encarregado de Dados</div></div>
  <div class="row"><code>/privacidade</code><div class="d">Politica de Privacidade publica</div></div>
  <div class="row"><code>/termos</code><div class="d">Termos de Uso publicos</div></div>
</div></div>

<div class="sec"><h2>Cron / Background</h2><div class="card" style="padding:0">
  <div class="row"><code>auto-deploy</code><div class="d">A cada 2min: git pull + auto-apply.sh</div></div>
  <div class="row"><code>healthcheck</code><div class="d">A cada 5min: Postgres/AV/Traefik/OC/WAHA + self-heal</div></div>
  <div class="row"><code>proactive-crm</code><div class="d">Diario 10h: re-engajamento de leads inativos</div></div>
  <div class="row"><code>proactive-pos</code><div class="d">Diario 9h: follow-up FUE D+1/3/7/15/30</div></div>
  <div class="row"><code>proactive-fin</code><div class="d">Diario 18h: resumo financeiro Telegram</div></div>
  <div class="row"><code>proactive-edu</code><div class="d">Segunda 8h: PubMed tricologia semanal</div></div>
  <div class="row"><code>proactive-comp</code><div class="d">Segunda 8h05: vencimentos &lt;60 dias</div></div>
</div></div>

<div class="sec"><h2>API tecnica</h2><div class="card" style="padding:0">
  <div class="row"><code>/agenda.ics?token=X</code><div class="d">Feed iCalendar (assinar em Apple/Google Calendar)</div></div>
  <div class="row"><code>POST /admin/handoff</code><div class="d">Agentes registram pedido de CAPTCHA</div></div>
  <div class="row"><code>GET /admin/cfm-token</code><div class="d">Token OAuth CFM (cache 4min) pro componente embarcado</div></div>
  <div class="row"><code>POST /webhooks/infinitypay</code><div class="d">Webhook recebimento Pix InfinityPay</div></div>
</div></div>

<div class="sec"><h2>Acoes pendentes do Dr. (1 vez cada)</h2><div class="card" style="padding:18px;line-height:1.8;font-size:13px;color:rgba(255,255,255,0.75)">
  1. <code>ssh root@72.62.100.6 -t 'claude login'</code> (depois Telegram confirmar instalacao)<br/>
  2. Solicitar certificado A3 gratuito CFM: <a href="https://crmvirtual.cfm.org.br" target="_blank" style="color:#60a5fa">crmvirtual.cfm.org.br</a><br/>
  3. Solicitar credenciais Prescricao CFM: <a href="https://sistemas.cfm.org.br/contatoprescricaoeletronica/br" target="_blank" style="color:#60a5fa">sistemas.cfm.org.br</a><br/>
  4. Cadastrar no Memed: <a href="https://memed.com.br/integracao" target="_blank" style="color:#60a5fa">memed.com.br/integracao</a><br/>
  5. Criar conta Backblaze B2 e colar credenciais no .env<br/>
  6. Subir 3 JSONs de Flows no Meta Business Manager<br/>
  7. Preencher CRM/CNPJ no /dpo (edita .env: MEDICO_CRM, MEDICO_NOME)<br/>
  8. Renovar VPS antes 22/05 (4 dias)
</div></div>

</div></body></html>`);
  });

  // ===== STATUS (infra + OpenClaw) =====
  router.get("/status", autenticar, (req, res) => {
    const senha = req.query.senha;
    let s = {};
    try {
      const raw = fs.readFileSync(path.join(__dirname, "status.json"), "utf8");
      s = JSON.parse(raw);
    } catch (_) {
      s = { error: "status.json ainda nao gerado - aguarde 1 ciclo de cron (2min)" };
    }

    const containers = s.containers || {};
    const oc = s.openclaw || {};
    const flags = s.flags || {};
    const updated = s.updated_at ? new Date(s.updated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

    const containerRow = (name) => {
      const st = containers[name] || "missing";
      const color = st === "running" ? "#34c759" : st === "missing" ? "#8e8e93" : "#ff3b30";
      return `<tr class="row"><td style="padding:14px 16px;font-family:monospace">${name}</td><td style="padding:14px 16px;text-align:right"><span class="tag" style="background:${color}33;border-color:${color}66;color:${color}">${st}</span></td></tr>`;
    };

    const flagRow = (name, val) => {
      const color = val ? "#34c759" : "#8e8e93";
      const label = val ? "ativo" : "ausente";
      return `<tr class="row"><td style="padding:14px 16px;font-family:monospace">${name}</td><td style="padding:14px 16px;text-align:right"><span class="tag" style="background:${color}33;border-color:${color}66;color:${color}">${label}</span></td></tr>`;
    };

    const ocColor = oc.health_http === 200 ? "#34c759" : oc.anthropic_ready ? "#ff9f0a" : "#8e8e93";
    const ocLabel = oc.health_http === 200 ? "saudavel" : oc.anthropic_ready ? "armado, sem health" : "nao armado";

    res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Status — HairTech</title>
<style>${CSS_BASE}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}</style>
</head><body><div style="max-width:1280px;margin:0 auto;padding:32px 24px">
${navbar(senha, "status")}
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:20px;flex-wrap:wrap;gap:10px">
  <h1 style="font-size:24px;font-weight:700">Status do sistema</h1>
  <div style="font-size:12px;color:rgba(255,255,255,0.4)">Atualizado: ${updated} ${s.source ? '· fonte: '+s.source : ''} ${s.rev ? '· rev '+s.rev : ''}</div>
</div>

<div class="grid">
  <div class="card">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:14px">OpenClaw</h2>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${ocColor};box-shadow:0 0 10px ${ocColor}"></span>
      <span style="font-size:18px;font-weight:600">${ocLabel}</span>
    </div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.9">
      Anthropic provider: <strong>${oc.anthropic_ready ? 'mergeado' : 'pendente'}</strong><br/>
      Agentes sincronizados: <strong>${oc.agents_synced ?? '—'} / 13</strong><br/>
      Health HTTP: <strong>${oc.health_http ?? '—'}</strong>
    </div>
  </div>

  <div class="card">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:14px">Containers</h2>
    <table>
      ${["hairtech-postgres","assistente-virtual","whatsapp-ana","hairtech-openclaw","traefik-traefik-1","whatsapp-inbox"].map(containerRow).join("")}
    </table>
  </div>

  <div class="card">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:14px">Marker flags</h2>
    <table>
      ${flagRow("ALLOW_RESTART.flag", flags.ALLOW_RESTART)}
      ${flagRow("ANTHROPIC_READY.flag", flags.ANTHROPIC_READY)}
    </table>
  </div>

  <div class="card" style="grid-column:1/-1">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.8px;color:rgba(255,255,255,0.4);margin-bottom:14px">Ultimas tentativas de self-heal</h2>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.8;font-family:monospace;white-space:pre-wrap">${(s.last_alerts || []).slice(-5).join("\n") || "nenhum alerta recente"}</div>
  </div>
</div>

${s.error ? `<div class="card" style="margin-top:18px;border-color:rgba(255,159,10,0.4)"><strong style="color:#ff9f0a">${s.error}</strong></div>` : ""}
</div></body></html>`);
  });

  // ===== EXPORTAR CSV =====
  router.get("/exportar", autenticar, (req, res) => {
    const rows = Object.entries(conversas).map(([num, c]) => {
      const ua = c.ultimaAtividade ? new Date(c.ultimaAtividade).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}) : "";
      return [num, c.nome||"", c.status||"", c.temperatura||"", c.tipo||"", c.tags||"", c.valor||0, c.origem||"whatsapp", ua]
        .map(v => `"${String(v).replace(/"/g,'""')}"`)
        .join(",");
    });
    const csv = ["Numero,Nome,Status,Temperatura,Tipo,Tags,Valor,Origem,UltimaAtividade", ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv;charset=utf-8");
    res.setHeader("Content-Disposition", "attachment;filename=hairtech-leads.csv");
    res.send("﻿" + csv);
  });

  // ===== AÇÕES =====
  router.get("/pausar/:numero", autenticar, (req, res) => {
    const { numero } = req.params;
    if (conversas[numero]) {
      conversas[numero].status = "pausado";
      conversas[numero].proximaRetomada = null;
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
    }
    res.redirect(`/admin?senha=${req.query.senha}`);
  });

  router.get("/retomar/:numero", autenticar, (req, res) => {
    const { numero } = req.params;
    if (conversas[numero]) {
      conversas[numero].status = "ativo";
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
    }
    res.redirect(`/admin?senha=${req.query.senha}`);
  });

  router.get("/humano/:numero", autenticar, (req, res) => {
    const { numero } = req.params;
    if (conversas[numero]) {
      conversas[numero].status = "humano";
      conversas[numero].proximaRetomada = null;
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
    }
    res.redirect(`/admin/conversa/${numero}?senha=${req.query.senha}`);
  });

  router.get("/encerrar/:numero", autenticar, (req, res) => {
    const { numero } = req.params;
    if (conversas[numero]) {
      conversas[numero].status = "encerrado";
      conversas[numero].proximaRetomada = null;
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
    }
    res.redirect(`/admin?senha=${req.query.senha}`);
  });

  // ===== PORTAL (landing pos-login) =====
  router.get("/portal", autenticar, async (req, res) => {
    // Contadores de pendentes para destaque visual
    const contadores = { handoff: 0, fila: 0, vencimentos: 0, incidentes: 0, leads_quentes: 0 };
    try {
      const fHandoff = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "handoff-queue.json"), "utf8")); } catch(_) { return []; } })();
      contadores.handoff = fHandoff.filter(p => p && p.status === "pendente" || !p.status).length;
      const fFila = (() => { try { return JSON.parse(fs.readFileSync(CRM_FILA_FILE, "utf8")); } catch(_) { return []; } })();
      contadores.fila = fFila.filter(p => p.status === "pendente").length;
      const fVenc = (() => { try { return JSON.parse(fs.readFileSync(VENC_FILE, "utf8")); } catch(_) { return []; } })();
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      contadores.vencimentos = fVenc.filter(v => v.ativo && v.vence_em && (new Date(v.vence_em) - hoje) / 86400000 <= 30).length;
      const fInc = (() => { try { return JSON.parse(fs.readFileSync(INC_FILE, "utf8")); } catch(_) { return []; } })();
      contadores.incidentes = fInc.filter(i => !i.notificacao_anpd && i.severidade === "alta").length;
      contadores.leads_quentes = Object.values(conversas).filter(c => c.temperatura === "quente" && c.status === "ativo").length;
    } catch (_) {}

    const cards = [
      { href: "/admin/blitz", titulo: "⚡ BLITZ urgente", desc: "1 clique dispara broadcast quentes+mornos + lista top 10 pra ligar — captacao R$16k+ em 14 dias", cor: "#dc2626", icon: "⚡" },
      { href: "/admin/importar", titulo: "Importar leads", desc: "Cola lista de contatos do WhatsApp pessoal pra entrar no proximo BLITZ", cor: "#22c55e", icon: "📥" },
      { href: "/admin/grupo", titulo: "Grupo Timeless", desc: "ANA WAHA gerencia o grupo - gera link de convite e adiciona pessoas", cor: "#25d366", icon: "👥" },
      { href: "/admin", titulo: "Conversas", desc: "Dashboard de leads e atendimentos no WhatsApp", cor: "#7c3aed", icon: "💬" },
      { href: "/admin/kanban", titulo: "Pipeline", desc: "Kanban de oportunidades por status", cor: "#06b6d4", icon: "📊" },
      { href: "/admin/prontuario", titulo: "Prontuario", desc: "Ficha do paciente, anamnese, fotos, conduta", cor: "#ec4899", icon: "🩺" },
      { href: "/admin/contratos", titulo: "📄 Contratos DocuSign", desc: "Enviar contrato Paciente Modelo via WhatsApp/email - paciente assina pelo celular", cor: "#06b6d4", icon: "📄" },
      { href: "/admin/agentes", titulo: "Agentes", desc: "13 agentes OpenClaw com invoke de teste", cor: "#0ea5e9", icon: "🤖" },
      { href: "/admin/status", titulo: "Status", desc: "Saude dos containers, OpenClaw, flags", cor: "#10b981", icon: "💚" },
      { href: "/admin/handoff", titulo: "Handoff", desc: "Pedidos pendentes de acao humana (CAPTCHA, login)", cor: "#f59e0b", icon: "🖐", badge: contadores.handoff },
      { href: "/admin/aprovar-fila", titulo: "Fila de aprovacao", desc: "Re-engajamento pro-ativo de leads inativos (revisar antes de enviar)", cor: "#22c55e", icon: "✉", badge: contadores.fila },
      { href: "/admin/agendamentos", titulo: "Agenda", desc: "Consultas e procedimentos dos proximos 60 dias", cor: "#3b82f6", icon: "📅" },
      { href: "/admin/agenda-link", titulo: "Sincronizar celular", desc: "Conecta agenda HairTech ao Apple/Google Calendar do seu telefone", cor: "#06b6d4", icon: "📲" },
      { href: "/admin/dashboard", titulo: "Dashboard executivo", desc: "Graficos de leads, receita, agendamentos (Chart.js)", cor: "#8b5cf6", icon: "📈" },
      { href: "/admin/dual-ai", titulo: "Claude + ChatGPT", desc: "Consulta os 2 modelos em paralelo + sintese pra decisoes criticas (CFM, copy, LGPD)", cor: "#a855f7", icon: "🤖" },
      { href: "/admin/auto-cadastro", titulo: "Auto-cadastro", desc: "Claude opera browser virtual da Anthropic pra cadastrar em servicos sem voce digitar (beta)", cor: "#7c3aed", icon: "🚀" },
      { href: "/admin/templates", titulo: "Templates", desc: "Mensagens prontas pra copiar e colar (12 templates pre-configurados)", cor: "#f97316", icon: "✂" },
      { href: "/admin/broadcast", titulo: "Broadcast", desc: "Mensagem em massa segmentada (quentes/mornos/inativos/todos)", cor: "#e11d48", icon: "📢" },
      { href: "/admin/compliance", titulo: "Compliance", desc: "Vencimentos de VPS, dominio, alvara, anuidade - alerta semanal", cor: "#facc15", icon: "📋", badge: contadores.vencimentos },
      { href: "/admin/lgpd", titulo: "LGPD", desc: "Status de conformidade com Lei 13.709/2018 + DPO", cor: "#84cc16", icon: "🔒" },
      { href: "/admin/incidentes", titulo: "Incidentes", desc: "Registro de incidentes LGPD com notificacao ANPD", cor: "#dc2626", icon: "🚨", badge: contadores.incidentes },
      { href: "/admin/audit", titulo: "Audit IA", desc: "Log CFM 2.454/2026 de todas as chamadas de IA (retencao 5 anos)", cor: "#94a3b8", icon: "📝" },
      { href: "/admin/exportar", titulo: "Exportar CSV", desc: "Baixar todos os leads em planilha", cor: "#8b5cf6", icon: "↓" },
      { href: "/admin/logout", titulo: "Sair", desc: "Encerrar sessao atual", cor: "#ef4444", icon: "↩" },
    ];
    res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Portal — HairTech</title>
<style>${CSS_BASE}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
.tile{padding:24px;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);transition:all .25s;text-decoration:none;color:#fff;display:block;cursor:pointer}
.tile:hover{transform:translateY(-3px);background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2)}
.tile .ico{font-size:30px;margin-bottom:10px}
.tile .ttl{font-size:18px;font-weight:600;margin-bottom:4px}
.tile .dsc{font-size:13px;color:rgba(255,255,255,0.5);line-height:1.5}
</style></head>
<body><div style="max-width:1200px;margin:0 auto;padding:40px 24px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:36px;flex-wrap:wrap;gap:12px">
    <div>
      <div style="font-size:28px;font-weight:700;letter-spacing:-0.5px">✦ HairTech</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-top:4px">Ambiente Virtual da clinica</div>
    </div>
    <a href="/admin/logout" class="btn" style="background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.12);color:rgba(255,255,255,0.6)">Sair</a>
  </div>
  <div class="grid">
    ${cards.map(c => `<a class="tile" href="${c.href}" style="border-left:3px solid ${c.cor};position:relative">
      ${c.badge && c.badge > 0 ? `<div style="position:absolute;top:14px;right:14px;background:${c.cor};color:#fff;font-size:11px;font-weight:700;min-width:22px;height:22px;border-radius:11px;display:flex;align-items:center;justify-content:center;padding:0 7px">${c.badge}</div>` : ""}
      <div class="ico" style="color:${c.cor}">${c.icon}</div>
      <div class="ttl">${c.titulo}</div>
      <div class="dsc">${c.desc}</div>
    </a>`).join("")}
  </div>
</div></body></html>`);
  });

  // ===== HANDOFF (placeholder) =====
  // Quando OpenClaw / agentes batem em CAPTCHA, login manual ou prova de humano,
  // eles registram aqui um pedido pendente. O Dr. assume e devolve.
  router.get("/handoff", autenticar, (req, res) => {
    let fila = [];
    try {
      fila = JSON.parse(fs.readFileSync(path.join(__dirname, "handoff-queue.json"), "utf8"));
      if (!Array.isArray(fila)) fila = [];
    } catch (_) { fila = []; }

    const filaHTML = fila.length === 0
      ? `<div style="padding:60px 20px;text-align:center;color:rgba(255,255,255,0.4)">Nenhum pedido pendente.<br/><span style="font-size:12px">Quando OpenClaw precisar de CAPTCHA ou login manual, aparece aqui.</span></div>`
      : fila.map(p => {
          const promptIA = encodeURIComponent(`Continue esta tarefa do agente ${p.agente || "?"}: ${p.titulo}. ${p.descricao || ""} URL: ${p.url || "(sem URL)"}`);
          const linkClaude = `https://claude.ai/new?q=${promptIA}`;
          const linkManus = `https://manus.im/?q=${promptIA}`;
          const linkOperator = p.url ? p.url : `https://operator.chatgpt.com/`;
          return `<div class="card" style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:14px;flex-wrap:wrap">
              <div style="flex:1;min-width:260px">
                <div style="font-size:16px;font-weight:600;margin-bottom:4px">${p.titulo || "Acao manual"}</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:8px">${p.descricao || ""}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.35)">agente: ${p.agente || "?"} · ${p.criado_em || "?"}</div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                ${p.url ? `<a class="btn" href="${p.url}" target="_blank" style="background:#3b82f622;border-color:#3b82f666;color:#3b82f6">Browser</a>` : ""}
                <a class="btn" href="${linkClaude}" target="_blank" style="background:#d97a4022;border-color:#d97a4066;color:#d97a40">Claude</a>
                <a class="btn" href="${linkManus}" target="_blank" style="background:#7c3aed22;border-color:#7c3aed66;color:#a78bfa">Manus</a>
                <a class="btn" href="${linkOperator}" target="_blank" style="background:#10b98122;border-color:#10b98166;color:#10b981">Operator</a>
                <form method="POST" action="/admin/handoff/${p.id}/resolver" style="display:inline">
                  <button type="submit" class="btn" style="background:#22c55e22;border-color:#22c55e66;color:#22c55e">✓ Resolver</button>
                </form>
              </div>
            </div>
          </div>`;
        }).join("");

    res.send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Handoff — HairTech</title>
<style>${CSS_BASE}</style></head>
<body><div style="max-width:980px;margin:0 auto;padding:32px 24px">
${navbar("", "handoff")}
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:20px;flex-wrap:wrap;gap:10px">
  <h1 style="font-size:24px;font-weight:700">Handoff ao vivo</h1>
  <a href="/admin/portal" style="color:rgba(255,255,255,0.5);font-size:13px;text-decoration:none">← Portal</a>
</div>
<div class="card" style="margin-bottom:24px;border-color:rgba(245,158,11,0.3)">
  <div style="font-size:14px;color:#f59e0b;font-weight:600;margin-bottom:6px">Em construcao</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6">
    Esta pagina lista pedidos em que OpenClaw precisa de voce — CAPTCHA, login manual, prova de humano.<br/>
    Visualizacao do browser remoto (estilo Manus) sera adicionada em <code>Round 16</code>: container Chrome headless + viewer noVNC com handoff bidirecional. Por enquanto, links abrem em nova aba.<br/>
    Endpoint para agentes criarem pedido: <code>POST /admin/handoff</code> com {agente, titulo, descricao, url}.
  </div>
</div>
${filaHTML}
</div></body></html>`);
  });

  router.post("/handoff", autenticar, express.json(), async (req, res) => {
    const { agente, titulo, descricao, url } = req.body || {};
    if (!titulo) return res.status(400).json({ error: "titulo obrigatorio" });
    let fila = [];
    const arquivo = path.join(__dirname, "handoff-queue.json");
    try { fila = JSON.parse(fs.readFileSync(arquivo, "utf8")); if (!Array.isArray(fila)) fila = []; } catch (_) {}
    const pedido = {
      id: crypto.randomBytes(8).toString("hex"),
      agente: agente || "desconhecido",
      titulo, descricao, url,
      criado_em: new Date().toISOString(),
    };
    fila.push(pedido);
    fs.writeFileSync(arquivo, JSON.stringify(fila.slice(-50), null, 2));

    const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
    const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
    const txt = `🖐 HairTech handoff\nAgente: ${pedido.agente}\n${pedido.titulo}\n${pedido.descricao || ""}\n${pedido.url ? "URL: " + pedido.url : ""}\n\nResolver: https://hairtech.org/admin/handoff`;
    require("axios").post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      chat_id: tgChat, text: txt.slice(0, 3800), disable_web_page_preview: true,
    }, { timeout: 5000 }).catch(() => {});

    res.json({ ok: true, id: pedido.id, total: fila.length });
  });

  router.post("/handoff/:id/resolver", autenticar, (req, res) => {
    const arquivo = path.join(__dirname, "handoff-queue.json");
    let fila = [];
    try { fila = JSON.parse(fs.readFileSync(arquivo, "utf8")); if (!Array.isArray(fila)) fila = []; } catch (_) {}
    fila = fila.filter(p => p.id !== req.params.id);
    fs.writeFileSync(arquivo, JSON.stringify(fila, null, 2));
    res.redirect("/admin/handoff");
  });

  return router;
};
