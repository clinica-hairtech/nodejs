// Google Calendar — gera link "adicionar ao calendário" sem necessidade de OAuth
// Dr. Ricardo clica no link e o evento é adicionado direto na agenda dele

function gerarLinkCalendario({ nome, data, duracao = 60, unidade, tipo = "consulta" }) {
  const inicio = new Date(data);
  const fim    = new Date(inicio.getTime() + duracao * 60 * 1000);
  const fmt    = d => d.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

  const titulo  = tipo === "transplante" ? `Triagem Transplante — ${nome}` : `Consulta — ${nome}`;
  const detalhes = `Paciente: ${nome}\nUnidade: ${unidade || "HairTech"}\nTipo: ${tipo}`;

  const params = new URLSearchParams({
    text:     titulo,
    dates:    `${fmt(inicio)}/${fmt(fim)}`,
    details:  detalhes,
    location: unidade || "Clínica HairTech"
  });

  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}

function formatarMensagemAgenda({ nome, data, unidade, tipo, numero }) {
  const link = gerarLinkCalendario({ nome, data, unidade, tipo });
  const dataFmt = new Date(data).toLocaleString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo"
  });

  return (
    `*HairTech — Nova Consulta Agendada*\n\n` +
    `Paciente: +${numero}\n` +
    `Nome: ${nome || "Não informado"}\n` +
    `Data: ${dataFmt}\n` +
    `Unidade: ${unidade || "—"}\n` +
    `Tipo: ${tipo || "consulta"}\n\n` +
    `Adicione à sua agenda:\n${link}`
  );
}

module.exports = { gerarLinkCalendario, formatarMensagemAgenda };
