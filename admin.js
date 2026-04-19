const express = require("express");
const router = express.Router();

const ADMIN_PASS = process.env.ADMIN_PASS || "hairtech2026";

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

module.exports = function(conversas) {

  router.get("/", autenticar, (req, res) => {
    const senha = req.query.senha;
    const agora = Date.now();

    const status_cor = {
      ativo:     "#22c55e",
      pausado:   "#f59e0b",
      humano:    "#3b82f6",
      encerrado: "#6b7280"
    };

    const linhas = Object.entries(conversas).map(([numero, c]) => {
      const inativo = Math.floor((agora - c.ultimaAtividade) / 60000);
      const inaStr = inativo < 60
        ? `${inativo}min`
        : inativo < 1440
          ? `${Math.floor(inativo/60)}h`
          : `${Math.floor(inativo/1440)}d`;

      const cor = status_cor[c.status] || "#6b7280";
      const hist = c.historico || [];
      const ultima = hist.length ? hist[hist.length - 1].content.substring(0, 80) : "—";

      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #222">+${numero}</td>
          <td style="padding:10px;border-bottom:1px solid #222">
            <span style="background:${cor};color:#000;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:bold">
              ${c.status || "ativo"}
            </span>
          </td>
          <td style="padding:10px;border-bottom:1px solid #222">${c.tipo || "novo"}</td>
          <td style="padding:10px;border-bottom:1px solid #222">${inaStr} atrás</td>
          <td style="padding:10px;border-bottom:1px solid #222">${c.retomadas || 0}</td>
          <td style="padding:10px;border-bottom:1px solid #222;font-size:12px;color:#aaa">${ultima}...</td>
          <td style="padding:10px;border-bottom:1px solid #222">
            ${c.status !== "pausado"
              ? `<a href="/admin/pausar/${numero}?senha=${senha}" style="background:#f59e0b;color:#000;padding:5px 12px;border-radius:5px;text-decoration:none;font-size:12px">Pausar bot</a>`
              : `<a href="/admin/retomar/${numero}?senha=${senha}" style="background:#22c55e;color:#000;padding:5px 12px;border-radius:5px;text-decoration:none;font-size:12px">Retomar bot</a>`
            }
            <a href="/admin/encerrar/${numero}?senha=${senha}" style="background:#ef4444;color:#fff;padding:5px 12px;border-radius:5px;text-decoration:none;font-size:12px;margin-left:4px">Encerrar</a>
          </td>
        </tr>`;
    }).join("");

    const total = Object.keys(conversas).length;
    const ativos  = Object.values(conversas).filter(c => c.status === "ativo").length;
    const pausados = Object.values(conversas).filter(c => c.status === "pausado").length;
    const humanos  = Object.values(conversas).filter(c => c.status === "humano").length;

    res.send(`
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>HairTech — Painel</title>
        <meta http-equiv="refresh" content="30"/>
        <style>
          body { font-family: sans-serif; background: #0f0f0f; color: #fff; margin: 0; padding: 24px; }
          h1 { color: #7c3aed; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { text-align: left; padding: 10px; background: #1a1a1a; color: #888; font-size: 12px; text-transform: uppercase; }
          tr:hover td { background: #1a1a1a; }
          .card { display:inline-block; background:#1a1a1a; padding:16px 24px; border-radius:10px; margin-right:12px; margin-bottom:16px; }
          .card span { font-size:28px; font-weight:bold; display:block; }
          .card small { color:#888; font-size:13px; }
        </style>
      </head>
      <body>
        <h1>Clinica HairTech — Painel de Atendimentos</h1>
        <p style="color:#888;font-size:13px">Atualiza automaticamente a cada 30 segundos</p>

        <div class="card"><span>${total}</span><small>Total de conversas</small></div>
        <div class="card"><span style="color:#22c55e">${ativos}</span><small>Ativas (bot)</small></div>
        <div class="card"><span style="color:#3b82f6">${humanos}</span><small>Com humano</small></div>
        <div class="card"><span style="color:#f59e0b">${pausados}</span><small>Pausadas</small></div>

        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Status</th>
              <th>Tipo</th>
              <th>Inativo há</th>
              <th>Retomadas</th>
              <th>Última mensagem</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>${linhas || '<tr><td colspan="7" style="padding:20px;color:#888;text-align:center">Nenhuma conversa ativa</td></tr>'}</tbody>
        </table>
      </body>
      </html>
    `);
  });

  router.get("/pausar/:numero", autenticar, (req, res) => {
    const { numero } = req.params;
    if (conversas[numero]) {
      conversas[numero].status = "pausado";
      conversas[numero].proximaRetomada = null;
      console.log(`Bot pausado para ${numero}`);
    }
    res.redirect(`/admin?senha=${req.query.senha}`);
  });

  router.get("/retomar/:numero", autenticar, (req, res) => {
    const { numero } = req.params;
    if (conversas[numero]) {
      conversas[numero].status = "ativo";
      console.log(`Bot retomado para ${numero}`);
    }
    res.redirect(`/admin?senha=${req.query.senha}`);
  });

  router.get("/encerrar/:numero", autenticar, (req, res) => {
    const { numero } = req.params;
    if (conversas[numero]) {
      conversas[numero].status = "encerrado";
      conversas[numero].proximaRetomada = null;
    }
    res.redirect(`/admin?senha=${req.query.senha}`);
  });

  return router;
};
