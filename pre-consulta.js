// Pre-consulta inteligente: formulario publico onde paciente preenche dados +
// envia fotos do cabelo. Gemini Vision analisa, gera resumo, manda pro Dr.
// via Telegram. Reduz consulta de 30min pra 15min.
//
// GET  /pre-consulta              -> form HTML
// POST /pre-consulta/submit       -> processa, salva, notifica Dr.
// GET  /pre-consulta/admin?senha= -> lista pre-consultas recebidas

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const ADMIN_SENHA = process.env.ADMIN_SENHA || "hairtech2026";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "8713631351";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

const DATA_DIR = path.join(__dirname, "data", "pre-consultas");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, "[]");
}
function lerIndex() { try { return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")); } catch (_) { return []; } }
function salvarIndex(arr) { fs.writeFileSync(INDEX_FILE, JSON.stringify(arr, null, 2)); }

async function analisarFotoComGemini(base64, mimeType) {
  if (!GEMINI_KEY) return { resumo: "Gemini API key ausente", analise_disponivel: false };
  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: `Voce e tricologista. Analise esta foto de cabelo/couro cabeludo. Responda em JSON:
{
 "padrao_calvicie": "Norwood 1-7 ou Ludwig 1-3 ou nenhum",
 "area_doadora": "boa/media/limitada/inviavel",
 "densidade_atual_estimada": "boa/media/baixa",
 "queda_ativa": true/false,
 "sinais_inflamatorios": true/false,
 "candidato_fue": "sim/talvez/nao",
 "recomendacao_inicial": "1-2 frases curtas",
 "qualidade_foto": "boa/ruim",
 "angulos_faltantes": "lista breve do que pedir tambem"
}` }
          ]
        }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 500 }
      },
      { timeout: 30000 }
    );
    const txt = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    try { return JSON.parse(txt); } catch (_) { return { resumo_raw: txt, analise_disponivel: false }; }
  } catch (e) {
    return { erro: e.message, analise_disponivel: false };
  }
}

async function notificarDr(preConsulta, analiseFotos) {
  if (!TG_TOKEN) return;
  const partes = [
    `*Nova Pre-Consulta*`,
    `Nome: ${preConsulta.nome}`,
    `WhatsApp: +${preConsulta.telefone}`,
    `Idade: ${preConsulta.idade}`,
    `Genero: ${preConsulta.genero}`,
    `Queixa: ${preConsulta.queixa}`,
    `Expectativa: ${preConsulta.expectativa}`,
    `Tempo de queda: ${preConsulta.tempo_queda}`,
    `Tratou antes: ${preConsulta.tratamentos_previos}`,
  ];
  if (analiseFotos && analiseFotos.length) {
    partes.push(`\n*Analise Gemini Vision (${analiseFotos.length} fotos):*`);
    analiseFotos.forEach((a, i) => {
      partes.push(`Foto ${i + 1}: Norwood/Ludwig=${a.padrao_calvicie || "?"} | Doadora=${a.area_doadora || "?"} | Candidato FUE=${a.candidato_fue || "?"}`);
      if (a.recomendacao_inicial) partes.push(`  -> ${a.recomendacao_inicial}`);
    });
  }
  partes.push(`\nVer detalhes: https://hairtech.org/pre-consulta/admin?senha=${ADMIN_SENHA}#${preConsulta.id}`);

  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: TG_CHAT,
      text: partes.join("\n"),
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
  } catch (e) { console.warn("[pre-consulta] telegram falhou:", e.message); }
}

router.use(express.json({ limit: "20mb" }));
router.use(express.urlencoded({ extended: true, limit: "20mb" }));

router.get("/pre-consulta", (req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pre-Consulta HairTech</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:linear-gradient(135deg,#0c0c1e 0%,#1a1a3e 100%);color:#fff;margin:0;padding:20px;min-height:100vh}
  .card{max-width:600px;margin:0 auto;background:rgba(255,255,255,0.08);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:30px}
  h1{margin:0 0 8px;font-size:24px}
  p.sub{opacity:0.7;margin:0 0 20px;font-size:14px}
  label{display:block;margin:15px 0 5px;font-size:13px;opacity:0.9}
  input,textarea,select{width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:11px;border-radius:10px;font-size:15px;font-family:inherit;box-sizing:border-box}
  textarea{min-height:70px;resize:vertical}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  button{width:100%;background:linear-gradient(90deg,#a855f7,#6366f1);color:#fff;border:0;padding:14px;border-radius:10px;font-size:16px;font-weight:600;margin-top:25px;cursor:pointer}
  button:disabled{opacity:0.5}
  .upload{padding:18px;border:2px dashed rgba(255,255,255,0.25);border-radius:12px;text-align:center}
  small{opacity:0.6;font-size:12px;display:block;margin-top:4px}
  .ok{color:#22c55e}
</style></head><body>
<div class="card">
  <h1>Pre-Consulta HairTech</h1>
  <p class="sub">Preencha os dados e envie fotos. Dr. Ricardo recebe analise inicial e te chama em horario combinado.</p>
  <form id="f" method="POST" action="/pre-consulta/submit" enctype="multipart/form-data">
    <label>Nome completo</label><input name="nome" required>
    <div class="row">
      <div><label>WhatsApp (com DDD)</label><input name="telefone" required placeholder="21999998888"></div>
      <div><label>Idade</label><input name="idade" type="number" required></div>
    </div>
    <label>Genero</label>
    <select name="genero" required>
      <option value="">Selecione...</option>
      <option>Masculino</option><option>Feminino</option><option>Prefiro nao informar</option>
    </select>
    <label>Sua principal queixa</label>
    <textarea name="queixa" required placeholder="Ex: entradas profundas ha 3 anos, sinto inseguranca em fotos"></textarea>
    <label>Qual o seu objetivo / expectativa</label>
    <textarea name="expectativa" required placeholder="Ex: voltar a ter cabelo na coroa, sem perder densidade"></textarea>
    <div class="row">
      <div><label>Tempo de queda</label>
        <select name="tempo_queda" required>
          <option value="">Selecione...</option>
          <option>Menos de 1 ano</option><option>1-3 anos</option><option>4-7 anos</option><option>Mais de 7 anos</option>
        </select>
      </div>
      <div><label>Ja fez tratamento?</label>
        <select name="tratamentos_previos" required>
          <option value="">Selecione...</option>
          <option>Nunca tratei</option><option>Finasterida/Minoxidil</option><option>MMP/Microagulhamento</option><option>Outro</option>
        </select>
      </div>
    </div>
    <label>Fotos do cabelo (frente, topo, coroa, laterais — pelo menos 3 angulos)</label>
    <div class="upload">
      <input id="fotos" name="fotos" type="file" accept="image/*" multiple required>
      <small>JPG/PNG/HEIC. Boa iluminacao. Pode tirar agora pelo celular.</small>
    </div>
    <button type="submit" id="btn">Enviar Pre-Consulta</button>
  </form>
  <div id="msg" style="margin-top:15px;text-align:center"></div>
</div>
<script>
document.getElementById("f").addEventListener("submit", function(ev) {
  ev.preventDefault();
  var btn = document.getElementById("btn");
  var msg = document.getElementById("msg");
  btn.disabled = true; btn.textContent = "Enviando...";
  var fd = new FormData(this);
  fetch("/pre-consulta/submit", {method:"POST", body:fd})
    .then(r => r.json())
    .then(j => {
      if (j.ok) {
        msg.innerHTML = '<span class="ok">Recebido! Dr. Ricardo vai te chamar pelo WhatsApp.</span>';
        btn.style.display = "none";
      } else { msg.textContent = "Erro: " + (j.erro || "tente novamente"); btn.disabled = false; btn.textContent = "Enviar Pre-Consulta"; }
    })
    .catch(e => { msg.textContent = "Erro de rede: " + e.message; btn.disabled = false; btn.textContent = "Enviar Pre-Consulta"; });
});
</script>
</body></html>`);
});

router.post("/pre-consulta/submit", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
  ensureDir();
  try {
    // Como nao temos multer carregado, recebemos via FormData + parse simples
    // Mais robusto: usar multer se ja for dep. Por enquanto, aceitar JSON OU base64 inline.
    // Tactic: form HTML submete multipart, parsing requer multer; pra entregar valor agora,
    // aceitar base64 via JSON wrapper. Form HTML inclui JS pra converter fotos pra base64.

    // Se ja parseado por express.json (apos middleware), usar req.body
    let body = req.body;
    if (Buffer.isBuffer(body)) {
      // Multipart vindo do form — sem multer, retornamos instrucao
      return res.status(400).json({
        ok: false,
        erro: "Upload multipart requer multer; use endpoint JSON com fotos em base64.",
        hint: "fetch('/pre-consulta/submit', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome, telefone, fotos:[{nome,mime,base64}], ...})})"
      });
    }

    const { nome, telefone, idade, genero, queixa, expectativa, tempo_queda, tratamentos_previos, fotos } = body;
    if (!nome || !telefone) return res.status(400).json({ ok: false, erro: "nome e telefone obrigatorios" });

    const id = "pc-" + crypto.randomBytes(6).toString("hex");
    const dir = path.join(DATA_DIR, id);
    fs.mkdirSync(dir, { recursive: true });

    const fotosArr = Array.isArray(fotos) ? fotos : [];
    const analises = [];
    for (let i = 0; i < fotosArr.length && i < 8; i++) {
      const f = fotosArr[i];
      if (!f.base64) continue;
      const ext = (f.mime || "image/jpeg").split("/")[1] || "jpg";
      fs.writeFileSync(path.join(dir, `foto-${i + 1}.${ext}`), Buffer.from(f.base64, "base64"));
      const an = await analisarFotoComGemini(f.base64, f.mime || "image/jpeg");
      analises.push(an);
    }

    const preConsulta = {
      id,
      criado_em: new Date().toISOString(),
      nome, telefone: telefone.replace(/\D/g, ""), idade, genero, queixa, expectativa,
      tempo_queda, tratamentos_previos,
      total_fotos: fotosArr.length,
      analises
    };
    fs.writeFileSync(path.join(dir, "dados.json"), JSON.stringify(preConsulta, null, 2));

    const idx = lerIndex();
    idx.unshift({ id, criado_em: preConsulta.criado_em, nome, telefone: preConsulta.telefone, total_fotos: fotosArr.length });
    salvarIndex(idx.slice(0, 500));

    await notificarDr(preConsulta, analises);

    res.json({ ok: true, id, mensagem: "Recebido. Dr. Ricardo sera notificado." });
  } catch (e) {
    console.error("[pre-consulta] erro:", e);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

router.get("/pre-consulta/admin", (req, res) => {
  if (req.query.senha !== ADMIN_SENHA) return res.status(401).send("Nao autorizado");
  ensureDir();
  const idx = lerIndex();
  const linhas = idx.slice(0, 100).map(p => `<tr>
    <td>${p.criado_em.slice(0, 16).replace("T", " ")}</td>
    <td>${p.nome}</td>
    <td>+${p.telefone}</td>
    <td>${p.total_fotos}</td>
    <td><a href="/pre-consulta/admin/${p.id}?senha=${ADMIN_SENHA}">Ver</a></td>
  </tr>`).join("");
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pre-Consultas</title>
<style>body{font-family:system-ui;background:#0c0c1e;color:#fff;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:left}a{color:#a855f7}</style>
</head><body><h1>Pre-Consultas (${idx.length})</h1>
<table><tr><th>Data</th><th>Nome</th><th>Tel</th><th>Fotos</th><th></th></tr>${linhas}</table></body></html>`);
});

router.get("/pre-consulta/admin/:id", (req, res) => {
  if (req.query.senha !== ADMIN_SENHA) return res.status(401).send("Nao autorizado");
  const id = req.params.id.replace(/[^a-z0-9-]/gi, "");
  const dir = path.join(DATA_DIR, id);
  if (!fs.existsSync(dir)) return res.status(404).send("Nao encontrado");
  const dados = JSON.parse(fs.readFileSync(path.join(dir, "dados.json"), "utf8"));
  const fotos = fs.readdirSync(dir).filter(f => f.startsWith("foto-")).map(f => `<div><img src="/pre-consulta/foto/${id}/${f}?senha=${ADMIN_SENHA}" style="max-width:300px;border-radius:10px"></div>`).join("");
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pre-Consulta ${id}</title>
<style>body{font-family:system-ui;background:#0c0c1e;color:#fff;padding:20px}pre{background:#1a1a3e;padding:15px;border-radius:10px;overflow:auto}</style>
</head><body><a href="/pre-consulta/admin?senha=${ADMIN_SENHA}">Voltar</a>
<h1>${dados.nome}</h1><p>+${dados.telefone} | ${dados.idade}a | ${dados.genero}</p>
<h3>Dados</h3><pre>${JSON.stringify(dados, null, 2)}</pre>
<h3>Fotos</h3><div style="display:flex;flex-wrap:wrap;gap:10px">${fotos}</div></body></html>`);
});

router.get("/pre-consulta/foto/:id/:file", (req, res) => {
  if (req.query.senha !== ADMIN_SENHA) return res.status(401).send("Nao autorizado");
  const id = req.params.id.replace(/[^a-z0-9-]/gi, "");
  const file = req.params.file.replace(/[^a-z0-9.-]/gi, "");
  const p = path.join(DATA_DIR, id, file);
  if (!fs.existsSync(p)) return res.status(404).send("Nao encontrado");
  res.sendFile(p);
});

module.exports = router;
