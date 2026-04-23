const express = require("express");
const router = express.Router();
const db = require("./db");

const ADMIN_PASS = process.env.ADMIN_PASS || "hairtech2026";

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

function autenticar(req, res, next) {
  const senha = req.query.senha || req.body?.senha;
  if (senha !== ADMIN_PASS) {
    return res.status(401).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>HairTech</title>
<style>${CSS_BASE}body{display:flex;align-items:center;justify-content:center}</style>
</head>
<body>
<div class="card" style="width:360px;padding:48px 40px">
  <div style="font-size:22px;font-weight:700;margin-bottom:6px;letter-spacing:-0.5px">✦ HairTech</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:36px">Painel de Controle</div>
  <form method="GET">
    <input name="senha" type="password" placeholder="Senha de acesso" autofocus style="margin-bottom:12px"/>
    <button type="submit" class="btn" style="width:100%;justify-content:center;background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.2);font-size:15px;padding:14px">Entrar</button>
  </form>
</div>
</body></html>`);
  }
  next();
}

function navbar(senha, ativa) {
  const links = [
    { href: `/admin?senha=${senha}`, label: "Dashboard", id: "dash" },
    { href: `/admin/kanban?senha=${senha}`, label: "Pipeline", id: "kanban" },
    { href: `/admin/exportar?senha=${senha}`, label: "↓ CSV", id: "csv" },
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

  return router;
};
