// COMP pro-ativo: alerta vencimentos importantes ate 60 dias.
// Roda segunda 8h BRT. Telegram com itens criticos.

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const ARQUIVO = path.join(__dirname, "..", "data", "vencimentos.json");
const DIAS_AVISO = parseInt(process.env.COMP_DIAS_AVISO || "60", 10);

function main() {
  let lista = [];
  try { lista = JSON.parse(fs.readFileSync(ARQUIVO, "utf8")); } catch (e) {
    console.error("[proactive-comp] arquivo invalido:", e.message);
    return;
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const alertas = lista
    .filter(v => v.ativo && v.vence_em)
    .map(v => ({
      ...v,
      vence_date: new Date(v.vence_em),
      dias: Math.floor((new Date(v.vence_em) - hoje) / 86400000),
    }))
    .filter(v => v.dias <= DIAS_AVISO)
    .sort((a, b) => a.dias - b.dias);

  if (alertas.length === 0) {
    console.log("[proactive-comp] sem vencimentos proximos");
    return;
  }

  let msg = "*HairTech COMP - vencimentos proximos*\n\n";
  for (const a of alertas) {
    const emoji = a.dias < 0 ? "🚨" : a.dias <= 7 ? "⚠️" : a.dias <= 30 ? "🔔" : "📋";
    const status = a.dias < 0 ? `VENCIDO ha ${-a.dias} dias` : a.dias === 0 ? "VENCE HOJE" : `vence em ${a.dias} dias`;
    msg += `${emoji} *${a.titulo}* - ${status}\n`;
    msg += `_${a.descricao}_\n`;
    if (a.renovacao_link) msg += `Renovar: ${a.renovacao_link}\n`;
    msg += "\n";
  }
  msg += `\nGerenciar: https://hairtech.org/admin/compliance`;

  const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
  const tgChat = process.env.TELEGRAM_CHAT_ID || "8713631351";
  axios.post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    chat_id: tgChat, text: msg.slice(0, 4000), parse_mode: "Markdown", disable_web_page_preview: true,
  }, { timeout: 8000 }).then(() => {
    console.log(`[proactive-comp] alerta enviado: ${alertas.length} itens`);
  }).catch(e => console.error("telegram:", e.message));
}

main();
