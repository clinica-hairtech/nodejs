const db = require("./db");

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

// Intervalos em ms: 10min, 2h, 24h, 72h (3 dias) → encerra
const INTERVALOS_NOVO = [
  10 * 60 * 1000,
  2  * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000
];

// Paciente antigo: mesma régua
const INTERVALOS_ANTIGO = [
  10 * 60 * 1000,
  2  * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000
];

function dentroDoHorario() {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const dia  = brasilia.getUTCDay();
  const hora = brasilia.getUTCHours();
  if (dia === 0) return false;                    // domingo: nunca
  if (dia === 6) return hora >= 10 && hora < 13; // sábado: 10h-13h
  return hora >= 9 && hora < 22;                 // seg-sex: 9h-22h (evita madrugada)
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
        db.salvarMensagem(numero, "assistant", texto).catch(() => {});
        db.salvarConversa(numero, c).catch(() => {});
        console.log(`Retomada ${c.retomadas} enviada para ${numero}`);
      } catch (e) {
        console.error(`Erro ao enviar retomada para ${numero}:`, e.message);
      }
    }
  }, 5 * 60 * 1000); // verifica a cada 5 minutos
};

module.exports.agendarProximaRetomada = agendarProximaRetomada;

// ============================================================
// CHAMADA NOTURNA — todo dia às 20h para leads ativos
// ============================================================

function dentroDaJanela20h() {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const dia  = brasilia.getUTCDay();
  const hora = brasilia.getUTCHours();
  const min  = brasilia.getUTCMinutes();
  if (dia === 0 || dia === 6) return false; // só seg-sex
  return hora === 20 && min < 30;
}

function dataHojeBrasilia() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function gerarMensagem20h(c) {
  const nome = c.nome ? c.nome.split(" ")[0] : null;
  const ola  = nome ? `Oi, ${nome}!` : "Oi!";

  const hist  = c.historico || [];
  const texto = hist.map(m => m.content || "").join(" ").toLowerCase();

  let foco;
  if (c.tipo === "transplante" || texto.includes("transplante") || texto.includes("falha") || texto.includes("calv"))
    foco = "o transplante capilar";
  else if (texto.includes("mmp") || texto.includes("microinfusao"))
    foco = "o MMP";
  else if (texto.includes("mesoterapia"))
    foco = "a mesoterapia";
  else if (texto.includes("queda") || texto.includes("afinamento"))
    foco = "a queda de cabelo";
  else
    foco = "o seu caso";

  const opcoes = [
    `${ola} Aproveitando que você já deve estar em casa e com mais calma — ficou alguma dúvida sobre ${foco}? Esse costuma ser o melhor momento para conversar com mais tranquilidade.`,
    `${ola} Sei que durante o dia a correria não para. Agora que o dia esfriou um pouco, queria saber se posso te ajudar a esclarecer alguma coisa sobre ${foco}. Estou por aqui.`,
    `${ola} Aproveitei esse horário para te chamar porque é quando a gente consegue pensar melhor. Ficou alguma dúvida sobre ${foco} que eu possa te ajudar?`,
    `${ola} Passando agora que você já está em casa — queria saber se ainda posso te ajudar com ${foco} ou se ficou alguma coisa em aberto. É só falar.`,
  ];

  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

module.exports.iniciarChamada20h = function(conversas, enviarMensagem) {
  const h7dias = 7 * 24 * 60 * 60 * 1000;

  setInterval(async () => {
    if (!dentroDaJanela20h()) return;

    const hoje = dataHojeBrasilia();
    const agora = Date.now();

    for (const numero in conversas) {
      const c = conversas[numero];

      if (c.status === "pausado" || c.status === "encerrado" || c.status === "humano") continue;
      if (!c.ultimaAtividade || agora - c.ultimaAtividade > h7dias) continue;
      if (c.chamada20h === hoje) continue; // já enviou hoje

      const mensagem = gerarMensagem20h(c);
      try {
        await enviarMensagem(numero, mensagem);
        c.chamada20h = hoje;
        db.salvarMensagem(numero, "assistant", mensagem).catch(() => {});
        db.salvarConversa(numero, c).catch(() => {});
        console.log(`Chamada 20h enviada para ${numero}`);
        await new Promise(r => setTimeout(r, 600));
      } catch (e) {
        console.error(`Erro na chamada 20h para ${numero}:`, e.message);
      }
    }
  }, 5 * 60 * 1000);
};
