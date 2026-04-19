const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

async function init() {
  if (!pool) {
    console.log("DATABASE_URL não configurado — rodando sem persistência");
    return false;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        numero TEXT PRIMARY KEY,
        status TEXT DEFAULT 'ativo',
        tipo TEXT DEFAULT 'novo',
        temperatura TEXT DEFAULT 'frio',
        genero TEXT,
        retomadas INTEGER DEFAULT 0,
        proxima_retomada BIGINT,
        ultima_atividade BIGINT,
        historico JSONB DEFAULT '[]',
        aguardando_avaliacao BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mensagens (
        id SERIAL PRIMARY KEY,
        numero TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mensagens_numero ON mensagens(numero);
      CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
    `);
    console.log("Banco de dados pronto");
    return true;
  } catch (e) {
    console.error("Erro ao inicializar banco:", e.message);
    return false;
  }
}

async function carregarConversas() {
  if (!pool) return {};
  try {
    const result = await pool.query(`
      SELECT * FROM conversations
      WHERE status != 'encerrado'
         OR updated_at > NOW() - INTERVAL '30 days'
      ORDER BY ultima_atividade DESC NULLS LAST
    `);
    const conversas = {};
    for (const row of result.rows) {
      conversas[row.numero] = {
        status: row.status,
        tipo: row.tipo,
        temperatura: row.temperatura,
        genero: row.genero,
        retomadas: Number(row.retomadas) || 0,
        proximaRetomada: row.proxima_retomada ? Number(row.proxima_retomada) : null,
        ultimaAtividade: row.ultima_atividade ? Number(row.ultima_atividade) : Date.now(),
        historico: Array.isArray(row.historico) ? row.historico : [],
        aguardandoAvaliacao: row.aguardando_avaliacao || false
      };
    }
    console.log(`${result.rows.length} conversa(s) carregada(s) do banco`);
    return conversas;
  } catch (e) {
    console.error("Erro ao carregar conversas:", e.message);
    return {};
  }
}

async function salvarConversa(numero, c) {
  if (!pool) return;
  try {
    await pool.query(`
      INSERT INTO conversations
        (numero, status, tipo, temperatura, genero, retomadas,
         proxima_retomada, ultima_atividade, historico, aguardando_avaliacao, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (numero) DO UPDATE SET
        status = EXCLUDED.status,
        tipo = EXCLUDED.tipo,
        temperatura = EXCLUDED.temperatura,
        genero = EXCLUDED.genero,
        retomadas = EXCLUDED.retomadas,
        proxima_retomada = EXCLUDED.proxima_retomada,
        ultima_atividade = EXCLUDED.ultima_atividade,
        historico = EXCLUDED.historico,
        aguardando_avaliacao = EXCLUDED.aguardando_avaliacao,
        updated_at = NOW()
    `, [
      numero,
      c.status || "ativo",
      c.tipo || "novo",
      c.temperatura || "frio",
      c.genero || null,
      c.retomadas || 0,
      c.proximaRetomada || null,
      c.ultimaAtividade || Date.now(),
      JSON.stringify((c.historico || []).slice(-30)),
      c.aguardandoAvaliacao || false
    ]);
  } catch (e) {
    console.error("Erro ao salvar conversa:", e.message);
  }
}

async function salvarMensagem(numero, role, content) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO mensagens (numero, role, content) VALUES ($1, $2, $3)`,
      [numero, role, content.substring(0, 5000)]
    );
  } catch (e) {
    console.error("Erro ao salvar mensagem:", e.message);
  }
}

async function buscarMetricas() {
  if (!pool) return null;
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS conversas_semana,
        COUNT(*) FILTER (WHERE temperatura = 'quente') AS leads_quentes,
        COUNT(*) FILTER (WHERE temperatura = 'morno') AS leads_mornos,
        COUNT(*) FILTER (WHERE temperatura = 'frio') AS leads_frios,
        COUNT(*) FILTER (WHERE status = 'humano') AS convertidos,
        COUNT(*) FILTER (WHERE tipo = 'transplante') AS transplantes,
        COUNT(*) FILTER (WHERE tipo = 'antigo') AS retornos
      FROM conversations
    `);
    return result.rows[0];
  } catch (e) {
    console.error("Erro ao buscar métricas:", e.message);
    return null;
  }
}

module.exports = { init, carregarConversas, salvarConversa, salvarMensagem, buscarMetricas, pool };
