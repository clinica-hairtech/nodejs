// Relatório semanal automático — enviado toda segunda-feira às 8h
const db = require("./db");

function dentroDaJanela() {
  const agora = new Date();
  // Brasília = UTC-3
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const dia  = brasilia.getUTCDay();  // 1 = segunda-feira
  const hora = brasilia.getUTCHours();
  const min  = brasilia.getUTCMinutes();
  return dia === 1 && hora === 8 && min < 30;
}

async function gerarRelatorio(conversas) {
  const agora   = Date.now();
  const semana  = agora - 7  * 24 * 60 * 60 * 1000;
  const quinzena = agora - 14 * 24 * 60 * 60 * 1000;

  // Conversas desta semana (em memória)
  const desta = Object.values(conversas).filter(c => c.ultimaAtividade > semana);
  const anterior = Object.values(conversas).filter(c =>
    c.ultimaAtividade > quinzena && c.ultimaAtividade <= semana
  );

  const contar = (arr, fn) => arr.filter(fn).length;

  const quentes  = contar(desta, c => c.temperatura === "quente");
  const mornos   = contar(desta, c => c.temperatura === "morno");
  const frios    = contar(desta, c => c.temperatura === "frio");
  const humanos  = contar(desta, c => c.status === "humano");
  const transp   = contar(desta, c => c.tipo === "transplante");
  const retornos = contar(desta, c => c.tipo === "antigo");
  const semResp  = contar(desta, c => {
    const h = c.historico || [];
    return h.length > 0 && h[h.length - 1].role === "assistant";
  });

  const total = desta.length;
  const totalAnt = anterior.length;
  const diff = total - totalAnt;
  const seta = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "igual";

  // Métricas históricas do banco
  let metricasBanco = null;
  try { metricasBanco = await db.buscarMetricas(); } catch (_) {}

  let taxaConversao = humanos > 0 && total > 0
    ? `${Math.round((humanos / total) * 100)}%`
    : "0%";

  const linha = (label, valor) => `${label}: *${valor}*`;

  const texto =
    `*Relatorio Semanal — Clinica HairTech*\n` +
    `_${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}_\n\n` +
    `*Esta semana:*\n` +
    `${linha("Total de contatos", `${total} (${seta} vs semana anterior)`)}\n` +
    `${linha("Leads quentes", quentes)}\n` +
    `${linha("Leads mornos", mornos)}\n` +
    `${linha("Leads frios", frios)}\n` +
    `${linha("Encaminhados para especialista", humanos)}\n` +
    `${linha("Taxa de conversao", taxaConversao)}\n\n` +
    `*Perfil dos leads:*\n` +
    `${linha("Interesse em transplante", transp)}\n` +
    `${linha("Pacientes de retorno", retornos)}\n` +
    `${linha("Aguardando resposta (sem follow-up)", semResp)}\n` +
    (metricasBanco ? `\n*Acumulado total (banco):*\n` +
    `${linha("Conversas historicas", metricasBanco.conversas_semana + " (ultimos 7d)")}\n` +
    `${linha("Total convertidos", metricasBanco.convertidos)}\n` +
    `${linha("Total transplante", metricasBanco.transplantes)}\n`
    : "") +
    `\n_Painel completo: nodejs-production-843d.up.railway.app/admin_`;

  return texto;
}

function iniciarRelatorio(conversas, enviarMensagem, ownerPhone) {
  let ultimoEnvio = 0;

  setInterval(async () => {
    if (!dentroDaJanela()) return;
    if (Date.now() - ultimoEnvio < 60 * 60 * 1000) return;

    try {
      const relatorio = await gerarRelatorio(conversas);
      await enviarMensagem(ownerPhone, relatorio);
      ultimoEnvio = Date.now();
      console.log("Relatorio semanal enviado");
    } catch (e) {
      console.error("Erro ao enviar relatorio:", e.message);
    }
  }, 15 * 60 * 1000);
}

module.exports = iniciarRelatorio;
module.exports.gerarRelatorio = gerarRelatorio;
