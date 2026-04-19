const express = require("express");
const axios = require("axios");
const SYSTEM_PROMPT = require("./systemPrompt");
const iniciarRetomada = require("./retomada");
const adminRouter = require("./admin");
const lembretes = require("./lembretes");

const app = express();
app.use(express.json());

const VERIFY_TOKEN     = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN   = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID  = process.env.PHONE_NUMBER_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_MODEL         = process.env.AI_MODEL || "openai/gpt-4o-mini";
const NOTIFY_PHONE     = process.env.NOTIFY_PHONE || "5521967813366";
const ADMIN_PASS       = process.env.ADMIN_PASS || "hairtech2026";

// Estado global das conversas
const conversas = {};
const idsProcessados = new Set();

// Inicia sistemas automáticos
iniciarRetomada(conversas, enviarMensagem);
lembretes.iniciar(enviarMensagem);

// Limpeza a cada hora
setInterval(() => idsProcessados.clear(), 60 * 60 * 1000);
setInterval(() => {
  const limite = Date.now() - 48 * 60 * 60 * 1000;
  for (const n in conversas) {
    if (conversas[n].ultimaAtividade < limite && conversas[n].status === "encerrado")
      delete conversas[n];
  }
}, 60 * 60 * 1000);

// ==========================
// PAINEL DE CONTROLE
// ==========================
app.use("/admin", adminRouter(conversas));

// ==========================
// VERIFICAÇÃO DO WEBHOOK
// ==========================
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ==========================
// RECEBER MENSAGENS
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const value   = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return;

    const msgId = message.id;
    if (idsProcessados.has(msgId)) return;
    idsProcessados.add(msgId);

    const from = message.from;

    // Inicializa conversa se nova
    if (!conversas[from]) {
      conversas[from] = {
        historico: [],
        ultimaAtividade: Date.now(),
        status: "ativo",
        tipo: "novo",
        retomadas: 0,
        proximaRetomada: null
      };
    }

    const c = conversas[from];

    // Bot pausado: registra mas não responde
    if (c.status === "pausado" || c.status === "encerrado") {
      c.ultimaAtividade = Date.now();
      return;
    }

    // Atualiza atividade e reseta retomada
    c.ultimaAtividade = Date.now();
    c.proximaRetomada = Date.now() + (2 * 60 * 60 * 1000); // próxima retomada em 2h se sumir

    let userMessage = "";

    if (message.type === "text") {
      userMessage = message.text.body;
    } else if (message.type === "image") {
      // Analisa imagem com visão IA
      const tipo = await analisarImagem(message.image.id);
      userMessage = `[IMAGEM: ${tipo}]`;
    } else if (message.type === "audio" || message.type === "voice") {
      userMessage = "[O paciente enviou um áudio]";
    } else if (message.type === "document") {
      userMessage = "[O paciente enviou um documento]";
    } else if (message.type === "interactive") {
      const ia = message.interactive;
      if (ia.type === "button_reply")  userMessage = ia.button_reply.title;
      else if (ia.type === "list_reply") userMessage = ia.list_reply.title;
      else return;
    } else {
      return;
    }

    console.log(`[${from}] ${userMessage.substring(0, 100)}`);

    // Detecta tipo de paciente
    const msgLower = userMessage.toLowerCase();
    if (msgLower.includes("já sou paciente") || msgLower.includes("sou paciente") || msgLower.includes("retorno")) {
      c.tipo = "antigo";
    }
    if (msgLower.includes("transplante") || msgLower.includes("calvície") || msgLower.includes("calvicie")) {
      c.tipo = "transplante";
    }

    // Marca como lida
    await marcarComoLido(msgId);

    // Delay humanizado
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));

    const resposta = await obterRespostaIA(from, userMessage);
    await processarResposta(from, resposta);

  } catch (error) {
    console.error("Erro no webhook:", error.message);
  }
});

// ==========================
// ANÁLISE DE IMAGEM (VISÃO IA)
// ==========================
async function analisarImagem(imageId) {
  try {
    // 1. Obtém URL da imagem via Meta API
    const meta = await axios.get(
      `https://graph.facebook.com/v18.0/${imageId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 10000 }
    );
    const imageUrl  = meta.data.url;
    const mimeType  = meta.data.mime_type || "image/jpeg";

    // 2. Baixa a imagem
    const imgResp = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      timeout: 15000
    });
    const base64 = Buffer.from(imgResp.data).toString("base64");

    // 3. Envia para visão IA
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` }
            },
            {
              type: "text",
              text: "Analise esta imagem e responda APENAS com uma palavra: 'COMPROVANTE' se for comprovante de pagamento, Pix, transferência ou recibo bancário. 'FOTO_CABELO' se for foto de cabelo, couro cabeludo, calvície ou área capilar. 'OUTRO' para qualquer outra coisa."
            }
          ]
        }],
        max_tokens: 10
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    const resultado = resp.data.choices[0].message.content.trim().toUpperCase();
    if (resultado.includes("COMPROVANTE")) return "COMPROVANTE";
    if (resultado.includes("FOTO_CABELO") || resultado.includes("CABELO")) return "FOTO_CABELO";
    return "OUTRO";

  } catch (e) {
    console.error("Erro ao analisar imagem:", e.message);
    return "OUTRO";
  }
}

// ==========================
// PROCESSADOR DE RESPOSTA
// ==========================
async function processarResposta(from, resposta) {
  if (resposta.includes("[BOTAO_ESPECIALISTA]")) {
    const antes = resposta.split("[BOTAO_ESPECIALISTA]")[0].trim();
    if (antes) await enviarMensagem(from, antes);
    await new Promise(r => setTimeout(r, 500));
    await enviarBotaoEspecialista(from);
    await notificarClinica(from, "Comprovante recebido — paciente encaminhado para especialista");
    conversas[from].status = "humano";
    conversas[from].proximaRetomada = null;
    return;
  }

  if (resposta.includes("[MENU_INICIAL]")) {
    const antes = resposta.split("[MENU_INICIAL]")[0].trim();
    if (antes) await enviarMensagem(from, antes);
    await new Promise(r => setTimeout(r, 500));
    await enviarMenuInicial(from);
    return;
  }

  if (resposta.includes("[NOTIF_AGENDAMENTO]")) {
    await notificarClinica(from, "Paciente confirmou interesse em agendar consulta — aguardando Pix");
  }
  if (resposta.includes("[NOTIF_TRANSPLANTE]")) {
    await notificarClinica(from, "Paciente com interesse em transplante capilar");
  }

  const enviarPdf = resposta.includes("[PDF_FOTOS]");

  const limpa = resposta
    .replace(/\[NOTIF_AGENDAMENTO\]/g, "")
    .replace(/\[NOTIF_TRANSPLANTE\]/g, "")
    .replace(/\[PDF_FOTOS\]/g, "")
    .trim();

  const partes = dividirMensagem(limpa);
  for (const parte of partes) {
    await enviarMensagem(from, parte);
    if (partes.length > 1) await new Promise(r => setTimeout(r, 700));
  }

  if (enviarPdf) {
    await new Promise(r => setTimeout(r, 800));
    await enviarPdfOrientacaoFotos(from);
  }
}

// ==========================
// RESPOSTA DA IA
// ==========================
async function obterRespostaIA(numero, mensagem) {
  const c = conversas[numero];
  c.historico.push({ role: "user", content: mensagem });
  if (c.historico.length > 30) c.historico = c.historico.slice(-30);

  try {
    const resp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...c.historico
        ],
        max_tokens: 1500,
        temperature: 0.6
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://clinicahairtech.com.br",
          "X-Title": "Assistente HairTech"
        },
        timeout: 30000
      }
    );

    const aiResp = resp.data.choices[0].message.content;
    c.historico.push({ role: "assistant", content: aiResp });
    return aiResp;

  } catch (e) {
    console.error("Erro na IA:", e.response?.data || e.message);
    return "Desculpa, tive uma dificuldade técnica agora. Pode repetir sua mensagem?";
  }
}

// ==========================
// MARCAR COMO LIDO
// ==========================
async function marcarComoLido(messageId) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", status: "read", message_id: messageId },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 5000 }
    );
  } catch (_) {}
}

// ==========================
// MENU INICIAL INTERATIVO
// ==========================
async function enviarMenuInicial(to) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "Clinica HairTech" },
          body: { text: "Para te direcionar corretamente, selecione uma das opcoes abaixo:" },
          action: {
            button: "Ver opcoes",
            sections: [{
              title: "Como posso te ajudar?",
              rows: [
                { id: "paciente_antigo",    title: "Ja sou paciente" },
                { id: "iniciar_tratamento", title: "Quero iniciar tratamento" },
                { id: "agendar_consulta",   title: "Agendar consulta" },
                { id: "falar_atendente",    title: "Falar com um atendente" },
                { id: "tirar_duvidas",      title: "Tirar duvidas" }
              ]
            }]
          }
        }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 }
    );
  } catch (e) {
    console.error("Menu falhou:", e.response?.data || e.message);
    await enviarMensagem(to,
      "Para te direcionar corretamente:\n\n1. Ja sou paciente\n2. Quero iniciar tratamento\n3. Agendar consulta\n4. Falar com um atendente\n5. Tirar duvidas"
    );
  }
}

// ==========================
// ENVIAR MENSAGEM
// ==========================
async function enviarMensagem(to, mensagem) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: mensagem, preview_url: false }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 }
    );
  } catch (e) {
    console.error("Erro ao enviar:", e.response?.data || e.message);
  }
}

// ==========================
// PDF ORIENTAÇÃO DE FOTOS
// ==========================
async function enviarPdfOrientacaoFotos(to) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: {
          link: "https://drive.google.com/uc?export=download&id=1oYzUwyC1EdWpIZUb9dQDvwG1ipM1zdqz",
          filename: "Guia de Orientacoes para Fotos - HairTech.pdf"
        }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
  } catch (e) {
    console.error("Erro ao enviar PDF:", e.response?.data || e.message);
  }
}

// ==========================
// NOTIFICAÇÃO INTERNA
// ==========================
async function notificarClinica(numeroPaciente, motivo) {
  if (!NOTIFY_PHONE) return;
  try {
    const texto = `*HairTech — Novo Interesse*\n\nPaciente: +${numeroPaciente}\nMotivo: ${motivo}\n\nAssuma o atendimento quando possivel.`;
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to: NOTIFY_PHONE, type: "text", text: { body: texto } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 }
    );
  } catch (e) {
    console.error("Erro notificação:", e.response?.data || e.message);
  }
}

// ==========================
// BOTÃO ESPECIALISTA
// ==========================
async function enviarBotaoEspecialista(to) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: "Clique no botao abaixo para falar com um dos nossos especialistas e dar continuidade ao seu agendamento:" },
          action: {
            name: "cta_url",
            parameters: { display_text: "Falar com Especialista", url: "https://wa.me/message/AYEFKCOTY24ZC1" }
          }
        }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 }
    );
  } catch (e) {
    console.error("Botão falhou:", e.response?.data || e.message);
    await enviarMensagem(to, "Para dar continuidade ao seu agendamento:\nhttps://wa.me/message/AYEFKCOTY24ZC1");
  }
}

// ==========================
// UTILITÁRIOS
// ==========================
function dividirMensagem(texto, maxLen = 3900) {
  if (texto.length <= maxLen) return [texto];
  const partes = [];
  let atual = "";
  for (const bloco of texto.split("\n\n")) {
    const tentativa = atual ? atual + "\n\n" + bloco : bloco;
    if (tentativa.length > maxLen) {
      if (atual) partes.push(atual.trim());
      atual = bloco;
    } else {
      atual = tentativa;
    }
  }
  if (atual) partes.push(atual.trim());
  return partes;
}

// ==========================
// ROTAS
// ==========================
app.get("/", (req, res) => res.json({ status: "online", bot: "Clinica HairTech", versao: "3.0" }));

app.get("/status", (req, res) => res.json({
  status: "online",
  conversasAtivas: Object.keys(conversas).length,
  modelo: AI_MODEL,
  consultasAgendadas: Object.keys(lembretes.consultas).length
}));

// API para registrar consulta agendada (usada pelo especialista após confirmar)
app.post("/consulta", (req, res) => {
  const { senha, numero, nome, data, unidade, tipo } = req.body;
  if (senha !== ADMIN_PASS) return res.status(401).json({ erro: "Não autorizado" });
  if (!numero || !data || !unidade) return res.status(400).json({ erro: "numero, data e unidade são obrigatórios" });

  const id = lembretes.agendarLembrete(numero, {
    nome,
    data: new Date(data),
    unidade,
    tipo: tipo || "consulta"
  });

  res.json({ ok: true, id });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HairTech Bot v3.0 rodando na porta ${PORT}`);
  console.log(`Painel: /admin?senha=${ADMIN_PASS}`);
});
