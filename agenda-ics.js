// /agenda.ics - feed iCalendar publico (com token) dos agendamentos.
// Funciona com Apple Calendar, Google Calendar, Outlook, Fantastical, etc.
// Dr. assina a URL UMA VEZ no app de calendar dele e atualiza automatico.

const express = require("express");
const router = express.Router();
const db = require("./db");

const TOKEN = process.env.AGENDA_ICS_TOKEN || "trocar-este-token-no-env";

function escICS(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function dtUTC(date) {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

router.get("/agenda.ics", async (req, res) => {
  if (req.query.token !== TOKEN) {
    return res.status(401).type("text/plain").send("token invalido");
  }
  if (!db.pool) {
    return res.status(503).type("text/plain").send("DB indisponivel");
  }

  let rows = [];
  try {
    const r = await db.pool.query(`
      SELECT a.id, a.wa_id, a.tipo, a.data_hora, a.duracao_min, a.status,
             a.valor, a.observacoes, a.unidade, c.nome
      FROM agendamentos a
      LEFT JOIN conversations c ON c.numero = a.wa_id
      WHERE a.data_hora > NOW() - INTERVAL '7 days'
        AND a.data_hora < NOW() + INTERVAL '180 days'
        AND a.status NOT IN ('cancelado', 'no_show')
      ORDER BY a.data_hora ASC
    `);
    rows = r.rows;
  } catch (e) {
    return res.status(500).type("text/plain").send("erro: " + e.message);
  }

  const linhas = [];
  linhas.push("BEGIN:VCALENDAR");
  linhas.push("VERSION:2.0");
  linhas.push("PRODID:-//HairTech//Agenda//PT-BR");
  linhas.push("CALSCALE:GREGORIAN");
  linhas.push("METHOD:PUBLISH");
  linhas.push("X-WR-CALNAME:HairTech - Agenda");
  linhas.push("X-WR-TIMEZONE:America/Sao_Paulo");
  linhas.push("X-WR-CALDESC:Agendamentos clinicos HairTech (sincronizado do CRM)");

  for (const a of rows) {
    const inicio = new Date(a.data_hora);
    const fim = new Date(inicio.getTime() + (a.duracao_min || 60) * 60000);
    const titulo = `[${a.tipo}] ${a.nome || a.wa_id}`;
    const desc = [
      `Paciente: ${a.nome || ""}`,
      `WhatsApp: +${a.wa_id}`,
      a.valor ? `Valor: R$ ${Number(a.valor).toFixed(2)}` : null,
      a.observacoes ? `Obs: ${a.observacoes}` : null,
      `Status: ${a.status}`,
      `Painel: https://hairtech.org/admin/prontuario/${a.wa_id}`,
    ].filter(Boolean).join("\\n");

    linhas.push("BEGIN:VEVENT");
    linhas.push(`UID:agendamento-${a.id}@hairtech.org`);
    linhas.push(`DTSTAMP:${dtUTC(new Date())}`);
    linhas.push(`DTSTART:${dtUTC(inicio)}`);
    linhas.push(`DTEND:${dtUTC(fim)}`);
    linhas.push(`SUMMARY:${escICS(titulo)}`);
    linhas.push(`DESCRIPTION:${escICS(desc)}`);
    if (a.unidade) linhas.push(`LOCATION:${escICS(a.unidade)}`);
    linhas.push(`STATUS:${a.status === "confirmado" ? "CONFIRMED" : a.status === "realizada" ? "CONFIRMED" : "TENTATIVE"}`);
    linhas.push("BEGIN:VALARM");
    linhas.push("ACTION:DISPLAY");
    linhas.push(`DESCRIPTION:${escICS(titulo)}`);
    linhas.push("TRIGGER:-PT30M");
    linhas.push("END:VALARM");
    linhas.push("END:VEVENT");
  }

  linhas.push("END:VCALENDAR");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="hairtech-agenda.ics"');
  res.setHeader("Cache-Control", "public, max-age=300"); // 5 min
  res.send(linhas.join("\r\n"));
});

module.exports = router;
