// FIN pro-ativo: resumo financeiro diario as 18h BRT.
// Telegram com receita do dia, Pix pendentes, agendamentos amanha.

const { Pool } = require("pg");
const axios = require("axios");

if (!process.env.DATABASE_URL) {
  console.error("[proactive-fin] DATABASE_URL ausente");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

function formatBRL(v) {
  return "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
}

async function temTabela(nome) {
  const r = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name=$1", [nome]);
  return r.rowCount > 0;
}

async function resumoPagamentos() {
  if (!(await temTabela("pagamentos"))) return null;
  const hoje = await pool.query(`
    SELECT COUNT(*)::int AS qtd, COALESCE(SUM(valor), 0) AS total
    FROM pagamentos
    WHERE status IN ('pago', 'confirmado')
      AND DATE(COALESCE(pago_em, created_at)) = CURRENT_DATE
  `);
  const pendentes = await pool.query(`
    SELECT COUNT(*)::int AS qtd, COALESCE(SUM(valor), 0) AS total
    FROM pagamentos
    WHERE status = 'pendente'
      AND created_at > NOW() - INTERVAL '7 days'
  `);
  const pendentesAntigos = await pool.query(`
    SELECT COUNT(*)::int AS qtd
    FROM pagamentos
    WHERE status = 'pendente'
      AND created_at < NOW() - INTERVAL '24 hours'
  `);
  return {
    hoje: hoje.rows[0],
    pendentes: pendentes.rows[0],
    pendentes_antigos: pendentesAntigos.rows[0].qtd,
  };
}

async function resumoAgenda() {
  if (!(await temTabela("agendamentos"))) return null;
  const amanha = await pool.query(`
    SELECT COUNT(*)::int AS qtd
    FROM agendamentos
    WHERE status = 'agendado'
      AND DATE(data_hora AT TIME ZONE 'America/Sao_Paulo') = (CURRENT_DATE + INTERVAL '1 day')
  `);
  const proximos7 = await pool.query(`
    SELECT tipo, COUNT(*)::int AS qtd
    FROM agendamentos
    WHERE status = 'agendado'
      AND data_hora BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    GROUP BY tipo
    ORDER BY qtd DESC
  `);
  return {
    amanha: amanha.rows[0].qtd,
    proximos7: proximos7.rows,
  };
}

async function resumoLeads() {
  const novos = await pool.query(`
    SELECT COUNT(*)::int AS qtd
    FROM conversations
    WHERE DATE(to_timestamp(ultima_atividade/1000) AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
  `);
  const quentes = await pool.query(`
    SELECT COUNT(*)::int AS qtd FROM conversations WHERE temperatura='quente' AND status='ativo'
  `);
  return { ativos_hoje: novos.rows[0].qtd, quentes_total: quentes.rows[0].qtd };
}

async function main() {
  const pag = await resumoPagamentos();
  const ag = await resumoAgenda();
  const leads = await resumoLeads();

  let msg = "HairTech - resumo do dia\n";
  msg += "================\n";

  msg += "\n*Leads*\n";
  msg += `- Ativos hoje: ${leads.ativos_hoje}\n`;
  msg += `- Quentes total: ${leads.quentes_total}\n`;

  if (pag) {
    msg += "\n*Financeiro*\n";
    msg += `- Pagamentos hoje: ${pag.hoje.qtd} (${formatBRL(pag.hoje.total)})\n`;
    msg += `- Pix pendentes (7d): ${pag.pendentes.qtd} (${formatBRL(pag.pendentes.total)})\n`;
    if (pag.pendentes_antigos > 0) {
      msg += `- ATENCAO: ${pag.pendentes_antigos} Pix pendente(s) ha +24h\n`;
    }
  } else {
    msg += "\n_Financeiro: tabela pagamentos vazia ou ausente_\n";
  }

  if (ag) {
    msg += "\n*Agenda*\n";
    msg += `- Amanha: ${ag.amanha} agendamento(s)\n`;
    if (ag.proximos7.length > 0) {
      msg += "- Proximos 7d:\n";
      ag.proximos7.forEach(t => {
        msg += `  - ${t.tipo}: ${t.qtd}\n`;
      });
    } else {
      msg += "- Nada nos proximos 7 dias\n";
    }
  }

  msg += "\nDashboard: https://hairtech.org/admin/portal";

  const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
  const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
  await axios.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    chat_id: tgChat,
    text: msg.slice(0, 3800),
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  }, { timeout: 6000 }).catch(e => console.error("telegram falhou:", e.message));

  console.log("[proactive-fin] resumo enviado");
  await pool.end();
}

main().catch(e => { console.error("[proactive-fin] erro fatal:", e); process.exit(1); });
