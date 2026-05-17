// Nota Fiscal de Servicos
// Modos de operacao:
//   (1) FOCUSNFE_TOKEN setado no .env -> emissao automatica via FocusNFe API
//       Doctor recebe notificacao com numero/PDF da NF emitida
//   (2) FOCUSNFE_TOKEN ausente -> modo manual (legado): notifica Dr. Ricardo
//       via WhatsApp com os dados pra ele emitir manualmente no portal
//
// Integracao: POST /nfse com dados da consulta/procedimento realizado
// Pendencia 9.11 do Mestre v6.0: migrar Playwright pra API (NuvemFiscal/FocusNFe)

const express = require("express");
const axios = require("axios");

const FOCUSNFE_TOKEN = process.env.FOCUSNFE_TOKEN || "";
const FOCUSNFE_BASE = process.env.FOCUSNFE_BASE || "https://api.focusnfe.com.br";
const CNPJ_EMITENTE = process.env.CNPJ_EMITENTE || "49634881000191";
const MUNICIPIO_CODIGO_IBGE = process.env.MUNICIPIO_CODIGO_IBGE || "3304706"; // Rio Bonito/RJ

async function emitirViaFocusNfe({ nome, cpf, valor, servico, descricao, dataServico }) {
  if (!FOCUSNFE_TOKEN) {
    throw new Error("FOCUSNFE_TOKEN ausente — modo manual");
  }

  const ref = `hairtech-${Date.now()}`;
  const payload = {
    data_emissao: dataServico.toISOString(),
    prestador: { cnpj: CNPJ_EMITENTE },
    tomador: {
      cpf: cpf.replace(/\D/g, ""),
      razao_social: nome,
      email: null
    },
    servico: {
      aliquota: 5,
      discriminacao: descricao || servico || "Consulta / Tratamento Capilar",
      iss_retido: "false",
      item_lista_servico: "04.01",
      codigo_tributario_municipio: "040100",
      valor_servicos: Number(valor),
      municipio_prestacao_servico: MUNICIPIO_CODIGO_IBGE
    }
  };

  const url = `${FOCUSNFE_BASE}/v2/nfse?ref=${ref}`;
  const resp = await axios.post(url, payload, {
    auth: { username: FOCUSNFE_TOKEN, password: "" },
    headers: { "Content-Type": "application/json" },
    timeout: 30000
  });

  return { ref, status: resp.data.status || "processando", numero_nf: resp.data.numero || null, url: resp.data.url || null };
}

function criarRoterNfse(enviarMensagem, NOTIFY_PHONE, ADMIN_PASS) {
  const router = express.Router();

  // POST /nfse — registrar servico realizado
  router.post("/", async (req, res) => {
    const { senha, numero, nome, cpf, valor, servico, data, descricao } = req.body;

    if (senha !== ADMIN_PASS) return res.status(401).json({ erro: "Não autorizado" });
    if (!nome || !cpf || !valor) return res.status(400).json({ erro: "nome, cpf e valor são obrigatórios" });

    const dataServico = data ? new Date(data) : new Date();
    const dataFmt = dataServico.toLocaleDateString("pt-BR");

    // Tenta emissao automatica via FocusNFe
    if (FOCUSNFE_TOKEN) {
      try {
        const r = await emitirViaFocusNfe({ nome, cpf, valor, servico, descricao, dataServico });
        const msg =
          `*HairTech — NF emitida automaticamente*\n\n` +
          `Data: ${dataFmt}\n` +
          `Paciente: ${nome}\n` +
          `Valor: R$ ${Number(valor).toFixed(2).replace(".", ",")}\n` +
          `Ref FocusNFe: ${r.ref}\n` +
          `Status: ${r.status}\n` +
          (r.numero_nf ? `Numero NF: ${r.numero_nf}\n` : "") +
          (r.url ? `URL: ${r.url}\n` : "");
        await enviarMensagem(NOTIFY_PHONE, msg);
        console.log(`[NF] Emissao automatica OK: ${nome} R$${valor} ref=${r.ref}`);
        return res.json({ ok: true, modo: "automatico", ref: r.ref, status: r.status, numero_nf: r.numero_nf });
      } catch (e) {
        console.error("[NF] FocusNFe falhou, caindo pro modo manual:", e.response?.data || e.message);
      }
    }

    // Fallback: modo manual (legado) — notifica Dr. Ricardo
    const msg =
      `*HairTech — Emitir Nota Fiscal (manual)*\n\n` +
      `Data: ${dataFmt}\n` +
      `Paciente: ${nome}\n` +
      `CPF: ${cpf}\n` +
      `WhatsApp: ${numero ? `+${numero}` : "—"}\n` +
      `Serviço: ${servico || "Consulta / Tratamento Capilar"}\n` +
      `Valor: R$ ${Number(valor).toFixed(2).replace(".", ",")}\n` +
      (descricao ? `Descrição: ${descricao}\n` : "") +
      `\n_FOCUSNFE_TOKEN nao configurado — emita manualmente no portal._`;

    try {
      await enviarMensagem(NOTIFY_PHONE, msg);
      console.log(`[NF] Modo manual: ${nome} R$${valor}`);
      return res.json({ ok: true, modo: "manual", mensagem: "Notificação enviada ao Dr. Ricardo" });
    } catch (e) {
      console.error("[NF] Erro ao notificar:", e.message);
      return res.status(500).json({ erro: "Falha ao enviar notificação" });
    }
  });

  // POST /nfse/lote — emissao em lote (fim do dia)
  router.post("/lote", async (req, res) => {
    const { senha, servicos } = req.body;
    if (senha !== ADMIN_PASS) return res.status(401).json({ erro: "Não autorizado" });
    if (!Array.isArray(servicos) || servicos.length === 0) return res.status(400).json({ erro: "Lista de serviços vazia" });

    const dataServico = new Date();
    const dataFmt = dataServico.toLocaleDateString("pt-BR");

    if (FOCUSNFE_TOKEN) {
      const resultados = [];
      for (const sv of servicos) {
        try {
          const r = await emitirViaFocusNfe({ ...sv, dataServico });
          resultados.push({ ok: true, paciente: sv.nome, ref: r.ref, numero: r.numero_nf });
        } catch (e) {
          resultados.push({ ok: false, paciente: sv.nome, erro: e.message });
        }
      }
      const sucessos = resultados.filter(r => r.ok).length;
      const falhas = resultados.filter(r => !r.ok).length;
      const total = servicos.reduce((s, sv) => s + Number(sv.valor || 0), 0);
      const linhas = resultados.map((r, i) =>
        r.ok ? `${i+1}. OK ${r.paciente} ref=${r.ref}` : `${i+1}. FALHA ${r.paciente}: ${r.erro}`
      ).join("\n");
      const msg =
        `*HairTech — Lote NF (auto)*\n` +
        `Data: ${dataFmt}\n` +
        `Total: ${servicos.length} (${sucessos} ok, ${falhas} falhas) — R$ ${total.toFixed(2).replace(".",",")}\n\n` + linhas;
      await enviarMensagem(NOTIFY_PHONE, msg);
      return res.json({ ok: true, total: servicos.length, sucessos, falhas, resultados });
    }

    // Modo manual
    const total = servicos.reduce((s, sv) => s + Number(sv.valor || 0), 0);
    const linhas = servicos.map((sv, i) =>
      `${i + 1}. ${sv.nome} — CPF: ${sv.cpf} — R$ ${Number(sv.valor).toFixed(2).replace(".", ",")}`
    ).join("\n");
    const msg =
      `*HairTech — Lote NF (manual)*\n` +
      `Data: ${dataFmt}\n` +
      `Total: ${servicos.length} notas — R$ ${total.toFixed(2).replace(".", ",")}\n\n` +
      linhas +
      `\n\n_FOCUSNFE_TOKEN nao configurado — emita manualmente no portal._`;

    try {
      await enviarMensagem(NOTIFY_PHONE, msg);
      return res.json({ ok: true, modo: "manual", total: servicos.length });
    } catch (e) {
      return res.status(500).json({ erro: "Falha ao enviar notificação" });
    }
  });

  // GET /nfse/status — diagnostico
  router.get("/status", (req, res) => {
    res.json({
      modo: FOCUSNFE_TOKEN ? "automatico" : "manual",
      focusnfe_configurado: !!FOCUSNFE_TOKEN,
      cnpj_emitente: CNPJ_EMITENTE,
      municipio_ibge: MUNICIPIO_CODIGO_IBGE
    });
  });

  return router;
}

module.exports = criarRoterNfse;
