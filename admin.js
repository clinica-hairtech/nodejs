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
    { href: `/admin${q}`, label: "Conversas", id: "dash" },
    { href: `/admin/dashboard${q}`, label: "Dashboard", id: "dashboard" },
    { href: `/admin/kanban${q}`, label: "Pipeline", id: "kanban" },
    { href: `/admin/agentes${q}`, label: "Agentes", id: "agentes" },
    { href: `/admin/status${q}`, label: "Status", id: "status" },
    { href: `/admin/handoff${q}`, label: "Handoff", id: "handoff" },
    { href: `/admin/aprovar-fila${q}`, label: "Fila", id: "aprovar-fila" },
    { href: `/admin/agendamentos${q}`, label: "Agenda", id: "agendamentos" },
    { href: `/admin/prontuario${q}`, label: "Prontuario", id: "prontuario" },
    { href: `/admin/compliance${q}`, label: "Compliance", id: "compliance" },
    { href: `/admin/lgpd${q}`, label: "LGPD", id: "lgpd" },
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
      { ok: false, lbl: "Anonimizacao de PII antes da IA", det: "Hoje envia nome do paciente no prompt" },
      { ok: false, lbl: "Log de acesso ao prontuario", det: "Tabela prontuario_access_log nao criada" },
      { ok: false, lbl: "RIPD (Relatorio de Impacto)", det: "Pendente - modelo ANPD em docs/LGPD-CONFORMIDADE.md" },
      { ok: false, lbl: "Plano resposta a incidentes (notif ANPD 2d)", det: "Pendente - documentar processo" },
      { ok: false, lbl: "Cadeia de processadores documentada", det: "Meta, Google, OpenAI, Anthropic, Hostinger - listado em docs" },
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
    const historicoMsg = (c.historico || []).slice(-30).map(m => `<div style="padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:6px"><div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:3px">${m.role}</div><div style="font-size:13px">${(m.content||"").substring(0,400)}</div></div>`).join("");

    const consultasHTML = (p.consultas || []).map(co => `<div class="card" style="margin-bottom:10px;padding:14px">
      <div style="font-weight:600;margin-bottom:4px">${co.data} · ${co.tipo || "consulta"}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);white-space:pre-wrap">${co.observacoes || ""}</div>
    </div>`).join("") || '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4)">Sem consultas registradas</div>';

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
        <button type="submit" class="btn" style="background:rgba(124,58,237,0.3);border-color:rgba(124,58,237,0.5);color:#a78bfa;flex:1;min-width:120px;justify-content:center">Salvar</button>
        <a href="/admin/prontuario/${num}/laudo" target="_blank" class="btn" style="background:rgba(16,185,129,0.3);border-color:rgba(16,185,129,0.5);color:#34d399">Laudo PDF</a>
        <a href="/admin/prontuario/${num}/prescrever" class="btn" style="background:rgba(59,130,246,0.3);border-color:rgba(59,130,246,0.5);color:#60a5fa">Prescrever</a>
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
  router.get("/portal", autenticar, (req, res) => {
    const cards = [
      { href: "/admin", titulo: "Conversas", desc: "Dashboard de leads e atendimentos no WhatsApp", cor: "#7c3aed", icon: "💬" },
      { href: "/admin/kanban", titulo: "Pipeline", desc: "Kanban de oportunidades por status", cor: "#06b6d4", icon: "📊" },
      { href: "/admin/prontuario", titulo: "Prontuario", desc: "Ficha do paciente, anamnese, fotos, conduta", cor: "#ec4899", icon: "🩺" },
      { href: "/admin/agentes", titulo: "Agentes", desc: "13 agentes OpenClaw com invoke de teste", cor: "#0ea5e9", icon: "🤖" },
      { href: "/admin/status", titulo: "Status", desc: "Saude dos containers, OpenClaw, flags", cor: "#10b981", icon: "💚" },
      { href: "/admin/handoff", titulo: "Handoff", desc: "Pedidos pendentes de acao humana (CAPTCHA, login)", cor: "#f59e0b", icon: "🖐" },
      { href: "/admin/aprovar-fila", titulo: "Fila de aprovacao", desc: "Re-engajamento pro-ativo de leads inativos (revisar antes de enviar)", cor: "#22c55e", icon: "✉" },
      { href: "/admin/agendamentos", titulo: "Agenda", desc: "Consultas e procedimentos dos proximos 60 dias", cor: "#3b82f6", icon: "📅" },
      { href: "/admin/agenda-link", titulo: "Sincronizar celular", desc: "Conecta agenda HairTech ao Apple/Google Calendar do seu telefone", cor: "#06b6d4", icon: "📲" },
      { href: "/admin/dashboard", titulo: "Dashboard executivo", desc: "Graficos de leads, receita, agendamentos (Chart.js)", cor: "#8b5cf6", icon: "📈" },
      { href: "/admin/compliance", titulo: "Compliance", desc: "Vencimentos de VPS, dominio, alvara, anuidade - alerta semanal", cor: "#facc15", icon: "📋" },
      { href: "/admin/lgpd", titulo: "LGPD", desc: "Status de conformidade com Lei 13.709/2018 + DPO", cor: "#84cc16", icon: "🔒" },
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
    ${cards.map(c => `<a class="tile" href="${c.href}" style="border-left:3px solid ${c.cor}">
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
