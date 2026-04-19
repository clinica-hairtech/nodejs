// Nota Fiscal de Serviços — coleta dados e notifica Dr. Ricardo via WhatsApp
// Integração: POST /nfse com os dados da consulta realizada

const express = require("express");

function criarRoterNfse(enviarMensagem, NOTIFY_PHONE, ADMIN_PASS) {
  const router = express.Router();

  // POST /nfse — registrar serviço realizado para emissão de NFS-e
  router.post("/", async (req, res) => {
    const { senha, numero, nome, cpf, valor, servico, data, descricao } = req.body;

    if (senha !== ADMIN_PASS) return res.status(401).json({ erro: "Não autorizado" });
    if (!nome || !cpf || !valor) return res.status(400).json({ erro: "nome, cpf e valor são obrigatórios" });

    const dataServico = data ? new Date(data) : new Date();
    const dataFmt = dataServico.toLocaleDateString("pt-BR");

    const msg =
      `*HairTech — Emitir Nota Fiscal*\n\n` +
      `Data: ${dataFmt}\n` +
      `Paciente: ${nome}\n` +
      `CPF: ${cpf}\n` +
      `WhatsApp: ${numero ? `+${numero}` : "—"}\n` +
      `Serviço: ${servico || "Consulta / Tratamento Capilar"}\n` +
      `Valor: R$ ${Number(valor).toFixed(2).replace(".", ",")}\n` +
      (descricao ? `Descrição: ${descricao}\n` : "") +
      `\n_Emita a NFS-e no portal da prefeitura com os dados acima._`;

    try {
      await enviarMensagem(NOTIFY_PHONE, msg);
      console.log(`NFS-e solicitada: ${nome} — R$${valor}`);
      return res.json({ ok: true, mensagem: "Notificação enviada ao Dr. Ricardo" });
    } catch (e) {
      console.error("Erro ao notificar NFS-e:", e.message);
      return res.status(500).json({ erro: "Falha ao enviar notificação" });
    }
  });

  // POST /nfse/lote — emissão em lote (fim do dia)
  router.post("/lote", async (req, res) => {
    const { senha, servicos } = req.body;
    if (senha !== ADMIN_PASS) return res.status(401).json({ erro: "Não autorizado" });
    if (!Array.isArray(servicos) || servicos.length === 0) return res.status(400).json({ erro: "Lista de serviços vazia" });

    const total = servicos.reduce((s, sv) => s + Number(sv.valor || 0), 0);
    const linhas = servicos.map((sv, i) =>
      `${i + 1}. ${sv.nome} — CPF: ${sv.cpf} — R$ ${Number(sv.valor).toFixed(2).replace(".", ",")}`
    ).join("\n");

    const msg =
      `*HairTech — Lote de Notas Fiscais*\n` +
      `Data: ${new Date().toLocaleDateString("pt-BR")}\n` +
      `Total: ${servicos.length} notas — R$ ${total.toFixed(2).replace(".", ",")}\n\n` +
      linhas +
      `\n\n_Emita as NFS-e no portal da prefeitura com os dados acima._`;

    try {
      await enviarMensagem(NOTIFY_PHONE, msg);
      return res.json({ ok: true, total: servicos.length });
    } catch (e) {
      return res.status(500).json({ erro: "Falha ao enviar notificação" });
    }
  });

  return router;
}

module.exports = criarRoterNfse;
