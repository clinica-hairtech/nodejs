const express = require("express");
const router = express.Router();
const db = require("./db");

const ADMIN_PASS = process.env.ADMIN_PASS || "hairtech2026";

const COR_STATUS = { ativo: "#22c55e", pausado: "#f59e0b", humano: "#3b82f6", encerrado: "#6b7280" };
const COR_TEMP   = { quente: "#ef4444", morno: "#f59e0b", frio: "#6b7280" };

function autenticar(req, res, next) {
  const senha = req.query.senha || req.body?.senha;
  if (senha !== ADMIN_PASS) {
    return res.status(401).send(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0f0f0f;color:#fff">
        <h2>Painel HairTech</h2>
        <form method="GET">
          <input name="senha" type="password" placeholder="Senha" style="padding:10px;font-size:16px;width:250px;border-radius:6px;border:none"/>
          <button type="submit" style="padding:10px 20px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-left:8px">Entrar</button>
        </form>
      </body></html>
    `);
  }
  next();
}

module.exports = function(conversas, enviarMensagem) {

  // ===== PAINEL PRINCIPAL =====
  router.get("/", autenticar, async (req, res) => {
    const senha = req.query.senha;
    const agora = Date.now();
    const filtroTemp = req.query.temp || "";
    const metricas = await db.buscarMetricas().catch(() => null);

    const total    = Object.keys(conversas).length;
    const ativos   = Object.values(conversas).filter(c => c.status === "ativo").length;
    const pausados = Object.values(conversas).filter(c => c.status === "pausado").length;
    const humanos  = Object.values(conversas).filter(c => c.status === "humano").length;
    const quentes  = Object.values(conversas).filter(c => c.temperatura === "quente").length;
    const mornos   = Object.values(conversas).filter(c => c.temperatura === "morno").length;

    const linhas = Object.entries(conversas)
      .filter(([, c]) => !filtroTemp || c.temperatura === filtroTemp)
      .sort((a, b) => {
        const ordem = { quente: 0, morno: 1, frio: 2 };
        return (ordem[a[1].temperatura] ?? 3) - (ordem[b[1].temperatura] ?? 3);
      })
      .map(([numero, c]) => {
        const inativo = Math.floor((agora - c.ultimaAtividade) / 60000);
        const inaStr  = inativo < 60 ? `${inativo}min` : inativo < 1440 ? `${Math.floor(inativo/60)}h` : `${Math.floor(inativo/1440)}d`;
        const hist    = c.historico || [];
        const ultima  = hist.length ? hist[hist.length - 1].content.replace(/\[.*?\]/g, "").trim().substring(0, 70) : "—";
        const temp    = c.temperatura || "frio";

        return `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #222">
              <a href="/admin/conversa/${numero}?senha=${senha}" style="color:#a78bfa;text-decoration:none;font-weight:bold">+${numero}</a>
            </td>
            <td style="padding:10px;border-bottom:1px solid #222">
              <span style="background:${COR_STATUS[c.status]||'#6b7280'};color:#000;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:bold">${c.status}</span>
            </td>
            <td style="padding:10px;border-bottom:1px solid #222">
              <span style="background:${COR_TEMP[temp]};color:#fff;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:bold">${temp.toUpperCase()}</span>
            </td>
            <td style="padding:10px;border-bottom:1px solid #222">${c.tipo || "novo"}</td>
            <td style="padding:10px;border-bottom:1px solid #222">${c.genero || "—"}</td>
            <td style="padding:10px;border-bottom:1px solid #222">${inaStr} atras</td>
            <td style="padding:10px;border-bottom:1px solid #222">${hist.length} msgs</td>
            <td style="padding:10px;border-bottom:1px solid #222;font-size:12px;color:#aaa;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ultima}</td>
            <td style="padding:10px;border-bottom:1px solid #222">
              <a href="/admin/conversa/${numero}?senha=${senha}" style="background:#7c3aed;color:#fff;padding:5px 10px;border-radius:5px;text-decoration:none;font-size:12px">Ver</a>
              ${c.status !== "pausado"
                ? `<a href="/admin/pausar/${numero}?senha=${senha}" style="background:#f59e0b;color:#000;padding:5px 10px;border-radius:5px;text-decoration:none;font-size:12px;margin-left:4px">Pausar</a>`
                : `<a href="/admin/retomar/${numero}?senha=${senha}" style="background:#22c55e;color:#000;padding:5px 10px;border-radius:5px;text-decoration:none;font-size:12px;margin-left:4px">Retomar</a>`
              }
              <a href="/admin/encerrar/${numero}?senha=${senha}" style="background:#ef4444;color:#fff;padding:5px 10px;border-radius:5px;text-decoration:none;font-size:12px;margin-left:4px">Encerrar</a>
            </td>
          </tr>`;
      }).join("");

    const filtros = ["", "quente", "morno", "frio"].map(t =>
      `<a href="/admin?senha=${senha}${t ? '&temp='+t : ''}" style="background:${t ? COR_TEMP[t] : '#333'};color:#fff;padding:6px 14px;border-radius:20px;text-decoration:none;font-size:13px;font-weight:${filtroTemp===t?'bold':'normal'}">${t || "Todos"}</a>`
    ).join(" ");

    res.send(`
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>HairTech — Painel</title>
        <meta http-equiv="refresh" content="30"/>
        <style>
          body { font-family:sans-serif;background:#0f0f0f;color:#fff;margin:0;padding:24px; }
          h1 { color:#7c3aed;margin-bottom:4px; }
          table { width:100%;border-collapse:collapse;margin-top:20px; }
          th { text-align:left;padding:10px;background:#1a1a1a;color:#888;font-size:12px;text-transform:uppercase; }
          tr:hover td { background:#1a1a1a; }
          .card { display:inline-block;background:#1a1a1a;padding:16px 24px;border-radius:10px;margin-right:12px;margin-bottom:16px; }
          .card span { font-size:28px;font-weight:bold;display:block; }
          .card small { color:#888;font-size:13px; }
        </style>
      </head>
      <body>
        <h1>Clinica HairTech — Painel</h1>
        <p style="color:#888;font-size:13px">Atualiza a cada 30 segundos</p>

        <div class="card"><span>${total}</span><small>Total</small></div>
        <div class="card"><span style="color:#22c55e">${ativos}</span><small>Bot ativo</small></div>
        <div class="card"><span style="color:#3b82f6">${humanos}</span><small>Com humano</small></div>
        <div class="card"><span style="color:#f59e0b">${pausados}</span><small>Pausados</small></div>
        <div class="card"><span style="color:#ef4444">${quentes}</span><small>Leads quentes</small></div>
        <div class="card"><span style="color:#f59e0b">${mornos}</span><small>Leads mornos</small></div>

        ${metricas ? `
        <div style="margin:20px 0;padding:16px;background:#111;border-radius:10px;border-left:3px solid #7c3aed">
          <p style="color:#888;font-size:12px;margin:0 0 10px">METRICAS HISTORICAS (banco de dados)</p>
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <span style="font-size:13px">Conversas (7d): <strong style="color:#a78bfa">${metricas.conversas_semana}</strong></span>
            <span style="font-size:13px">Quentes total: <strong style="color:#ef4444">${metricas.leads_quentes}</strong></span>
            <span style="font-size:13px">Mornos total: <strong style="color:#f59e0b">${metricas.leads_mornos}</strong></span>
            <span style="font-size:13px">Convertidos: <strong style="color:#22c55e">${metricas.convertidos}</strong></span>
            <span style="font-size:13px">Transplante: <strong style="color:#c4b5fd">${metricas.transplantes}</strong></span>
            <span style="font-size:13px">Retornos: <strong style="color:#6b7280">${metricas.retornos}</strong></span>
          </div>
        </div>` : ""}

        <div style="margin:16px 0">${filtros}</div>

        <table>
          <thead>
            <tr>
              <th>Numero</th><th>Status</th><th>Lead</th><th>Tipo</th><th>Genero</th><th>Inativo</th><th>Msgs</th><th>Ultima mensagem</th><th>Acoes</th>
            </tr>
          </thead>
          <tbody>${linhas || '<tr><td colspan="9" style="padding:20px;color:#888;text-align:center">Nenhuma conversa</td></tr>'}</tbody>
        </table>
      </body>
      </html>
    `);
  });

  // ===== CONVERSA INDIVIDUAL =====
  router.get("/conversa/:numero", autenticar, (req, res) => {
    const { numero } = req.params;
    const senha = req.query.senha;
    const c = conversas[numero];

    if (!c) return res.redirect(`/admin?senha=${senha}`);

    const temp  = c.temperatura || "frio";
    const hist  = c.historico || [];

    const msgs = hist.map(m => {
      const isBot = m.role === "assistant";
      const content = (m.content || "")
        .replace(/\[BOTAO_ESPECIALISTA\]/g, "<i style='color:#a78bfa'>[Botao Especialista enviado]</i>")
        .replace(/\[MENU_INICIAL\]/g, "<i style='color:#a78bfa'>[Menu enviado]</i>")
        .replace(/\[NOTIF_AGENDAMENTO\]/g, "")
        .replace(/\[NOTIF_TRANSPLANTE\]/g, "")
        .replace(/\[PDF_FOTOS_M\]/g, "<i style='color:#a78bfa'>[Guia masculino enviado]</i>")
        .replace(/\[PDF_FOTOS_F\]/g, "<i style='color:#a78bfa'>[Guia feminino enviado]</i>")
        .replace(/\[PDF_FOTOS\]/g, "<i style='color:#a78bfa'>[PDF enviado]</i>")
        .replace(/\[HUMANO\]/g, "")
        .trim();
      if (!content) return "";
      return `
        <div style="display:flex;justify-content:${isBot ? 'flex-start' : 'flex-end'};margin-bottom:10px">
          <div style="max-width:75%;background:${isBot ? '#1e1e2e' : '#4c1d95'};padding:10px 14px;border-radius:12px;font-size:13px;white-space:pre-wrap;line-height:1.5">
            <small style="color:${isBot ? '#6b7280' : '#c4b5fd'};font-size:10px;display:block;margin-bottom:4px">${isBot ? 'BOT' : 'PACIENTE'}</small>
            ${content}
          </div>
        </div>`;
    }).join("");

    const agora = Date.now();
    const inativo = Math.floor((agora - c.ultimaAtividade) / 60000);
    const inaStr  = inativo < 60 ? `${inativo}min atras` : inativo < 1440 ? `${Math.floor(inativo/60)}h atras` : `${Math.floor(inativo/1440)}d atras`;

    res.send(`
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Conversa +${numero}</title>
        <style>
          body { font-family:sans-serif;background:#0f0f0f;color:#fff;margin:0;padding:24px; }
          .chat { height:500px;overflow-y:auto;background:#111;padding:16px;border-radius:10px;margin:16px 0; }
          textarea { width:100%;padding:10px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#fff;font-size:14px;box-sizing:border-box;resize:vertical; }
          .btn { display:inline-block;padding:10px 16px;border-radius:6px;border:none;cursor:pointer;font-size:13px;text-decoration:none; }
        </style>
      </head>
      <body>
        <a href="/admin?senha=${senha}" style="color:#888;text-decoration:none;font-size:13px">← Voltar ao painel</a>
        <h2 style="color:#7c3aed;margin:12px 0 6px">+${numero}</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <span style="background:${COR_TEMP[temp]};color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:bold">${temp.toUpperCase()}</span>
          <span style="background:${COR_STATUS[c.status]||'#6b7280'};color:#000;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:bold">${c.status}</span>
          <span style="background:#1a1a1a;color:#aaa;padding:4px 12px;border-radius:20px;font-size:12px">${c.tipo || "novo"}</span>
          ${c.genero ? `<span style="background:#1a1a1a;color:#aaa;padding:4px 12px;border-radius:20px;font-size:12px">${c.genero}</span>` : ""}
          <span style="color:#555;font-size:12px">${hist.length} msgs &bull; ${inaStr}</span>
        </div>

        <div class="chat" id="chat">
          ${msgs || '<p style="color:#555;text-align:center">Sem historico de mensagens</p>'}
        </div>

        <form method="POST" action="/admin/enviar/${numero}?senha=${senha}" style="margin-bottom:16px">
          <textarea name="mensagem" rows="3" placeholder="Digite uma mensagem para enviar como bot..."></textarea>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <button type="submit" class="btn" style="background:#7c3aed;color:#fff">Enviar mensagem</button>
            <a href="/admin/pausar/${numero}?senha=${senha}" class="btn" style="background:#f59e0b;color:#000">Pausar bot</a>
            <a href="/admin/retomar/${numero}?senha=${senha}" class="btn" style="background:#22c55e;color:#000">Retomar bot</a>
            <a href="/admin/encerrar/${numero}?senha=${senha}" class="btn" style="background:#ef4444;color:#fff">Encerrar</a>
          </div>
        </form>

        <script>const c = document.getElementById("chat"); if(c) c.scrollTop = c.scrollHeight;</script>
      </body>
      </html>
    `);
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
          conversas[numero].historico.push({ role: "assistant", content: mensagem });
          conversas[numero].ultimaAtividade = Date.now();
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
