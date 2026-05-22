// organizar-fotos.js — roda na VPS (cron 04h diario + sob demanda)
// Varre conversas no Postgres, identifica msgs com imagens, baixa via Cloud API
// se URL ainda valida, classifica via Gemini Vision em 5 categorias, salva em
// data/fotos-pacientes/{categoria}/{numero}/{timestamp}.jpg, indexa em JSON.
//
// Categorias: FOTO_CABELO, COMPROVANTE, PRINT_TELEFONE, DOCUMENTO, OUTRO
//
// Rodar manual: docker exec assistente-virtual node /app/scripts/organizar-fotos.js
// Cron: 0 7 * * * (= 04h BRT)

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Pool } = require("pg");
const axios = require("axios");

const DATABASE_URL = process.env.DATABASE_URL;
const WA_TOKEN = process.env.WA_TOKEN || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "8713631351";

const REPO_ROOT = path.resolve(__dirname, "..");
const FOTOS_DIR = path.join(REPO_ROOT, "data", "fotos-pacientes");
const INDEX_FILE = path.join(FOTOS_DIR, "_index.json");
const RELATORIO_FILE = path.join(FOTOS_DIR, "_relatorio.json");

const CATEGORIAS = ["FOTO_CABELO", "COMPROVANTE", "PRINT_TELEFONE", "DOCUMENTO", "OUTRO"];

if (!DATABASE_URL) { console.error("[organizar-fotos] DATABASE_URL ausente"); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL, ssl: false });

function ensureDirs() {
  fs.mkdirSync(FOTOS_DIR, { recursive: true });
  for (const c of CATEGORIAS) fs.mkdirSync(path.join(FOTOS_DIR, c), { recursive: true });
}

function lerIndex() { try { return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")); } catch (_) { return { fotos: [], processadas_ids: [] }; } }
function salvarIndex(idx) { fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2)); }

// Baixa media via Cloud API (se imageId for valido) ou direto via URL
async function baixarMedia(referencia) {
  if (!referencia) return null;
  // Se for URL http(s) direta (raro: WhatsApp expira em 5min)
  if (/^https?:\/\//.test(referencia)) {
    try {
      const r = await axios.get(referencia, { responseType: "arraybuffer", timeout: 15000 });
      return { buffer: Buffer.from(r.data), mime: r.headers["content-type"] || "image/jpeg" };
    } catch (_) { return null; }
  }
  // Cloud API mediaId
  if (!WA_TOKEN) return null;
  try {
    const meta = await axios.get(`https://graph.facebook.com/v17.0/${referencia}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` }, timeout: 10000
    });
    const url = meta.data?.url;
    if (!url) return null;
    const r = await axios.get(url, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
      responseType: "arraybuffer", timeout: 15000
    });
    return { buffer: Buffer.from(r.data), mime: meta.data.mime_type || "image/jpeg" };
  } catch (e) {
    return null;
  }
}

async function classificarVision(buffer, mime) {
  const base64 = buffer.toString("base64");
  const promptTexto = `Voce e classificador de imagens da clinica HairTech. Responda APENAS uma palavra:
- FOTO_CABELO: foto de cabelo/couro cabeludo/calvicie/queda
- COMPROVANTE: comprovante Pix, TED, boleto pago, recibo financeiro
- PRINT_TELEFONE: screenshot de celular/WhatsApp/SMS/notificacao (incluindo cobrancas)
- DOCUMENTO: RG, CPF, CNH, contrato, NF, alvara, certidao, papel oficial
- OUTRO: qualquer outra coisa`;

  // Tenta Gemini primeiro (mais barato)
  if (GEMINI_KEY) {
    try {
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          contents: [{ parts: [
            { inline_data: { mime_type: mime, data: base64 } },
            { text: promptTexto }
          ]}],
          generationConfig: { maxOutputTokens: 30, temperature: 0 }
        },
        { timeout: 20000 }
      );
      const t = (r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "").toUpperCase();
      for (const c of CATEGORIAS) if (t.includes(c)) return c;
    } catch (e) { console.warn("[organizar-fotos] Gemini falhou:", e.message); }
  }
  // Fallback OpenAI Vision
  if (OPENAI_KEY) {
    try {
      const r = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-4o-mini",
        max_tokens: 20,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            { type: "text", text: promptTexto }
          ]
        }]
      }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 20000 });
      const t = (r.data?.choices?.[0]?.message?.content || "").toUpperCase();
      for (const c of CATEGORIAS) if (t.includes(c)) return c;
    } catch (e) { console.warn("[organizar-fotos] OpenAI falhou:", e.message); }
  }
  return "OUTRO";
}

function extrairImagensDoHistorico(historico) {
  if (!Array.isArray(historico)) return [];
  const refs = [];
  for (let i = 0; i < historico.length; i++) {
    const m = historico[i];
    if (!m || typeof m !== "object") continue;
    // Padrao 1: campo dedicado
    if (m.image_id) refs.push({ tipo: "image_id", valor: m.image_id, idx: i, ts: m.ts });
    if (m.media_id) refs.push({ tipo: "image_id", valor: m.media_id, idx: i, ts: m.ts });
    if (m.media_url) refs.push({ tipo: "url", valor: m.media_url, idx: i, ts: m.ts });
    // Padrao 2: detectar mediaId em content
    const content = typeof m.content === "string" ? m.content : "";
    const matchId = content.match(/\bmediaId[:\s=]+([0-9]{8,})/i);
    if (matchId) refs.push({ tipo: "image_id", valor: matchId[1], idx: i, ts: m.ts });
    const matchUrl = content.match(/(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp|heic))/i);
    if (matchUrl) refs.push({ tipo: "url", valor: matchUrl[1], idx: i, ts: m.ts });
  }
  return refs;
}

async function processarConversas(limitePorRodada = 200) {
  ensureDirs();
  const idx = lerIndex();
  const jaProcessadas = new Set(idx.processadas_ids || []);

  console.log(`[organizar-fotos] index atual: ${idx.fotos.length} fotos, ${jaProcessadas.size} refs processadas`);

  let r;
  try {
    r = await pool.query(`
      SELECT numero, nome, historico, updated_at
      FROM conversations
      WHERE historico IS NOT NULL AND jsonb_array_length(historico) > 0
      ORDER BY updated_at DESC NULLS LAST
      LIMIT $1
    `, [limitePorRodada]);
  } catch (e) {
    // fallback se schema diferente
    try {
      r = await pool.query(`
        SELECT numero, nome, historico, criado_em AS updated_at
        FROM conversas
        WHERE historico IS NOT NULL
        ORDER BY criado_em DESC NULLS LAST
        LIMIT $1
      `, [limitePorRodada]);
    } catch (e2) {
      console.error("[organizar-fotos] sem tabela conversations/conversas:", e2.message);
      await pool.end();
      return;
    }
  }

  const novasFotos = [];
  let processadas = 0, baixadas = 0, classificadas = 0, falhas = 0;

  for (const row of r.rows) {
    const refs = extrairImagensDoHistorico(row.historico);
    for (const ref of refs) {
      const refKey = `${row.numero}:${ref.valor}`;
      if (jaProcessadas.has(refKey)) continue;
      processadas++;
      const media = await baixarMedia(ref.valor);
      if (!media) { jaProcessadas.add(refKey); falhas++; continue; }
      baixadas++;
      const cat = await classificarVision(media.buffer, media.mime);
      classificadas++;
      const ts = ref.ts || Date.now();
      const ext = media.mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      const nomeArquivo = `${row.numero}_${ts}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const destDir = path.join(FOTOS_DIR, cat, row.numero);
      fs.mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, nomeArquivo);
      fs.writeFileSync(destPath, media.buffer);
      const fotoMeta = {
        numero: row.numero,
        nome: row.nome,
        categoria: cat,
        ref: ref.valor,
        ts,
        arquivo: path.relative(REPO_ROOT, destPath),
        tamanho: media.buffer.length,
        mime: media.mime,
        processado_em: new Date().toISOString()
      };
      novasFotos.push(fotoMeta);
      jaProcessadas.add(refKey);
      console.log(`[organizar-fotos] +${cat} ${row.numero} (${row.nome || "?"}) -> ${destPath}`);
    }
  }

  idx.fotos = [...idx.fotos, ...novasFotos];
  idx.processadas_ids = Array.from(jaProcessadas);
  idx.ultima_rodada = new Date().toISOString();
  salvarIndex(idx);

  // Relatorio agregado por paciente
  const porPaciente = {};
  for (const f of idx.fotos) {
    if (!porPaciente[f.numero]) porPaciente[f.numero] = { nome: f.nome, total: 0, por_categoria: {} };
    porPaciente[f.numero].total++;
    porPaciente[f.numero].por_categoria[f.categoria] = (porPaciente[f.numero].por_categoria[f.categoria] || 0) + 1;
  }
  const porCategoria = {};
  for (const f of idx.fotos) porCategoria[f.categoria] = (porCategoria[f.categoria] || 0) + 1;

  const relatorio = {
    gerado_em: new Date().toISOString(),
    total_fotos: idx.fotos.length,
    novas_nesta_rodada: novasFotos.length,
    referencias_processadas: processadas,
    baixadas, classificadas, falhas,
    por_categoria: porCategoria,
    pacientes: Object.keys(porPaciente).length,
    top_pacientes: Object.entries(porPaciente)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20)
      .map(([numero, d]) => ({ numero, ...d }))
  };
  fs.writeFileSync(RELATORIO_FILE, JSON.stringify(relatorio, null, 2));

  console.log(`[organizar-fotos] rodada: ${processadas} refs, ${baixadas} baixadas, ${classificadas} classificadas, ${falhas} falhas`);

  // Telegram resumo
  if (TG_TOKEN && novasFotos.length > 0) {
    const msg = `*Organizar Fotos* (rodada ${new Date().toLocaleTimeString("pt-BR")})\n\n` +
      `Novas fotos classificadas: ${novasFotos.length}\n` +
      `Total acumulado: ${idx.fotos.length}\n\n` +
      `Por categoria:\n${Object.entries(porCategoria).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\n` +
      `Pacientes com fotos: ${Object.keys(porPaciente).length}\n\n` +
      `Ver: https://hairtech.org/admin/fotos?senha=hairtech2026`;
    try {
      await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
        { chat_id: TG_CHAT, text: msg, parse_mode: "Markdown" }, { timeout: 10000 });
    } catch (_) {}
  }

  await pool.end();
}

processarConversas().catch(e => { console.error("[organizar-fotos] erro fatal:", e); process.exit(1); });
