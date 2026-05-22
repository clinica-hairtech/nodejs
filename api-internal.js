// API interna REST consumida pelo OpenClaw (orquestrador).
// Autenticada via Bearer token em INTERNAL_API_TOKEN.
// Todos os endpoints retornam JSON.

const express = require("express");
const router = express.Router();
const { pool } = require("./db");
const db = require("./db");

const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN || "";

function auth(req, res, next) {
  if (!INTERNAL_TOKEN) {
    return res.status(503).json({
      erro: "INTERNAL_API_TOKEN nao configurado no .env do AV",
      hint: "Adicione INTERNAL_API_TOKEN=... no .env e reinicie o container"
    });
  }
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : (req.query.token || "");
  if (token !== INTERNAL_TOKEN) {
    return res.status(401).json({ erro: "Token invalido" });
  }
  next();
}

router.use(express.json({ limit: "1mb" }));
router.use(auth);

function compressHistorico(h, max = 8) {
  if (!Array.isArray(h)) return [];
  const tail = h.slice(-max);
  return tail.map(m => ({
    role: m.role,
    content: (m.content || "").slice(0, 500),
    ts: m.ts || null
  }));
}

function resumirConversa(c) {
  const h = Array.isArray(c.historico) ? c.historico : [];
  const ultimaUser = [...h].reverse().find(m => m.role === "user")?.content || null;
  const primeiraUser = h.find(m => m.role === "user")?.content || null;
  return {
    numero: c.numero,
    nome: c.nome || null,
    temperatura: c.temperatura || "frio",
    status: c.status || "ativo",
    tipo: c.tipo || "novo",
    tags: c.tags || "",
    valor: Number(c.valor) || 0,
    origem: c.origem || "whatsapp",
    total_mensagens: h.length,
    primeira_mensagem_paciente: primeiraUser ? primeiraUser.slice(0, 300) : null,
    ultima_mensagem_paciente: ultimaUser ? ultimaUser.slice(0, 300) : null,
    ultima_atividade: c.ultima_atividade ? new Date(Number(c.ultima_atividade)).toISOString() : null,
    aguardando_resposta_bot: !!(h.length && h[h.length - 1].role === "user")
  };
}

// ============================================================
// GET /api/internal/ping
// ============================================================
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    service: "hairtech-av-internal",
    time: new Date().toISOString()
  });
});

// ============================================================
// GET /api/internal/metricas
// Resumo geral para o agente orquestrador
// ============================================================
router.get("/metricas", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE temperatura='quente') AS quentes,
        COUNT(*) FILTER (WHERE temperatura='morno') AS mornos,
        COUNT(*) FILTER (WHERE temperatura='frio') AS frios,
        COUNT(*) FILTER (WHERE status='humano') AS humano,
        COUNT(*) FILTER (WHERE status='pausado') AS pausado,
        COUNT(*) FILTER (WHERE tipo='transplante') AS transplante,
        COUNT(*) FILTER (WHERE tipo='antigo') AS retornos,
        COUNT(*) FILTER (WHERE ultima_atividade > extract(epoch from now() - interval '24 hours')*1000) AS ativos_24h,
        COUNT(*) FILTER (WHERE ultima_atividade > extract(epoch from now() - interval '7 days')*1000) AS ativos_7d,
        COUNT(*) FILTER (
          WHERE historico::text LIKE '%"role":"user"%'
          AND NOT (historico::text LIKE '%"role":"assistant"%')
        ) AS sem_resposta_bot
      FROM conversations
    `);
    const m = r.rows[0] || {};
    res.json({
      ok: true,
      gerado_em: new Date().toISOString(),
      total: Number(m.total) || 0,
      quentes: Number(m.quentes) || 0,
      mornos: Number(m.mornos) || 0,
      frios: Number(m.frios) || 0,
      humano: Number(m.humano) || 0,
      pausado: Number(m.pausado) || 0,
      transplante: Number(m.transplante) || 0,
      retornos: Number(m.retornos) || 0,
      ativos_24h: Number(m.ativos_24h) || 0,
      ativos_7d: Number(m.ativos_7d) || 0,
      sem_resposta_bot: Number(m.sem_resposta_bot) || 0
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ============================================================
// GET /api/internal/leads
// query: temperatura, status, sem_resposta, limite, desde_horas
// ============================================================
router.get("/leads", async (req, res) => {
  try {
    const temperatura = req.query.temperatura || null;
    const status = req.query.status || null;
    const semResposta = req.query.sem_resposta === "true";
    const limite = Math.min(parseInt(req.query.limite, 10) || 50, 500);
    const desdeHoras = parseInt(req.query.desde_horas, 10) || null;

    const where = ["1=1"];
    const params = [];

    if (temperatura) {
      params.push(temperatura);
      where.push(`temperatura = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (semResposta) {
      where.push(`historico::text LIKE '%"role":"user"%' AND NOT (historico::text LIKE '%"role":"assistant"%')`);
    }
    if (desdeHoras) {
      params.push(desdeHoras);
      where.push(`ultima_atividade > extract(epoch from now() - interval '1 hour' * $${params.length})*1000`);
    }

    params.push(limite);
    const sql = `
      SELECT numero, nome, temperatura, status, tipo, tags, valor, origem,
             ultima_atividade, historico, created_at
      FROM conversations
      WHERE ${where.join(" AND ")}
      ORDER BY ultima_atividade DESC NULLS LAST
      LIMIT $${params.length}
    `;
    const r = await pool.query(sql, params);
    res.json({
      ok: true,
      total: r.rows.length,
      leads: r.rows.map(c => resumirConversa(c))
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ============================================================
// GET /api/internal/lead/:numero
// Detalhes completos de um contato + histórico
// ============================================================
router.get("/lead/:numero", async (req, res) => {
  const numero = (req.params.numero || "").replace(/\D/g, "");
  if (!numero) return res.status(400).json({ erro: "numero invalido" });

  try {
    const r = await pool.query(`SELECT * FROM conversations WHERE numero=$1`, [numero]);
    const c = r.rows[0];
    if (!c) return res.status(404).json({ erro: "nao encontrado" });

    let mensagens = [];
    try {
      const m = await pool.query(
        `SELECT role, content, created_at FROM mensagens WHERE numero=$1 ORDER BY created_at ASC LIMIT 1000`,
        [numero]
      );
      mensagens = m.rows;
    } catch (_) {}

    res.json({
      ok: true,
      resumo: resumirConversa(c),
      historico_compacto: compressHistorico(c.historico, 20),
      historico_completo: Array.isArray(c.historico) ? c.historico : [],
      mensagens_tabela: mensagens,
      nota: c.nota || null,
      aguardando_avaliacao: c.aguardando_avaliacao || false
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ============================================================
// POST /api/internal/lead/:numero/anotar
// body: { nota?, tags?, status?, temperatura? }
// ============================================================
router.post("/lead/:numero/anotar", async (req, res) => {
  const numero = (req.params.numero || "").replace(/\D/g, "");
  if (!numero) return res.status(400).json({ erro: "numero invalido" });

  const { nota, tags, status, temperatura } = req.body || {};

  try {
    const r = await pool.query(`SELECT * FROM conversations WHERE numero=$1`, [numero]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ erro: "nao encontrado" });

    const novoNota = nota !== undefined ? nota : row.nota;
    const novasTags = tags !== undefined ? tags : row.tags;
    const novoStatus = status !== undefined ? status : row.status;
    const novaTemp = temperatura !== undefined ? temperatura : row.temperatura;

    await pool.query(`
      UPDATE conversations
      SET nota=$2, tags=$3, status=$4, temperatura=$5, updated_at=NOW()
      WHERE numero=$1
    `, [numero, novoNota, novasTags, novoStatus, novaTemp]);

    res.json({
      ok: true,
      numero,
      nota: novoNota,
      tags: novasTags,
      status: novoStatus,
      temperatura: novaTemp
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ============================================================
// GET /api/internal/relatorio-completo
// Relatório rico para enviar 3x/dia para ANA
// ============================================================
router.get("/relatorio-completo", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT numero, nome, temperatura, status, tipo, tags, ultima_atividade, historico, created_at
      FROM conversations
      WHERE ultima_atividade > extract(epoch from now() - interval '7 days')*1000
      ORDER BY ultima_atividade DESC NULLS LAST
      LIMIT 200
    `);

    const todos = r.rows.map(c => {
      const h = Array.isArray(c.historico) ? c.historico : [];
      const ultimaUser = [...h].reverse().find(m => m.role === "user")?.content || null;
      const ultimaBot = [...h].reverse().find(m => m.role === "assistant")?.content || null;
      const primeiraUser = h.find(m => m.role === "user")?.content || null;
      const aguardando = h.length && h[h.length - 1].role === "user";

      return {
        numero: c.numero,
        nome: c.nome || null,
        temperatura: c.temperatura || "frio",
        status: c.status || "ativo",
        tipo: c.tipo || "novo",
        tags: c.tags || "",
        total_mensagens: h.length,
        primeira_mensagem: primeiraUser ? primeiraUser.slice(0, 200) : null,
        ultima_mensagem_paciente: ultimaUser ? ultimaUser.slice(0, 300) : null,
        ultima_resposta_bot: ultimaBot ? ultimaBot.slice(0, 300) : null,
        aguardando_resposta_bot: aguardando,
        ultima_atividade: c.ultima_atividade ? new Date(Number(c.ultima_atividade)).toISOString() : null,
        contexto_curto: compressHistorico(h, 6)
      };
    });

    const quentes = todos.filter(t => t.temperatura === "quente");
    const mornos = todos.filter(t => t.temperatura === "morno");
    const semResposta = todos.filter(t => t.aguardando_resposta_bot);

    res.json({
      ok: true,
      gerado_em: new Date().toISOString(),
      janela: "ultimos 7 dias",
      totais: {
        total: todos.length,
        quentes: quentes.length,
        mornos: mornos.length,
        sem_resposta_bot: semResposta.length
      },
      prioridade_max: semResposta.filter(t => t.temperatura === "quente"),
      prioridade_alta: quentes,
      prioridade_media: mornos,
      todos
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ============================================================
// POST /api/internal/notificar-dono
// body: { texto, urgente? }
// Envia mensagem para o Dr. Ricardo via WhatsApp (AV Cloud API)
// ============================================================
let _enviarMensagem = null;
function setEnviarMensagem(fn) { _enviarMensagem = fn; }

router.post("/notificar-dono", async (req, res) => {
  const { texto, urgente } = req.body || {};
  if (!texto) return res.status(400).json({ erro: "texto obrigatorio" });

  const dono = process.env.NOTIFY_PHONE || process.env.OWNER_PHONE;
  if (!dono) return res.status(503).json({ erro: "NOTIFY_PHONE nao configurado" });

  if (!_enviarMensagem) return res.status(503).json({ erro: "enviarMensagem nao injetado" });

  try {
    const prefixo = urgente ? "🚨 URGENTE\n\n" : "";
    await _enviarMensagem(dono, prefixo + String(texto).slice(0, 4000));
    res.json({ ok: true, para: dono });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ============================================================
// POST /api/internal/mensagem-direta
// body: { numero, texto }
// Manda mensagem para qualquer numero pela AV Cloud API
// ============================================================
router.post("/mensagem-direta", async (req, res) => {
  const { numero, texto } = req.body || {};
  const num = String(numero || "").replace(/\D/g, "");
  if (!num || !texto) return res.status(400).json({ erro: "numero e texto obrigatorios" });
  if (!_enviarMensagem) return res.status(503).json({ erro: "enviarMensagem nao injetado" });

  try {
    await _enviarMensagem(num, String(texto).slice(0, 4000));

    try {
      await db.salvarMensagem(num, "assistant", String(texto).slice(0, 5000));
    } catch (_) {}

    res.json({ ok: true, para: num });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ============================================================
// POST /api/internal/lead/:numero/pausar
// Pausa o bot para um numero (passa para humano)
// ============================================================
router.post("/lead/:numero/pausar", async (req, res) => {
  const numero = (req.params.numero || "").replace(/\D/g, "");
  if (!numero) return res.status(400).json({ erro: "numero invalido" });

  try {
    await pool.query(`
      UPDATE conversations SET status='pausado', updated_at=NOW()
      WHERE numero=$1
    `, [numero]);
    res.json({ ok: true, numero, status: "pausado" });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

router.post("/lead/:numero/retomar", async (req, res) => {
  const numero = (req.params.numero || "").replace(/\D/g, "");
  if (!numero) return res.status(400).json({ erro: "numero invalido" });

  try {
    await pool.query(`
      UPDATE conversations SET status='ativo', updated_at=NOW()
      WHERE numero=$1
    `, [numero]);
    res.json({ ok: true, numero, status: "ativo" });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Dump da caixa de entrada do AV — conversas com ULTIMA mensagem do cliente
// (sem resposta do bot/humano ainda). Pra Claude/Codex/Manus auditarem o que
// ficou "retido" sem precisar do painel /admin com login web.
//
// GET /api/internal/inbox-pendentes?limite=50
//   Retorna ate N conversas onde a ultima msg eh do role='user' e nao houve
//   resposta posterior. Ordenado pela ultima_mensagem desc.
router.get("/inbox-pendentes", async (req, res) => {
  const limite = Math.min(parseInt(req.query.limite || "50", 10), 200);
  try {
    const r = await pool.query(`
      SELECT numero, nome, status, tipo, temperatura, historico, criado_em,
             updated_at AS atualizado_em
      FROM conversations
      WHERE historico IS NOT NULL
      ORDER BY updated_at DESC NULLS LAST
      LIMIT $1
    `, [limite * 3]);

    const pendentes = [];
    for (const row of r.rows) {
      const h = row.historico;
      if (!Array.isArray(h) || h.length === 0) continue;
      const ultima = h[h.length - 1];
      if (!ultima || ultima.role !== "user") continue;
      pendentes.push({
        numero: row.numero,
        nome: row.nome,
        status: row.status,
        tipo: row.tipo,
        temperatura: row.temperatura,
        ultima_mensagem: {
          role: ultima.role,
          content: (ultima.content || "").slice(0, 1000),
          ts: ultima.ts || null
        },
        total_mensagens: h.length,
        criado_em: row.criado_em,
        atualizado_em: row.atualizado_em,
        link_admin: `https://hairtech.org/admin/conversa/${row.numero}`
      });
      if (pendentes.length >= limite) break;
    }
    res.json({
      ok: true,
      total: pendentes.length,
      gerado_em: new Date().toISOString(),
      conversas: pendentes
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/internal/inbox-snapshot — versao compacta, mais conversas, sem historico
router.get("/inbox-snapshot", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT numero, nome, status, tipo, temperatura, criado_em,
             updated_at AS atualizado_em,
             COALESCE(jsonb_array_length(historico), 0) AS msgs
      FROM conversations
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 500
    `);
    res.json({
      ok: true,
      total: r.rows.length,
      gerado_em: new Date().toISOString(),
      conversas: r.rows
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
module.exports.setEnviarMensagem = setEnviarMensagem;
