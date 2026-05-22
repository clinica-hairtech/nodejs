// /admin/fotos — galeria de fotos dos pacientes organizadas por categoria.
// Lida pelo organizar-fotos.js (cron diario 04h + sob demanda).

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const ADMIN_SENHA = process.env.ADMIN_SENHA || "hairtech2026";
const FOTOS_DIR = path.join(__dirname, "data", "fotos-pacientes");
const INDEX_FILE = path.join(FOTOS_DIR, "_index.json");
const RELATORIO_FILE = path.join(FOTOS_DIR, "_relatorio.json");

const CATEGORIAS = ["FOTO_CABELO", "COMPROVANTE", "PRINT_TELEFONE", "DOCUMENTO", "OUTRO"];

function autenticar(req, res, next) {
  if (req.query.senha !== ADMIN_SENHA) return res.status(401).send("Nao autorizado");
  next();
}

function lerIndex() { try { return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")); } catch (_) { return { fotos: [], processadas_ids: [] }; } }
function lerRelatorio() { try { return JSON.parse(fs.readFileSync(RELATORIO_FILE, "utf8")); } catch (_) { return null; } }

router.get("/fotos", autenticar, (req, res) => {
  const filtroCat = req.query.cat || "";
  const filtroNumero = (req.query.numero || "").replace(/\D/g, "");
  const idx = lerIndex();
  const rel = lerRelatorio();
  let fotos = idx.fotos || [];
  if (filtroCat) fotos = fotos.filter(f => f.categoria === filtroCat);
  if (filtroNumero) fotos = fotos.filter(f => f.numero === filtroNumero);
  fotos.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  fotos = fotos.slice(0, 500);

  const senha = ADMIN_SENHA;
  const categoriaTabs = CATEGORIAS.map(c => {
    const ativo = filtroCat === c ? "background:rgba(168,85,247,0.5)" : "background:rgba(255,255,255,0.05)";
    const count = rel?.por_categoria?.[c] || 0;
    return `<a href="/admin/fotos?senha=${senha}&cat=${c}" style="padding:8px 14px;border-radius:8px;text-decoration:none;color:#fff;${ativo}">${c.replace(/_/g, " ")} (${count})</a>`;
  }).join(" ");

  const cards = fotos.map(f => `
    <div style="background:rgba(255,255,255,0.06);padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.1)">
      <img src="/admin/fotos/img/${encodeURIComponent(f.arquivo)}?senha=${senha}"
           style="width:100%;height:200px;object-fit:cover;border-radius:8px;display:block"
           loading="lazy">
      <div style="padding:8px 4px 0;font-size:12px;line-height:1.5">
        <div style="font-weight:600">${f.nome || "(sem nome)"} - +${f.numero}</div>
        <div style="opacity:0.6">${f.categoria}</div>
        <div style="opacity:0.5">${new Date(f.ts || f.processado_em).toLocaleString("pt-BR")}</div>
      </div>
    </div>`).join("");

  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fotos Pacientes - HairTech</title>
<style>
body{font-family:system-ui;background:linear-gradient(135deg,#0c0c1e,#1a1a3e);color:#fff;margin:0;padding:20px;min-height:100vh}
h1{margin:0 0 12px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:20px}
.summary{background:rgba(255,255,255,0.05);padding:14px;border-radius:12px;margin-bottom:10px;font-size:14px}
input{background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:8px 12px;border-radius:8px;font-size:14px;width:200px}
button{background:linear-gradient(90deg,#a855f7,#6366f1);color:#fff;border:0;padding:9px 18px;border-radius:8px;cursor:pointer}
a{color:#c4b5fd}
</style></head><body>
<h1>Fotos Pacientes (${idx.fotos.length} total)</h1>
<div class="summary">
  ${rel ? `Ultima rodada: ${new Date(rel.gerado_em).toLocaleString("pt-BR")} | Novas: ${rel.novas_nesta_rodada} | Pacientes: ${rel.pacientes}` : "Aguardando primeira rodada do organizar-fotos.js"}
</div>
<div class="tabs">
  <a href="/admin/fotos?senha=${senha}" style="padding:8px 14px;border-radius:8px;text-decoration:none;color:#fff;background:${!filtroCat?'rgba(168,85,247,0.5)':'rgba(255,255,255,0.05)'}">TODAS</a>
  ${categoriaTabs}
</div>
<form method="GET" action="/admin/fotos" style="margin:15px 0;display:flex;gap:10px">
  <input type="hidden" name="senha" value="${senha}">
  ${filtroCat ? `<input type="hidden" name="cat" value="${filtroCat}">` : ""}
  <input name="numero" placeholder="Filtrar por numero" value="${filtroNumero}">
  <button type="submit">Filtrar</button>
  ${filtroNumero ? `<a href="/admin/fotos?senha=${senha}${filtroCat?'&cat='+filtroCat:''}" style="align-self:center">Limpar</a>` : ""}
</form>
${fotos.length === 0 ? '<p style="opacity:0.6;text-align:center;padding:40px">Nenhuma foto ainda. Cron rodara as 04h ou manualmente: <code>docker exec assistente-virtual node /app/scripts/organizar-fotos.js</code></p>' : `<div class="grid">${cards}</div>`}
</body></html>`);
});

router.get("/fotos/img/:arquivo", autenticar, (req, res) => {
  let arquivo = decodeURIComponent(req.params.arquivo).replace(/\.\.+/g, "");
  if (!arquivo.startsWith("data/fotos-pacientes/")) return res.status(403).send("Forbidden");
  const p = path.join(__dirname, arquivo);
  if (!fs.existsSync(p)) return res.status(404).send("Nao encontrada");
  res.sendFile(p);
});

router.get("/fotos/relatorio.json", autenticar, (req, res) => {
  const rel = lerRelatorio();
  if (!rel) return res.status(404).json({ erro: "relatorio ainda nao gerado" });
  res.json(rel);
});

router.post("/fotos/rodar-agora", autenticar, (req, res) => {
  const { spawn } = require("child_process");
  const child = spawn("node", [path.join(__dirname, "scripts/organizar-fotos.js")], { detached: true, stdio: "ignore" });
  child.unref();
  res.json({ ok: true, mensagem: "organizar-fotos rodando em background. Veja logs do container." });
});

module.exports = router;
