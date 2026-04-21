const TEXTOS = {
  novo: [
    "Só passando para saber se ainda posso te ajudar com sua dúvida ou te orientar melhor sobre como funciona o atendimento aqui na clínica.",
    "Vi que você tinha interesse e quis retomar seu atendimento por aqui. Se quiser, posso te orientar melhor e dar sequência.",
    "Estou retomando seu contato para saber se ainda posso te ajudar. Se quiser, posso seguir com as orientações iniciais.",
    "Passando novamente para deixar o atendimento à sua disposição. Se ainda quiser seguir, posso te orientar por aqui sem problema.",
    "Retomando seu contato por aqui para saber se ainda faz sentido para você seguir com a consulta ou esclarecer alguma dúvida.",
    "Passando novamente para deixar o atendimento à disposição. Se ainda quiser seguir, posso continuar por aqui."
  ],
  antigo: [
    "Só passando para saber se você ainda gostaria de dar continuidade ao seu atendimento ou se posso te ajudar com alguma dúvida.",
    "Retomando seu contato para saber se você gostaria de seguir com reavaliação, continuidade do tratamento ou reagendamento.",
    "Passando para lembrar que sigo à disposição caso você queira retomar seu acompanhamento, reavaliar ou dar continuidade ao tratamento.",
    "Retomando seu contato para saber se posso te ajudar a organizar uma reavaliação ou continuidade do tratamento."
  ]
};

// Intervalos em ms: 5min, 30min, 2h, 24h, 72h (3 dias) → encerra
const INTERVALOS_NOVO = [
  5  * 60 * 1000,
  30 * 60 * 1000,
  2  * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000
];

// Paciente antigo: 30min, 2h, 24h, 72h
const INTERVALOS_ANTIGO = [
  30 * 60 * 1000,
  2  * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000
];

function dentroDoHorario() {
  const agora = new Date();
  const dia = agora.getDay(); // 0=dom, 6=sab
  const hora = agora.getHours();
  if (dia === 0) return false; // domingo
  if (dia === 6) return hora >= 10 && hora < 13; // sábado
  return hora >= 9 && hora < 19; // seg-sex
}

function agendarProximaRetomada(conversa) {
  const tipo = conversa.tipo === "antigo" ? "antigo" : "novo";
  const intervalos = tipo === "antigo" ? INTERVALOS_ANTIGO : INTERVALOS_NOVO;
  const idx = conversa.retomadas;
  if (idx < intervalos.length) {
    conversa.proximaRetomada = Date.now() + intervalos[idx];
  } else {
    conversa.proximaRetomada = null; // encerrar régua
  }
}

module.exports = function iniciarRetomada(conversas, enviarMensagem) {
  setInterval(async () => {
    if (!dentroDoHorario()) return;

    const agora = Date.now();

    for (const numero in conversas) {
      const c = conversas[numero];

      if (c.status === "pausado" || c.status === "encerrado" || c.status === "humano") continue;
      if (!c.proximaRetomada || agora < c.proximaRetomada) continue;

      const tipo = c.tipo === "antigo" ? "antigo" : "novo";
      const textos = TEXTOS[tipo];
      const texto = textos[c.retomadas] || textos[textos.length - 1];

      try {
        await enviarMensagem(numero, texto);
        c.retomadas = (c.retomadas || 0) + 1;
        agendarProximaRetomada(c);
        console.log(`Retomada ${c.retomadas} enviada para ${numero}`);
      } catch (e) {
        console.error(`Erro ao enviar retomada para ${numero}:`, e.message);
      }
    }
  }, 5 * 60 * 1000); // verifica a cada 5 minutos
};

module.exports.agendarProximaRetomada = agendarProximaRetomada;
