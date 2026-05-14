// Resgate diário de leads — 10h BRT
// Envia para Dr. Ricardo: resumo + sugestões para aprovar
// Envia para ANA: [RELATORIO_DIARIO_ANA] para contato pessoal direto

const ANA_NUMERO = "5521967813366";

// Armazena sugestões pendentes de aprovação: numero -> mensagem sugerida
const sugestoesAtivas = new Map();

function dentroDaJanelaResgate() {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const hora = brasilia.getUTCHours();
  const min  = brasilia.getUTCMinutes();
  return hora === 10 && min < 30;
}

function detectarInteresse(c) {
  const hist  = c.historico || [];
  const texto = hist.map(m => m.content || "").join(" ").toLowerCase();
  if (c.tipo === "transplante" || texto.includes("transplante") || texto.includes("falha") || texto.includes("calv"))
    return "Transplante capilar";
  if (texto.includes("mmp") || texto.includes("microinfusao"))
    return "MMP";
  if (texto.includes("mesoterapia"))
    return "Mesoterapia capilar";
  if (texto.includes("queda") || texto.includes("afinamento"))
    return "Queda / afinamento";
  if (c.tipo === "antigo")
    return "Retorno (paciente antigo)";
  return "Consulta geral";
}

function ultimaMensagemPaciente(c) {
  const hist = c.historico || [];
  const msgs = hist.filter(m => m.role === "user");
  if (msgs.length === 0) return "—";
  return (msgs[msgs.length - 1].content || "").slice(0, 120);
}

function gerarSugestao(c) {
  const interesse = detectarInteresse(c);
  if (interesse.includes("Transplante"))
    return "Oi! Passei para ver se ficou com alguma dúvida sobre o transplante. A avaliação inicial por fotos é gratuita e pode te ajudar a entender o que faz sentido para o seu caso. Quando quiser, posso te orientar.";
  if (interesse.includes("MMP"))
    return "Oi! Só passando para saber se ficou com alguma dúvida sobre o MMP. Se quiser mais informações ou marcar uma consulta, estou à disposição.";
  if (interesse.includes("Mesoterapia"))
    return "Oi! Passando para ver se posso te ajudar com mais informações sobre a mesoterapia capilar ou para marcar uma avaliação.";
  if (interesse.includes("Retorno"))
    return "Oi! Passando para saber se você gostaria de retomar seu acompanhamento ou se posso te ajudar com alguma dúvida.";
  return "Oi! Passando para saber se ainda posso te ajudar ou esclarecer alguma dúvida. Estou à disposição.";
}

function formatarNumero(numero) {
  const limpo = numero.replace(/@.*/g, "").replace(/^55/, "");
  if (limpo.length === 11) return `(${limpo.slice(0,2)}) ${limpo.slice(2,7)}-${limpo.slice(7)}`;
  return limpo;
}

async function executarResgate(conversas, enviarMensagem, ownerPhone) {
  const agora = Date.now();
  const h24   = agora - 24 * 60 * 60 * 1000;
  const h72   = agora - 72 * 60 * 60 * 1000;

  const leads = Object.entries(conversas).filter(([numero, c]) => {
    if (!c.ultimaAtividade) return false;
    if (c.ultimaAtividade > h24) return false;
    if (c.ultimaAtividade < h72) return false;
    if (c.status === "humano" || c.status === "encerrado") return false;
    const hist = c.historico || [];
    if (hist.length === 0) return false;
    const ultima = hist[hist.length - 1];
    return ultima && ultima.role === "assistant";
  });

  if (leads.length === 0) {
    await enviarMensagem(ownerPhone,
      `*Resgate diário — ${new Date().toLocaleDateString("pt-BR")}*\n\nNenhum lead pendente hoje.`
    );
    return;
  }

  // --- Mensagem para Dr. Ricardo ---
  const dataHoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  let msgRicardo = `*RESUMO DIÁRIO — LEADS PARA RESGATAR*\n_${dataHoje}_\n\n`;
  msgRicardo += `${leads.length} lead(s) sem resposta nas últimas 24-72h:\n\n`;

  for (const [numero, c] of leads) {
    const numLimpo = numero.replace(/@.*/g, "");
    const interesse = detectarInteresse(c);
    const ultimaMsg = ultimaMensagemPaciente(c);
    const quando    = new Date(c.ultimaAtividade).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const sugestao  = gerarSugestao(c);
    const temp      = c.temperatura || "frio";

    sugestoesAtivas.set(numLimpo, sugestao);

    msgRicardo += `📱 *+55 ${formatarNumero(numero)}*\n`;
    msgRicardo += `Interesse: ${interesse} | Temp: ${temp}\n`;
    msgRicardo += `Última msg: "${ultimaMsg}"\n`;
    msgRicardo += `Quando: ${quando}\n`;
    msgRicardo += `Sugestão: _"${sugestao}"_\n`;
    msgRicardo += `✅ *aprovar ${numLimpo}*  ✏️ *enviar ${numLimpo} [sua mensagem]*\n\n`;
  }

  msgRicardo += `_Responda com o comando acima para enviar._`;
  await enviarMensagem(ownerPhone, msgRicardo);

  // --- Mensagem para ANA ---
  let msgAna = `[RELATORIO_DIARIO_ANA]\n\n`;
  msgAna += `*${leads.length} lead(s) para contato pessoal hoje:*\n\n`;

  for (const [numero, c] of leads) {
    const numLimpo  = numero.replace(/@.*/g, "");
    const interesse = detectarInteresse(c);
    const resumo    = ultimaMensagemPaciente(c);
    const quando    = new Date(c.ultimaAtividade).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const temp      = c.temperatura || "frio";

    msgAna += `📱 *+${numLimpo}*\n`;
    msgAna += `Interesse: ${interesse} | Temperatura: ${temp}\n`;
    msgAna += `Última mensagem: "${resumo}"\n`;
    msgAna += `Última atividade: ${quando}\n\n`;
  }

  msgAna += `Entre em contato pessoalmente com cada lead acima. Use um tom humano e personalizado baseado no interesse de cada um. Não responda a esta mensagem — apenas aja.`;
  await enviarMensagem(ANA_NUMERO, msgAna);

  console.log(`Resgate diario: ${leads.length} leads — resumo enviado para Dr. Ricardo e ANA.`);
}

function iniciarResgate(conversas, enviarMensagem, ownerPhone) {
  let ultimoEnvio = 0;

  setInterval(async () => {
    if (!dentroDaJanelaResgate()) return;
    if (Date.now() - ultimoEnvio < 60 * 60 * 1000) return;
    ultimoEnvio = Date.now();
    try {
      await executarResgate(conversas, enviarMensagem, ownerPhone);
    } catch (e) {
      console.error("Erro no resgate diario:", e.message);
    }
  }, 15 * 60 * 1000);
}

function getSugestao(numero) {
  return sugestoesAtivas.get(numero) || null;
}

module.exports = iniciarResgate;
module.exports.getSugestao = getSugestao;
