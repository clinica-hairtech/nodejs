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
    { href: `/admin${q}`, label: "Dashboard", id: "dash" },
    { href: `/admin/kanban${q}`, label: "Pipeline", id: "kanban" },
    { href: `/admin/agentes${q}`, label: "Agentes", id: "agentes" },
    { href: `/admin/status${q}`, label: "Status", id: "status" },
    { href: `/admin/handoff${q}`, label: "Handoff", id: "handoff" },
    { href: `/admin/prontuario${q}`, label: "Prontuario", id: "prontuario" },
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
    Este modulo e <strong>auxiliar</strong>. Para valor legal pleno (CFM 2.299/2021 e Lei 13.787/2018) o prontuario eletronico precisa de:
    <strong>(1)</strong> certificacao SBIS/CFM (NGS1 ou NGS2),
    <strong>(2)</strong> assinatura digital ICP-Brasil (e-CPF A1/A3 do medico),
    <strong>(3)</strong> backup off-site e log de auditoria de 20 anos.<br/>
    Use isso pra organizar consultas e fotos — para emitir laudo oficial, assine com e-CPF e exporte PDF carimbado.
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
      <div style="display:flex;gap:8px">
        <button type="submit" class="btn" style="background:rgba(124,58,237,0.3);border-color:rgba(124,58,237,0.5);color:#a78bfa;flex:1;justify-content:center">Salvar</button>
        <a href="/admin/prontuario/${num}/laudo" target="_blank" class="btn" style="background:rgba(16,185,129,0.3);border-color:rgba(16,185,129,0.5);color:#34d399">Gerar laudo PDF</a>
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
