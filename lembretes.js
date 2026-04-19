// Lembretes automáticos de consulta via WhatsApp
// Armazena consultas agendadas em memória (persiste via PostgreSQL futuramente)

const consultas = {}; // { id: { numero, nome, data, unidade, tipo, lembretesEnviados } }

const MSGS = {
  doisDias: (nome, unidade) =>
    `Olá${nome ? ", " + nome : ""}! Sua consulta na Clínica HairTech em *${unidade}* está chegando.\n\n` +
    `Para garantir a melhor análise na tricoscopia, pedimos que evite lavar o cabelo nas próximas 24 a 48 horas antes da consulta.\n\n` +
    `Se tiver exames recentes, separe-os para levar. E lembre-se de trazer a lista de medicações, vitaminas e suplementos que utiliza, com as dosagens.\n\nAté breve.`,

  umDia: (nome, unidade, data) =>
    `Olá${nome ? ", " + nome : ""}! Passando para confirmar sua consulta na Clínica HairTech em *${unidade}* amanhã, ${data}.\n\n` +
    `Caso precise reagendar, pedimos pelo menos 24 horas de antecedência. Em caso de ausência no dia, o sinal não é reembolsado.\n\n` +
    `Estamos te esperando.`,

  mesmoDia: (nome, unidade, hora) =>
    `Bom dia${nome ? ", " + nome : ""}! Só passando para lembrar que sua consulta na Clínica HairTech em *${unidade}* é hoje, às *${hora}*.\n\nEstamos te esperando.`,

  procedimento: (nome, unidade, data, hora) =>
    `Olá${nome ? ", " + nome : ""}! Passando para confirmar sua próxima sessão na Clínica HairTech em *${unidade}*.\n\n` +
    `Sua sessão está pré-agendada para *${data}* às *${hora}*.\n\n` +
    `Se precisar reagendar, nos avise com pelo menos 24 horas de antecedência.`
};

function formatarData(date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatarHora(date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function diffDias(dataConsulta) {
  const agora = new Date();
  const meia_noite_hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const meia_noite_consulta = new Date(dataConsulta.getFullYear(), dataConsulta.getMonth(), dataConsulta.getDate());
  return Math.round((meia_noite_consulta - meia_noite_hoje) / (24 * 60 * 60 * 1000));
}

module.exports = {
  consultas,

  agendarLembrete(numero, { nome, data, unidade, tipo = "consulta" }) {
    const id = `${numero}_${data.getTime()}`;
    consultas[id] = {
      id, numero, nome, data, unidade, tipo,
      lembretesEnviados: []
    };
    console.log(`Lembrete agendado: ${numero} → ${formatarData(data)} em ${unidade}`);
    return id;
  },

  iniciar(enviarMensagem) {
    // Verifica a cada hora
    setInterval(async () => {
      const hora = new Date().getHours();
      // Só envia lembretes de manhã (8h-10h)
      if (hora < 8 || hora > 10) return;

      for (const id in consultas) {
        const c = consultas[id];
        if (!c || !c.data) continue;

        const dias = diffDias(new Date(c.data));
        const hora_consulta = formatarHora(new Date(c.data));
        const data_fmt = formatarData(new Date(c.data));

        try {
          if (dias === 2 && !c.lembretesEnviados.includes("2dias")) {
            await enviarMensagem(c.numero, MSGS.doisDias(c.nome, c.unidade));
            c.lembretesEnviados.push("2dias");
            console.log(`Lembrete 2 dias enviado: ${c.numero}`);
          }

          if (dias === 1 && !c.lembretesEnviados.includes("1dia")) {
            await enviarMensagem(c.numero, MSGS.umDia(c.nome, c.unidade, data_fmt));
            c.lembretesEnviados.push("1dia");
            console.log(`Lembrete 1 dia enviado: ${c.numero}`);
          }

          if (dias === 0 && !c.lembretesEnviados.includes("hoje")) {
            await enviarMensagem(c.numero, MSGS.mesmoDia(c.nome, c.unidade, hora_consulta));
            c.lembretesEnviados.push("hoje");
            console.log(`Lembrete dia da consulta enviado: ${c.numero}`);
          }

          if (dias === 7 && c.tipo === "procedimento" && !c.lembretesEnviados.includes("7dias")) {
            await enviarMensagem(c.numero, MSGS.procedimento(c.nome, c.unidade, data_fmt, hora_consulta));
            c.lembretesEnviados.push("7dias");
            console.log(`Lembrete procedimento 7 dias: ${c.numero}`);
          }

          // Limpar consulta passada
          if (dias < -1) delete consultas[id];

        } catch (e) {
          console.error(`Erro ao enviar lembrete ${id}:`, e.message);
        }
      }
    }, 60 * 60 * 1000);
  }
};
