// POS-FUE pro-ativo: follow-up D+1/D+3/D+7/D+15/D+30 apos transplante.
// Roda diario 9h BRT. Adiciona a crm-fila.json com type='pos-fue'.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const MAX_POR_DIA = parseInt(process.env.PROACTIVE_POS_MAX || "30", 10);

if (!process.env.DATABASE_URL) {
  console.error("[proactive-pos] DATABASE_URL ausente");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const MILESTONES = [
  { dias: 1, codigo: "D1", foco: "primeiras 24h pos-cirurgia. Lembrar de NAO molhar a cabeca, dormir de barriga pra cima, tomar analgesico se dor. Tom: acolhedor, breve." },
  { dias: 3, codigo: "D3", foco: "pode comecar a lavar suavemente segundo orientacao (so agua morna + sabonete neutro nas pontas dos dedos). Perguntar se tem duvida." },
  { dias: 7, codigo: "D7", foco: "uma semana. Crostas comecam a sair sozinhas. Reforcar: nao cocar, nao esfregar. Pedir foto se possivel." },
  { dias: 15, codigo: "D15", foco: "comeca o shock loss (queda dos fios transplantados) - tranquilizar que e NORMAL e esperado. Os foliculos seguem vivos, vao brotar de novo." },
  { dias: 30, codigo: "D30", foco: "1 mes! Convidar pra foto de controle. Reforcar que resultado real aparece a partir de 4-6 meses." },
];

async function chamarOllama(systemPrompt, userPrompt) {
  const url = (process.env.OLLAMA_BASE_URL || "http://ollama:11434") + "/api/chat";
  const r = await axios.post(url, {
    model: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    options: { temperature: 0.6, num_predict: 220 },
  }, { timeout: 45000 });
  return r.data.message.content;
}

async function chamarGemini(systemPrompt, userPrompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY ausente");
  const base = process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
  const r = await axios.post(`${base}/chat/completions`, {
    model: "gemini-2.5-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 250,
    temperature: 0.6,
  }, { headers: { Authorization: `Bearer ${key}` }, timeout: 25000 });
  return r.data.choices[0].message.content;
}

async function gerarMensagem(paciente, milestone) {
  const sys = `Voce e atendente da Clinica HairTech, falando com paciente que fez transplante capilar FUE recentemente.
Tom: caloroso, profissional, claro. Portugues brasileiro natural.
Sempre se referir ao paciente pelo nome se conhecido.
NUNCA prometer resultados especificos. NUNCA dar dose de medicamento que nao foi prescrito.
Em qualquer sinal de complicacao (dor forte, febre, secrecao com pus), instruir a procurar a clinica imediatamente.`;

  const user = `Paciente: ${paciente.nome || "[sem nome]"}.
Dia pos-operatorio: ${milestone.dias} dia(s) (codigo ${milestone.codigo}).
Foco desta mensagem: ${milestone.foco}

Escreva 2-3 frases curtas (max 60 palavras) de follow-up. Comece direto sem se apresentar. Termine com pergunta aberta convidando o paciente a responder.`;

  try { return await chamarOllama(sys, user); }
  catch (e) {
    console.warn("[proactive-pos] ollama falhou:", e.message);
    return await chamarGemini(sys, user);
  }
}

async function main() {
  const res = await pool.query(`
    SELECT a.id, a.wa_id, a.tipo, a.data_hora, a.metadata,
           c.nome, c.status as conv_status
    FROM agendamentos a
    LEFT JOIN conversations c ON c.numero = a.wa_id
    WHERE (a.tipo ILIKE '%FUE%' OR a.tipo ILIKE '%transplante%')
      AND a.status = 'realizada'
      AND a.data_hora > NOW() - INTERVAL '35 days'
      AND a.data_hora < NOW()
    ORDER BY a.data_hora DESC
    LIMIT $1
  `, [MAX_POR_DIA]);

  console.log(`[proactive-pos] candidatos pos-FUE: ${res.rows.length}`);

  const filaPath = path.join(__dirname, "..", "crm-fila.json");
  let fila = [];
  try { fila = JSON.parse(fs.readFileSync(filaPath, "utf8")); if (!Array.isArray(fila)) fila = []; } catch (_) {}

  let novos = 0;
  for (const a of res.rows) {
    const dataProc = new Date(a.data_hora);
    const dias = Math.floor((Date.now() - dataProc.getTime()) / 86400000);
    const meta = a.metadata || {};
    const enviados = Array.isArray(meta.followups_enviados) ? meta.followups_enviados : [];

    // Encontra milestone que se aplica hoje (com tolerancia +/-0)
    const milestone = MILESTONES.find(m => m.dias === dias && !enviados.includes(m.codigo));
    if (!milestone) continue;

    // Verifica se ja ha pendente na fila pra esse numero+milestone
    const dup = fila.find(p => p.numero === a.wa_id && p.tipo === "pos-fue" && p.milestone === milestone.codigo && p.status === "pendente");
    if (dup) continue;

    try {
      const msg = await gerarMensagem({ nome: a.nome }, milestone);
      fila.push({
        id: crypto.randomBytes(6).toString("hex"),
        tipo: "pos-fue",
        milestone: milestone.codigo,
        agendamento_id: a.id,
        numero: a.wa_id,
        nome: a.nome || "(sem nome)",
        data_procedimento: dataProc.toISOString(),
        dias_pos_op: dias,
        mensagem_sugerida: (msg || "").trim(),
        criado_em: new Date().toISOString(),
        status: "pendente",
      });
      novos++;

      // Marca no metadata (otimista; doctor ainda pode rejeitar)
      enviados.push(milestone.codigo);
      meta.followups_enviados = enviados;
      await pool.query("UPDATE agendamentos SET metadata=$1, updated_at=NOW() WHERE id=$2", [meta, a.id]).catch(()=>{});
    } catch (e) {
      console.warn("[proactive-pos] falha gerando msg pra", a.wa_id, e.message);
    }
  }

  fs.writeFileSync(filaPath, JSON.stringify(fila.slice(-100), null, 2));
  console.log(`[proactive-pos] ${novos} novos follow-ups enfileirados`);

  if (novos > 0) {
    const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
    const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
    const text = `HairTech pos-FUE: ${novos} follow-ups prontos pra revisar. Aprovar em https://hairtech.org/admin/aprovar-fila`;
    await axios.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, { chat_id: tgChat, text }, { timeout: 5000 }).catch(() => {});
  }

  await pool.end();
}

main().catch(e => { console.error("[proactive-pos] erro fatal:", e); process.exit(1); });
