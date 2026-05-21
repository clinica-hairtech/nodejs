// Relatorio matinal automatico - 7h45 BRT = 10h45 UTC.
// Le vasculhamento Ollama da madrugada + estado dos containers +
// agenda do dia + ultimas 24h de leads. Manda Telegram.
//
// Resultado: Dr. acorda com plano de ligacoes priorizado, sem
// precisar abrir nenhuma pagina.

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8470054351:AAEBUfBP1oTT2Yx9W5J5_sgFCfxoJeOeXEQ";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "8713631351";

const VASC_FILE = path.join(__dirname, "..", "data", "vasculhamento.json");

async function lerVasculhamento() {
  try { return JSON.parse(fs.readFileSync(VASC_FILE, "utf8")); } catch (_) { return null; }
}

async function telegram(text) {
  return axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    chat_id: TG_CHAT, text: text.slice(0, 4000), parse_mode: "Markdown",
    disable_web_page_preview: true,
  }, { timeout: 8000 }).catch(e => console.error("tg:", e.message));
}

async function main() {
  const v = await lerVasculhamento();
  const linhas = ["☀️ *Bom dia, Dr. Ricardo*", "", "*Resumo da noite:*"];

  if (v && !v.em_andamento) {
    linhas.push(`- Vasculhamento Ollama: ${v.processados}/${v.total_chats} conversas analisadas (${v.duracao_min}min)`);
    linhas.push(`- Alertas criticos: ${v.alertas_criticos?.length || 0}`);
    linhas.push(`- Prioridade alta (P0/P1): ${v.prioridade_alta?.length || 0}`);

    if ((v.prioridade_alta || []).length > 0) {
      linhas.push("");
      linhas.push("*🎯 TOP 10 PRA LIGAR HOJE (priorizados pela IA):*");
      const top = v.prioridade_alta.slice(0, 10);
      top.forEach((p, i) => {
        linhas.push(`${i+1}. ${p.nome || p.numero} (+${p.numero})`);
        linhas.push(`   _${(p.resumo_1linha || "").substring(0, 100)}_`);
        linhas.push(`   ↳ acao: ${p.ultima_acao_dr || "?"}`);
      });
    }

    if ((v.alertas_criticos || []).length > 0) {
      linhas.push("");
      linhas.push("*🚨 ALERTAS CRITICOS:*");
      v.alertas_criticos.slice(0, 5).forEach(a => {
        linhas.push(`- ${a.nome || a.numero}: ${a.alerta}`);
      });
    }
  } else if (v && v.em_andamento) {
    linhas.push(`- Vasculhamento Ollama: AINDA RODANDO (${v.processados}/${v.total_alvo})`);
  } else {
    linhas.push("- Vasculhamento Ollama: nao rodou ainda");
  }

  linhas.push("");
  linhas.push("*Acoes hoje:*");
  linhas.push("- ⚡ BLITZ disparou as 9h (Telegram chega proximo)");
  linhas.push("- 📞 Ligar top 10 acima 9-11h");
  linhas.push("- 📄 Obter 4 chaves DocuSign (15min, guia em /admin/contratos/guia)");
  linhas.push("");
  linhas.push("*Detalhes:* https://hairtech.org/admin/portal");

  const msg = linhas.join("\n");
  await telegram(msg);
  console.log("[relatorio-matinal] enviado");
}

main().catch(async e => {
  console.error("[relatorio-matinal] fatal:", e);
  await telegram(`❌ Relatorio matinal crashou: ${e.message}`);
  process.exit(1);
});
