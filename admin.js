const express = require("express");
const router = express.Router();
const db = require("./db");

const ADMIN_PASS = process.env.ADMIN_PASS || "hairtech2026";

function autenticar(req, res, next) {
  const senha = req.query.senha || req.body?.senha;
  if (senha !== ADMIN_PASS) {
    return res.status(401).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>HairTech</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#1a0533 0%,#0d1b4b 40%,#0a2a3a 70%,#001a1a 100%);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif}
  .card{background:rgba(255,255,255,0.08);backdrop-filter:blur(40px) saturate(180%);
    -webkit-backdrop-filter:blur(40px) saturate(180%);border:1px solid rgba(255,255,255,0.18);
    border-radius:28px;padding:48px 40px;width:360px;
    box-shadow:0 32px 64px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.2)}
  .logo{font-size:22px;font-weight:700;color:#fff;margin-bottom:6px;letter-spacing:-0.5px}
  .sub{font-size:13px;color:rgba(255,255,255,0.45);margin-bottom:36px}
  input{width:100%;padding:14px 18px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
    border-radius:14px;color:#fff;font-size:15px;outline:none;transition:all .2s;margin-bottom:12px}
  input::placeholder{color:rgba(255,255,255,0.3)}
  input:focus{border-color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.12)}
  button{width:100%;padding:14px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);
    border-radius:14px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;
    transition:all .2s;backdrop-filter:blur(10px)}
  button:hover{background:rgba(255,255,255,0.22);transform:translateY(-1px)}
</style>
</head>
<body>
  <div class="card">
    <div class="logo">✦ HairTech</div>
    <div class="sub">Painel de Controle</div>
    <form method="GET">
      <input name="senha" type="password" placeholder="Senha de acesso" autofocus/>
      <button type="submit">Entrar</button>
    </form>
  </div>
</body></html>`);
  }
  next();
}

module.exports = function(conversas, enviarMensagem) {

  // ===== PAINEL PRINCIPAL =====
  router.get("/", autenticar, async (req, res) => {
    const senha = req.query.senha;
    const agora = Date.now();
    const filtroTemp   = req.query.temp   || "";
    const filtroStatus = req.query.status || "";
    const busca        = (req.query.q || "").toLowerCase();
    const metricas = await db.buscarMetricas().catch(() => null);

    const total    = Object.keys(conversas).length;
    const ativos   = Object.values(conversas).filter(c => c.status === "ativo").length;
    const pausados = Object.values(conversas).filter(c => c.status === "pausado").length;
    const humanos  = Object.values(conversas).filter(c => c.status === "humano").length;
    const quentes  = Object.values(conversas).filter(c => c.temperatura === "quente").length;
    const mornos   = Object.values(conversas).filter(c => c.temperatura === "morno").length;

    const COR_TEMP = { quente: "rgba(255,59,48,0.25)", morno: "rgba(255,159,10,0.25)", frio: "rgba(120,120,128,0.2)" };
    const DOT_TEMP = { quente: "#ff3b30", morno: "#ff9f0a", frio: "#8e8e93" };
    const DOT_STATUS = { ativo: "#34c759", pausado: "#ff9f0a", humano: "#007aff", encerrado: "#8e8e93" };

    const linhas = Object.entries(conversas)
      .filter(([num, c]) => {
        if (filtroTemp   && c.temperatura !== filtroTemp)   return false;
        if (filtroStatus && c.status      !== filtroStatus) return false;
        if (busca && !num.includes(busca) && !(c.nome||"").toLowerCase().includes(busca)) return false;
        return true;
      })
      .sort((a, b) => {
        const ordem = { quente: 0, morno: 1, frio: 2 };
        return (ordem[a[1].temperatura] ?? 3) - (ordem[b[1].temperatura] ?? 3) ||
               (b[1].ultimaAtividade || 0) - (a[1].ultimaAtividade || 0);
      })
      .map(([numero, c]) => {
        const inativo = Math.floor((agora - c.ultimaAtividade) / 60000);
        const inaStr  = inativo < 60 ? `${inativo}min` : inativo < 1440 ? `${Math.floor(inativo/60)}h` : `${Math.floor(inativo/1440)}d`;
        const hist    = c.historico || [];
        const ultima  = hist.length ? hist[hist.length - 1].content.replace(/\[.*?\]/g, "").trim().substring(0, 60) : "—";
        const temp    = c.temperatura || "frio";

        return `
          <tr class="row" onclick="location.href='/admin/conversa/${numero}?senha=${senha}'" style="cursor:pointer">
            <td style="padding:14px 16px">
              <div style="font-weight:600;color:#fff;font-size:14px">${c.nome || ('+' + numero)}</div>
              ${c.nome ? `<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px">+${numero}</div>` : ''}
            </td>
            <td style="padding:14px 16px">
              <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.07);padding:4px 10px;border-radius:20px;font-size:12px;color:rgba(255,255,255,0.8)">
                <span style="width:6px;height:6px;border-radius:50%;background:${DOT_STATUS[c.status]||'#8e8e93'};display:inline-block"></span>
                ${c.status}
              </span>
            </td>
            <td style="padding:14px 16px">
              <span style="background:${COR_TEMP[temp]};border:1px solid ${DOT_TEMP[temp]}44;color:${DOT_TEMP[temp]};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">
                ${temp.toUpperCase()}
              </span>
            </td>
            <td style="padding:14px 16px;color:rgba(255,255,255,0.5);font-size:13px">${c.tipo || "novo"}</td>
            <td style="padding:14px 16px;color:rgba(255,255,255,0.4);font-size:12px">${inaStr} atrás</td>
            <td style="padding:14px 16px;font-size:12px;color:rgba(255,255,255,0.35);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ultima}</td>
            <td style="padding:14px 16px" onclick="event.stopPropagation()">
              <div style="display:flex;gap:6px">
                <a href="/admin/conversa/${numero}?senha=${senha}" style="background:rgba(120,80,255,0.3);border:1px solid rgba(120,80,255,0.5);color:#c4b5fd;padding:5px 12px;border-radius:10px;text-decoration:none;font-size:12px;font-weight:500">Ver</a>
                ${c.status !== "pausado"
                  ? `<a href="/admin/pausar/${numero}?senha=${senha}" style="background:rgba(255,159,10,0.2);border:1px solid rgba(255,159,10,0.4);color:#ff9f0a;padding:5px 12px;border-radius:10px;text-decoration:none;font-size:12px;font-weight:500">Pausar</a>`
                  : `<a href="/admin/retomar/${numero}?senha=${senha}" style="background:rgba(52,199,89,0.2);border:1px solid rgba(52,199,89,0.4);color:#34c759;padding:5px 12px;border-radius:10px;text-decoration:none;font-size:12px;font-weight:500">Retomar</a>`
                }
              </div>
            </td>
          </tr>`;
      }).join("");

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>HairTech — Painel</title>
<meta http-equiv="refresh" content="30"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;background:linear-gradient(135deg,#1a0533 0%,#0d1b4b 40%,#0a2a3a 70%,#001a1a 100%);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;color:#fff;padding:28px}
  .glass{background:rgba(255,255,255,0.06);backdrop-filter:blur(40px) saturate(180%);
    -webkit-backdrop-filter:blur(40px) saturate(180%);border:1px solid rgba(255,255,255,0.12);border-radius:22px;
    box-shadow:0 20px 60px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.12)}
  .card{background:rgba(255,255,255,0.07);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
    border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:20px 24px;
    box-shadow:0 8px 32px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.1)}
  .pill{display:inline-block;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:500;
    cursor:pointer;text-decoration:none;transition:all .2s;border:1px solid transparent}
  .pill:hover{transform:translateY(-1px)}
  table{width:100%;border-collapse:collapse}
  th{padding:12px 16px;text-align:left;font-size:11px;color:rgba(255,255,255,0.35);
    text-transform:uppercase;letter-spacing:.8px;font-weight:500;border-bottom:1px solid rgba(255,255,255,0.06)}
  .row:hover td{background:rgba(255,255,255,0.04)}
  input[type=text]{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
    border-radius:12px;padding:10px 16px;color:#fff;font-size:14px;outline:none;width:240px;transition:all .2s}
  input[type=text]::placeholder{color:rgba(255,255,255,0.3)}
  input[type=text]:focus{border-color:rgba(255,255,255,0.3);background:rgba(255,255,255,0.1)}
</style>
</head>
<body>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px">
    <div>
      <h1 style="font-size:28px;font-weight:700;letter-spacing:-1px;color:#fff">✦ HairTech</h1>
      <p style="color:rgba(255,255,255,0.35);font-size:13px;margin-top:4px">Painel de Controle · atualiza em 30s</p>
    </div>
    <form method="GET" style="display:flex;gap:8px;align-items:center">
      <input type="hidden" name="senha" value="${senha}"/>
      <input type="text" name="q" value="${req.query.q||''}" placeholder="Buscar número ou nome…"/>
    </form>
  </div>

  <!-- Métricas -->
  <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px">
    ${[
      ["Total", total, "#fff"],
      ["Bot ativo", ativos, "#34c759"],
      ["Com humano", humanos, "#007aff"],
      ["Pausados", pausados, "#ff9f0a"],
      ["Quentes", quentes, "#ff3b30"],
      ["Mornos", mornos, "#ff9f0a"]
    ].map(([label, val, cor]) => `
      <div class="card" style="min-width:110px;text-align:center">
        <div style="font-size:30px;font-weight:700;color:${cor};letter-spacing:-1px">${val}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px">${label}</div>
      </div>`).join("")}
  </div>

  ${metricas ? `
  <div class="card" style="margin-bottom:24px">
    <p style="font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">Histórico Geral</p>
    <div style="display:flex;gap:24px;flex-wrap:wrap">
      <span style="font-size:13px;color:rgba(255,255,255,0.6)">Conversas (7d): <strong style="color:#a78bfa">${metricas.conversas_semana}</strong></span>
      <span style="font-size:13px;color:rgba(255,255,255,0.6)">Transplantes: <strong style="color:#c4b5fd">${metricas.transplantes}</strong></span>
      <span style="font-size:13px;color:rgba(255,255,255,0.6)">Convertidos: <strong style="color:#34c759">${metricas.convertidos}</strong></span>
      <span style="font-size:13px;color:rgba(255,255,255,0.6)">Retornos: <strong style="color:#6b7280">${metricas.retornos}</strong></span>
    </div>
  </div>` : ""}

  <!-- Filtros -->
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
    ${[
      ["Todos", "", "", "rgba(255,255,255,0.1)", "rgba(255,255,255,0.2)", "rgba(255,255,255,0.7)"],
      ["Quente", "quente", "", "rgba(255,59,48,0.15)", "rgba(255,59,48,0.4)", "#ff3b30"],
      ["Morno", "morno", "", "rgba(255,159,10,0.15)", "rgba(255,159,10,0.4)", "#ff9f0a"],
      ["Frio", "frio", "", "rgba(120,120,128,0.1)", "rgba(120,120,128,0.3)", "#8e8e93"],
    ].map(([label, t, s, bg, bdr, cor]) => {
      const ativo = filtroTemp === t && !filtroStatus;
      return `<a href="/admin?senha=${senha}${t?'&temp='+t:''}${s?'&status='+s:''}" class="pill" style="background:${ativo?'rgba(255,255,255,0.15)':bg};border-color:${bdr};color:${cor};font-weight:${ativo?700:400}">${label}</a>`;
    }).join("")}
    <span style="width:1px;background:rgba(255,255,255,0.1);margin:0 4px"></span>
    ${[
      ["Ativo", "", "ativo", "rgba(52,199,89,0.15)", "rgba(52,199,89,0.4)", "#34c759"],
      ["Humano", "", "humano", "rgba(0,122,255,0.15)", "rgba(0,122,255,0.4)", "#007aff"],
      ["Pausado", "", "pausado", "rgba(255,159,10,0.15)", "rgba(255,159,10,0.4)", "#ff9f0a"],
    ].map(([label, t, s, bg, bdr, cor]) => {
      const ativo = filtroStatus === s;
      return `<a href="/admin?senha=${senha}${t?'&temp='+t:''}${s?'&status='+s:''}" class="pill" style="background:${ativo?'rgba(255,255,255,0.15)':bg};border-color:${bdr};color:${cor};font-weight:${ativo?700:400}">${label}</a>`;
    }).join("")}
  </div>

  <!-- Tabela -->
  <div class="glass">
    <table>
      <thead>
        <tr>
          <th>Paciente</th><th>Status</th><th>Lead</th><th>Tipo</th><th>Inativo</th><th>Última mensagem</th><th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${linhas || `<tr><td colspan="7" style="padding:40px;text-align:center;color:rgba(255,255,255,0.25);font-size:14px">Nenhuma conversa encontrada</td></tr>`}
      </tbody>
    </table>
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
    const DOT_TEMP   = { quente: "#ff3b30", morno: "#ff9f0a", frio: "#8e8e93" };
    const DOT_STATUS = { ativo: "#34c759", pausado: "#ff9f0a", humano: "#007aff", encerrado: "#8e8e93" };

    // Carrega histórico completo do banco
    let hist = c.historico || [];
    try {
      if (db.pool) {
        const result = await db.pool.query(
          `SELECT role, content, created_at FROM mensagens WHERE numero=$1 ORDER BY created_at ASC LIMIT 200`,
          [numero]
        );
        if (result.rows.length > 0) {
          hist = result.rows.map(r => ({ role: r.role, content: r.content, ts: new Date(r.created_at).getTime() }));
        }
      }
    } catch (_) {}

    const msgs = hist.map(m => {
      const isBot = m.role === "assistant";
      const content = (m.content || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\[BOTAO_ESPECIALISTA\]/g, "<em style='color:#a78bfa;font-style:normal'>⬡ Botão Especialista enviado</em>")
        .replace(/\[MENU_INICIAL\]/g, "<em style='color:#a78bfa;font-style:normal'>⊞ Menu enviado</em>")
        .replace(/\[NOTIF_AGENDAMENTO\]/g, "")
        .replace(/\[NOTIF_TRANSPLANTE\]/g, "")
        .replace(/\[PDF_FOTOS_M\]/g, "<em style='color:#a78bfa;font-style:normal'>📎 Guia masculino enviado</em>")
        .replace(/\[PDF_FOTOS_F\]/g, "<em style='color:#a78bfa;font-style:normal'>📎 Guia feminino enviado</em>")
        .replace(/\[PDF_FOTOS\]/g, "<em style='color:#a78bfa;font-style:normal'>📎 PDF enviado</em>")
        .replace(/\[HUMANO\]/g, "")
        .trim();
      if (!content) return "";
      const hora = m.ts ? new Date(m.ts).toLocaleString("pt-BR", {
        day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit", timeZone:"America/Sao_Paulo"
      }) : "";
      return `
        <div style="display:flex;justify-content:${isBot ? 'flex-start' : 'flex-end'};margin-bottom:14px;align-items:flex-end;gap:8px">
          ${isBot ? `<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">✦</div>` : ''}
          <div style="max-width:72%;${isBot
            ? 'background:rgba(255,255,255,0.08);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.15);'
            : 'background:linear-gradient(135deg,rgba(124,58,237,0.6),rgba(59,130,246,0.5));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(124,58,237,0.4);'
          }padding:12px 16px;border-radius:${isBot ? '4px 18px 18px 18px' : '18px 18px 4px 18px'};font-size:14px;white-space:pre-wrap;line-height:1.55;box-shadow:0 4px 20px rgba(0,0,0,0.2)">
            ${hora ? `<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px;font-weight:500">${isBot ? 'BOT' : 'PACIENTE'} · ${hora}</div>` : ''}
            <div style="color:rgba(255,255,255,${isBot ? '0.85' : '0.95'})">${content}</div>
          </div>
          ${!isBot ? `<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">👤</div>` : ''}
        </div>`;
    }).join("");

    const agora = Date.now();
    const inativo = Math.floor((agora - c.ultimaAtividade) / 60000);
    const inaStr  = inativo < 60 ? `${inativo}min atrás` : inativo < 1440 ? `${Math.floor(inativo/60)}h atrás` : `${Math.floor(inativo/1440)}d atrás`;

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>+${numero} — HairTech</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;background:linear-gradient(135deg,#1a0533 0%,#0d1b4b 40%,#0a2a3a 70%,#001a1a 100%);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;color:#fff;padding:24px}
  .glass{background:rgba(255,255,255,0.06);backdrop-filter:blur(40px) saturate(180%);
    -webkit-backdrop-filter:blur(40px) saturate(180%);border:1px solid rgba(255,255,255,0.12);border-radius:22px;
    box-shadow:0 20px 60px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.12)}
  .chat{height:calc(100vh - 340px);min-height:300px;overflow-y:auto;padding:20px;scroll-behavior:smooth}
  .chat::-webkit-scrollbar{width:4px}
  .chat::-webkit-scrollbar-track{background:transparent}
  .chat::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:4px}
  textarea{width:100%;padding:14px 18px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
    border-radius:16px;color:#fff;font-size:14px;outline:none;resize:none;transition:all .2s;
    font-family:inherit;line-height:1.5}
  textarea::placeholder{color:rgba(255,255,255,0.3)}
  textarea:focus{border-color:rgba(255,255,255,0.25);background:rgba(255,255,255,0.1)}
  .btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:12px;
    font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;border:1px solid transparent;
    transition:all .2s;backdrop-filter:blur(10px)}
  .btn:hover{transform:translateY(-1px);opacity:.9}
  .tag{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.07);
    border:1px solid rgba(255,255,255,0.1);padding:4px 12px;border-radius:20px;font-size:12px;color:rgba(255,255,255,0.65)}
</style>
</head>
<body>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
    <a href="/admin?senha=${senha}" style="color:rgba(255,255,255,0.4);text-decoration:none;font-size:13px;display:flex;align-items:center;gap:4px">
      ← Painel
    </a>
  </div>

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;box-shadow:0 4px 20px rgba(124,58,237,0.4)">
        ${(c.nome || numero).charAt(0).toUpperCase()}
      </div>
      <div>
        <h2 style="font-size:20px;font-weight:700;letter-spacing:-0.5px">${c.nome || ('+' + numero)}</h2>
        ${c.nome ? `<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px">+${numero}</div>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <span class="tag"><span style="width:7px;height:7px;border-radius:50%;background:${DOT_STATUS[c.status]||'#8e8e93'}"></span>${c.status}</span>
      <span class="tag"><span style="width:7px;height:7px;border-radius:50%;background:${DOT_TEMP[temp]}"></span>${temp}</span>
      <span class="tag">${c.tipo || "novo"}</span>
      ${c.genero ? `<span class="tag">${c.genero}</span>` : ""}
      <span class="tag" style="color:rgba(255,255,255,0.35)">${hist.length} msgs · ${inaStr}</span>
    </div>
  </div>

  <!-- Chat -->
  <div class="glass" style="margin-bottom:16px">
    <div class="chat" id="chat">
      ${msgs || `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.2);font-size:14px">Sem histórico de mensagens</div>`}
    </div>
  </div>

  <!-- Input -->
  <div class="glass" style="padding:16px">
    <form method="POST" action="/admin/enviar/${numero}?senha=${senha}">
      <textarea name="mensagem" rows="2" placeholder="Digite uma mensagem para enviar como bot…"></textarea>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button type="submit" class="btn" style="background:rgba(124,58,237,0.4);border-color:rgba(124,58,237,0.6);color:#e9d5ff">Enviar mensagem</button>
        <a href="/admin/pausar/${numero}?senha=${senha}" class="btn" style="background:rgba(255,159,10,0.2);border-color:rgba(255,159,10,0.4);color:#ff9f0a">Pausar bot</a>
        <a href="/admin/retomar/${numero}?senha=${senha}" class="btn" style="background:rgba(52,199,89,0.2);border-color:rgba(52,199,89,0.4);color:#34c759">Retomar bot</a>
        <a href="/admin/encerrar/${numero}?senha=${senha}" class="btn" style="background:rgba(255,59,48,0.2);border-color:rgba(255,59,48,0.4);color:#ff3b30">Encerrar</a>
      </div>
    </form>
  </div>

  <script>const c=document.getElementById("chat");if(c)c.scrollTop=c.scrollHeight;</script>
</body></html>`);
  });

  // ===== ENVIAR MENSAGEM DO PAINEL =====
  router.post("/enviar/:numero", autenticar, async (req, res) => {
    const { numero } = req.params;
    const senha = req.query.senha;
    const mensagem = req.body?.mensagem?.trim();

    if (mensagem && enviarMensagem) {
      try {
        await enviarMensagem(numero, mensagem);
        if (conversas[numero]) {
          conversas[numero].historico.push({ role: "assistant", content: mensagem, ts: Date.now() });
          conversas[numero].ultimaAtividade = Date.now();
          db.salvarConversa(numero, conversas[numero]).catch(() => {});
          db.salvarMensagem(numero, "assistant", mensagem).catch(() => {});
        }
      } catch (e) {
        console.error("Erro ao enviar do painel:", e.message);
      }
    }

    res.redirect(`/admin/conversa/${numero}?senha=${senha}`);
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
