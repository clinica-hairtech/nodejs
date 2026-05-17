const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false
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
        nome TEXT,
        nota TEXT,
        retomadas INTEGER DEFAULT 0,
        proxima_retomada BIGINT,
        ultima_atividade BIGINT,
        historico JSONB DEFAULT '[]',
        aguardando_avaliacao BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS nome TEXT;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS nota TEXT;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '';
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS valor NUMERIC DEFAULT 0;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'whatsapp';
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS disclosure_enviado BOOLEAN DEFAULT false;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS disclosure_ts BIGINT;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS disclosure_hash TEXT;

      CREATE TABLE IF NOT EXISTS mensagens (
        id SERIAL PRIMARY KEY,
        numero TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mensagens_numero ON mensagens(numero);
      CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);

      -- Round 10: tabelas operacionais
      CREATE TABLE IF NOT EXISTS audit_ai_calls (
        id BIGSERIAL PRIMARY KEY,
        agente TEXT NOT NULL,
        model TEXT,
        prompt_hash TEXT,
        response_hash TEXT,
        tokens INTEGER DEFAULT 0,
        ts TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_ai_calls(ts DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_agente ON audit_ai_calls(agente);

      CREATE TABLE IF NOT EXISTS leads (
        id BIGSERIAL PRIMARY KEY,
        wa_id TEXT NOT NULL,
        nome TEXT, cpf TEXT, email TEXT,
        origem TEXT DEFAULT 'whatsapp',
        estagio TEXT DEFAULT 'novo',
        permite_reengajamento BOOLEAN DEFAULT true,
        consentimento_cfm BOOLEAN DEFAULT false,
        consentimento_cfm_ts TIMESTAMPTZ,
        consentimento_cfm_hash TEXT,
        ultimo_contato_at TIMESTAMPTZ DEFAULT NOW(),
        tentativas_reengajamento INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_leads_wa ON leads(wa_id);
      CREATE INDEX IF NOT EXISTS idx_leads_estagio ON leads(estagio);
      CREATE INDEX IF NOT EXISTS idx_leads_ultimo_contato ON leads(ultimo_contato_at DESC);

      CREATE TABLE IF NOT EXISTS contratos (
        id BIGSERIAL PRIMARY KEY,
        lead_id BIGINT REFERENCES leads(id),
        wa_id TEXT NOT NULL,
        provider TEXT DEFAULT 'docusign',
        envelope_id TEXT,
        template_id TEXT,
        tipo TEXT DEFAULT 'fue_padrao',
        valor NUMERIC,
        status TEXT DEFAULT 'criado',
        signer_email TEXT, signer_cpf TEXT, signer_nome TEXT,
        url_assinatura TEXT, assinado_em TIMESTAMPTZ, pdf_url TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_contratos_envelope ON contratos(envelope_id);
      CREATE INDEX IF NOT EXISTS idx_contratos_status ON contratos(status);
      CREATE INDEX IF NOT EXISTS idx_contratos_wa ON contratos(wa_id);

      CREATE TABLE IF NOT EXISTS pagamentos (
        id BIGSERIAL PRIMARY KEY,
        lead_id BIGINT REFERENCES leads(id),
        contrato_id BIGINT REFERENCES contratos(id),
        wa_id TEXT NOT NULL,
        provider TEXT DEFAULT 'infinitepay',
        invoice_slug TEXT, transaction_nsu TEXT UNIQUE,
        valor NUMERIC NOT NULL,
        status TEXT DEFAULT 'pendente',
        link_pagamento TEXT, receipt_url TEXT, pago_em TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pag_nsu ON pagamentos(transaction_nsu);
      CREATE INDEX IF NOT EXISTS idx_pag_status ON pagamentos(status);
      CREATE INDEX IF NOT EXISTS idx_pag_wa ON pagamentos(wa_id);

      CREATE TABLE IF NOT EXISTS notas_fiscais (
        id BIGSERIAL PRIMARY KEY,
        pagamento_id BIGINT REFERENCES pagamentos(id),
        wa_id TEXT NOT NULL,
        provider TEXT DEFAULT 'focusnfe',
        ref TEXT, numero_nf TEXT,
        cpf_tomador TEXT, nome_tomador TEXT, valor NUMERIC,
        status TEXT DEFAULT 'pendente',
        pdf_url TEXT, xml_url TEXT, emitida_em TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_nf_status ON notas_fiscais(status);
      CREATE INDEX IF NOT EXISTS idx_nf_pag ON notas_fiscais(pagamento_id);

      CREATE TABLE IF NOT EXISTS agendamentos (
        id BIGSERIAL PRIMARY KEY,
        lead_id BIGINT REFERENCES leads(id),
        wa_id TEXT NOT NULL,
        tipo TEXT DEFAULT 'consulta',
        unidade TEXT,
        data_hora TIMESTAMPTZ NOT NULL,
        duracao_min INTEGER DEFAULT 60,
        status TEXT DEFAULT 'agendado',
        valor NUMERIC,
        apple_event_id TEXT, feegow_id TEXT, observacoes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ag_data ON agendamentos(data_hora);
      CREATE INDEX IF NOT EXISTS idx_ag_status ON agendamentos(status);
      CREATE INDEX IF NOT EXISTS idx_ag_wa ON agendamentos(wa_id);
    `);
    console.log("Banco de dados pronto (Round 10: audit_ai_calls + leads + contratos + pagamentos + notas_fiscais + agendamentos)");
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
        nome: row.nome || null,
        nota: row.nota || null,
        tags: row.tags || "",
        valor: Number(row.valor) || 0,
        origem: row.origem || "whatsapp",
        retomadas: Number(row.retomadas) || 0,
        proximaRetomada: row.proxima_retomada ? Number(row.proxima_retomada) : null,
        ultimaAtividade: row.ultima_atividade ? Number(row.ultima_atividade) : Date.now(),
        historico: Array.isArray(row.historico) ? row.historico : [],
        aguardandoAvaliacao: row.aguardando_avaliacao || false,
        disclosureEnviado: row.disclosure_enviado || false,
        disclosureTs: row.disclosure_ts ? Number(row.disclosure_ts) : null,
        disclosureHash: row.disclosure_hash || null
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
        (numero, status, tipo, temperatura, genero, nome, nota, tags, valor, origem,
         retomadas, proxima_retomada, ultima_atividade, historico, aguardando_avaliacao,
         disclosure_enviado, disclosure_ts, disclosure_hash, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
      ON CONFLICT (numero) DO UPDATE SET
        status = EXCLUDED.status,
        tipo = EXCLUDED.tipo,
        temperatura = EXCLUDED.temperatura,
        genero = EXCLUDED.genero,
        nome = EXCLUDED.nome,
        nota = EXCLUDED.nota,
        tags = EXCLUDED.tags,
        valor = EXCLUDED.valor,
        origem = EXCLUDED.origem,
        retomadas = EXCLUDED.retomadas,
        proxima_retomada = EXCLUDED.proxima_retomada,
        ultima_atividade = EXCLUDED.ultima_atividade,
        historico = EXCLUDED.historico,
        aguardando_avaliacao = EXCLUDED.aguardando_avaliacao,
        disclosure_enviado = EXCLUDED.disclosure_enviado,
        disclosure_ts = EXCLUDED.disclosure_ts,
        disclosure_hash = EXCLUDED.disclosure_hash,
        updated_at = NOW()
    `, [
      numero,
      c.status || "ativo",
      c.tipo || "novo",
      c.temperatura || "frio",
      c.genero || null,
      c.nome || null,
      c.nota || null,
      c.tags || "",
      c.valor || 0,
      c.origem || "whatsapp",
      c.retomadas || 0,
      c.proximaRetomada || null,
      c.ultimaAtividade || Date.now(),
      JSON.stringify((c.historico || []).slice(-30)),
      c.aguardandoAvaliacao || false,
      c.disclosureEnviado || false,
      c.disclosureTs || null,
      c.disclosureHash || null
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
