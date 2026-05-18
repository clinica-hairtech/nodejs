// EDU pro-ativo: busca novidades PubMed sobre tricologia/transplante capilar
// na ultima semana, resume via IA, envia Telegram ao Dr. Roda segunda 8h BRT.

const axios = require("axios");

const QUERIES = [
  "(hair transplant) AND (FUE OR follicular unit extraction)",
  "alopecia AND (treatment OR therapy)",
  "minoxidil OR finasteride OR dutasteride",
  "PRP AND (alopecia OR hair)",
  "trichology",
];
const MAX_RESULTADOS = parseInt(process.env.PROACTIVE_EDU_MAX || "8", 10);

async function buscarPubmed(query) {
  const dateFilter = " AND (\"last 7 days\"[edat])";
  const r = await axios.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", {
    params: { db: "pubmed", term: query + dateFilter, retmax: 5, sort: "relevance", retmode: "json" },
    timeout: 15000,
  });
  const ids = (r.data && r.data.esearchresult && r.data.esearchresult.idlist) || [];
  if (ids.length === 0) return [];
  const r2 = await axios.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi", {
    params: { db: "pubmed", id: ids.join(","), retmode: "json" },
    timeout: 15000,
  });
  const result = r2.data && r2.data.result;
  if (!result) return [];
  return ids.map(id => {
    const item = result[id];
    if (!item) return null;
    return {
      id, titulo: item.title, fonte: item.fulljournalname || item.source,
      data: item.pubdate, autores: (item.authors || []).slice(0, 3).map(a => a.name).join(", "),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    };
  }).filter(Boolean);
}

async function chamarOllama(prompt) {
  const url = (process.env.OLLAMA_BASE_URL || "http://ollama:11434") + "/api/chat";
  const r = await axios.post(url, {
    model: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct",
    messages: [{ role: "user", content: prompt }],
    stream: false,
    options: { temperature: 0.5, num_predict: 400 },
  }, { timeout: 60000 });
  return r.data.message.content;
}

async function chamarGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("sem gemini");
  const base = process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
  const r = await axios.post(`${base}/chat/completions`, {
    model: "gemini-2.5-flash",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 500, temperature: 0.5,
  }, { headers: { Authorization: `Bearer ${key}` }, timeout: 25000 });
  return r.data.choices[0].message.content;
}

async function resumir(artigos) {
  const lista = artigos.map((a, i) => `${i+1}. "${a.titulo}" - ${a.fonte} (${a.data}). ${a.autores}. ${a.url}`).join("\n");
  const prompt = `Voce e medico tricologista lendo PubMed semanalmente. Abaixo, ${artigos.length} artigos publicados na ultima semana sobre alopecia/transplante capilar:

${lista}

Faca um resumo executivo em portugues brasileiro pra colega medico, em 4-6 bullets, destacando:
- Achados praticos que mudam conduta
- Limitacoes (n pequeno, modelo animal, etc)
- O que ainda precisa de mais evidencia

Tom: cientifico, conciso. Maximo 250 palavras. NAO traduza os titulos. No final, liste os links.`;
  try { return await chamarOllama(prompt); }
  catch (_) { return await chamarGemini(prompt); }
}

async function main() {
  const todos = [];
  for (const q of QUERIES) {
    try {
      const lista = await buscarPubmed(q);
      todos.push(...lista);
    } catch (e) {
      console.warn("[proactive-edu] falha em query", q, e.message);
    }
  }
  const unicos = [];
  const vistos = new Set();
  for (const a of todos) {
    if (!vistos.has(a.id)) { vistos.add(a.id); unicos.push(a); }
  }
  const top = unicos.slice(0, MAX_RESULTADOS);
  console.log(`[proactive-edu] ${top.length} artigos unicos da semana`);
  if (top.length === 0) return;

  let resumo;
  try { resumo = await resumir(top); }
  catch (e) { console.error("[proactive-edu] resumo falhou:", e.message); return; }

  const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
  const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
  const msg = "*HairTech EDU semanal*\n_PubMed - ultimos 7 dias_\n\n" + resumo;
  await axios.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    chat_id: tgChat, text: msg.slice(0, 4000), parse_mode: "Markdown", disable_web_page_preview: true,
  }, { timeout: 8000 }).catch(e => console.error("telegram:", e.message));

  console.log("[proactive-edu] resumo enviado");
}

main().catch(e => { console.error("[proactive-edu] erro fatal:", e); process.exit(1); });
