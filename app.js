const express = require("express");
const axios = require("axios");
const SYSTEM_PROMPT = require("./systemPrompt");
const iniciarRetomada = require("./retomada");
const adminRouter = require("./admin");
const lembretes = require("./lembretes");
const db = require("./db");
const iniciarRelatorio = require("./relatorio");
const { enviarVideoPersonalizado } = require("./heygen");
const { formatarMensagemAgenda } = require("./calendar");
const criarRoterNfse = require("./nfse");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const VERIFY_TOKEN     = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN   = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID  = process.env.PHONE_NUMBER_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_MODEL         = process.env.AI_MODEL || "anthropic/claude-opus-4-5";
const NOTIFY_PHONE     = process.env.NOTIFY_PHONE || "5521967813366";
const OWNER_PHONE      = process.env.OWNER_PHONE  || "5521967813366";
const ADMIN_PASS       = process.env.ADMIN_PASS || "hairtech2026";

// Estado global das conversas (carregado do banco na inicialização)
const conversas = {};
const idsProcessados = new Set();

// Inicializa banco e carrega conversas
db.init().then(async (ok) => {
  if (ok) {
    const salvas = await db.carregarConversas();
    Object.assign(conversas, salvas);
  }
  // Inicia sistemas automáticos após carregar conversas
  iniciarRetomada(conversas, enviarMensagem);
  lembretes.iniciar(enviarMensagem);
  iniciarRelatorio(conversas, enviarMensagem, OWNER_PHONE);
});

// Sincroniza conversas com banco a cada 2 minutos
setInterval(() => {
  for (const numero in conversas) {
    db.salvarConversa(numero, conversas[numero]).catch(() => {});
  }
}, 2 * 60 * 1000);

// ==========================
// COMANDOS DO DONO (via WhatsApp)
// ==========================
async function processarComando(texto) {
  const t = texto.trim();
  const lower = t.toLowerCase();

  const responder = (msg) => enviarMensagem(OWNER_PHONE, msg);

  // /ajuda
  if (lower === "/ajuda" || lower === "ajuda") {
    return responder(
      "*Comandos disponíveis:*\n\n" +
      "*/status* — resumo das conversas ativas\n" +
      "*/relatorio* — relatorio completo da semana\n" +
      "*/todos [msg]* — enviar para todos os ativos\n" +
      "*/quentes [msg]* — enviar para leads quentes\n" +
      "*/mornos [msg]* — enviar para leads mornos\n" +
      "*/semresposta [msg]* — enviar para quem nao respondeu\n" +
      "*/inativos [msg]* — enviar para inativos ha +48h\n" +
      "*/msg [numero] [texto]* — enviar para um paciente\n" +
      "*/pausar [numero]* — pausar bot para um numero\n" +
      "*/retomar [numero]* — retomar bot para um numero\n\n" +
      "Exemplo: /quentes Ola! Temos uma condicao especial esta semana."
    );
  }

  // /relatorio — sob demanda
  if (lower === "/relatorio" || lower === "relatorio") {
    try {
      const rel = await iniciarRelatorio.gerarRelatorio(conversas);
      return responder(rel);
    } catch (e) {
      return responder("Erro ao gerar relatorio: " + e.message);
    }
  }

  // /status
  if (lower === "/status" || lower === "status") {
    const total   = Object.keys(conversas).length;
    const ativos  = Object.values(conversas).filter(c => c.status === "ativo").length;
    const humanos = Object.values(conversas).filter(c => c.status === "humano").length;
    const quentes = Object.values(conversas).filter(c => c.temperatura === "quente").length;
    const mornos  = Object.values(conversas).filter(c => c.temperatura === "morno").length;
    const frios   = Object.values(conversas).filter(c => c.temperatura === "frio").length;
    const semResp = Object.values(conversas).filter(c => {
      const h = c.historico || [];
      return h.length > 0 && h[h.length - 1].role === "assistant" && c.status === "ativo";
    }).length;
    return responder(
      `*HairTech — Status atual*\n\n` +
      `Total de conversas: ${total}\n` +
      `Bot ativo: ${ativos}\n` +
      `Com humano: ${humanos}\n\n` +
      `Leads quentes: ${quentes}\n` +
      `Leads mornos: ${mornos}\n` +
      `Leads frios: ${frios}\n` +
      `Aguardando resposta: ${semResp}`
    );
  }

  // /pausar [número]
  if (lower.startsWith("/pausar ")) {
    const numero = t.substring(8).trim().replace(/\D/g, "");
    if (conversas[numero]) {
      conversas[numero].status = "pausado";
      conversas[numero].proximaRetomada = null;
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
      return responder(`Bot pausado para +${numero}.`);
    }
    return responder(`Número +${numero} não encontrado.`);
  }

  // /retomar [número]
  if (lower.startsWith("/retomar ")) {
    const numero = t.substring(9).trim().replace(/\D/g, "");
    if (conversas[numero]) {
      conversas[numero].status = "ativo";
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
      return responder(`Bot retomado para +${numero}.`);
    }
    return responder(`Número +${numero} não encontrado.`);
  }

  // /msg [número] [texto]
  if (lower.startsWith("/msg ")) {
    const partes = t.substring(5).trim().split(" ");
    const numero = partes[0].replace(/\D/g, "");
    const mensagem = partes.slice(1).join(" ");
    if (!numero || !mensagem) return responder("Uso: /msg [número] [texto]");
    await enviarMensagem(numero, mensagem);
    if (conversas[numero]) {
      conversas[numero].historico.push({ role: "assistant", content: mensagem });
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
    }
    return responder(`Mensagem enviada para +${numero}.`);
  }

  // Funções de envio em massa
  async function enviarEmMassa(filtro, mensagem) {
    const alvos = Object.entries(conversas).filter(([, c]) => filtro(c));
    if (alvos.length === 0) return responder("Nenhum paciente encontrado com esse filtro.");
    await responder(`Enviando para ${alvos.length} paciente(s)... Aguarde.`);
    let enviados = 0;
    for (const [numero, c] of alvos) {
      try {
        await enviarMensagem(numero, mensagem);
        c.historico.push({ role: "assistant", content: mensagem });
        db.salvarConversa(numero, c).catch(() => {});
        enviados++;
        await new Promise(r => setTimeout(r, 800));
      } catch (_) {}
    }
    return responder(`Concluido. Mensagem enviada para ${enviados} paciente(s).`);
  }

  // /todos [msg]
  if (lower.startsWith("/todos ")) {
    const msg = t.substring(7).trim();
    return enviarEmMassa(c => c.status === "ativo", msg);
  }

  // /quentes [msg]
  if (lower.startsWith("/quentes ")) {
    const msg = t.substring(9).trim();
    return enviarEmMassa(c => c.status === "ativo" && c.temperatura === "quente", msg);
  }

  // /mornos [msg]
  if (lower.startsWith("/mornos ")) {
    const msg = t.substring(8).trim();
    return enviarEmMassa(c => c.status === "ativo" && c.temperatura === "morno", msg);
  }

  // /semresposta [msg] — bot enviou último, paciente não respondeu
  if (lower.startsWith("/semresposta ")) {
    const msg = t.substring(13).trim();
    return enviarEmMassa(c => {
      const h = c.historico || [];
      return c.status === "ativo" && h.length > 0 && h[h.length - 1].role === "assistant";
    }, msg);
  }

  // /inativos [msg] — sem atividade há mais de 48h
  if (lower.startsWith("/inativos ")) {
    const msg = t.substring(10).trim();
    const limite = Date.now() - 48 * 60 * 60 * 1000;
    return enviarEmMassa(c => c.status === "ativo" && c.ultimaAtividade < limite, msg);
  }

  // Comando não reconhecido
  return responder(`Comando nao reconhecido. Envie */ajuda* para ver os comandos disponíveis.`);
}

// ==========================
// CLASSIFICAÇÃO DE LEAD
// ==========================
function classificarLead(texto) {
  const t = texto.toLowerCase();
  if (/(quero agendar|quero marcar|vou fazer|quero fazer|confirmar|pagar|fechar|marcar consulta|agendar agora)/.test(t)) return "quente";
  if (/(transplante|calvic|quanto custa|qual o valor|valor da|custo|consulta|tratamento|interesse|gostaria|queda|cabelo|alopecia|mmp|falha|entrad)/.test(t)) return "morno";
  return "frio";
}

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
app.use("/admin", adminRouter(conversas, enviarMensagem));
app.use("/nfse", criarRoterNfse(enviarMensagem, NOTIFY_PHONE, ADMIN_PASS));

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

    // Comandos do Dr. Ricardo
    if (from === OWNER_PHONE && message.type === "text") {
      await processarComando(message.text.body);
      return;
    }

    // Inicializa conversa se nova
    if (!conversas[from]) {
      conversas[from] = {
        historico: [],
        ultimaAtividade: Date.now(),
        status: "ativo",
        tipo: "novo",
        retomadas: 0,
        proximaRetomada: null,
        temperatura: "frio",
        genero: null
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
      const imageId = message.image.id;
      const tipo = await analisarImagem(imageId);
      userMessage = `[IMAGEM: ${tipo}]`;

      // Encaminha foto de cabelo para o Dr. Ricardo avaliar
      if (tipo === "FOTO_CABELO") {
        encaminharFotoParaClinica(from, imageId).catch(e =>
          console.error("Erro ao encaminhar foto:", e.message)
        );
        c.aguardandoAvaliacao = true;
      }
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

    // Atualiza temperatura do lead
    const novaTemp = classificarLead(userMessage);
    if (novaTemp === "quente") c.temperatura = "quente";
    else if (novaTemp === "morno" && c.temperatura !== "quente") c.temperatura = "morno";

    // Detecta gênero do paciente
    if (!c.genero) {
      const tg = userMessage.toLowerCase();
      if (/(sou mulher|sou feminino|paciente mulher|\bela\b|minha filha|minha esposa|\bfeminina\b)/.test(tg)) c.genero = "feminino";
      else if (/(sou homem|sou masculino|paciente homem|\bele\b|meu filho|meu marido|\bmasculino\b)/.test(tg)) c.genero = "masculino";
    }

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

    // Persiste no banco de forma assíncrona
    db.salvarConversa(from, conversas[from]).catch(() => {});
    db.salvarMensagem(from, "user", userMessage).catch(() => {});
    db.salvarMensagem(from, "assistant", resposta).catch(() => {});

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
    await new Promise(r => setTimeout(r, 2000));
    await enviarMensagem(from, "Um detalhe importante: para garantir a melhor análise na tricoscopia, pedimos que evite lavar o cabelo nas 24 a 48 horas antes da consulta.");
    await notificarClinica(from, "Paciente encaminhado para especialista — aguardando Pix");
    conversas[from].status = "humano";
    conversas[from].proximaRetomada = null;
    // Vídeo HeyGen apenas para transplante (maior valor — economiza créditos)
    if (conversas[from]?.tipo === "transplante") {
      setTimeout(() => enviarVideoPersonalizado(from, "transplante").catch(() => {}), 3000);
    }
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
  if (resposta.includes("[HUMANO]")) {
    conversas[from].status = "humano";
    conversas[from].proximaRetomada = null;
  }

  const enviarFotoM = resposta.includes("[PDF_FOTOS_M]");
  const enviarFotoF = resposta.includes("[PDF_FOTOS_F]");
  const enviarPdf   = resposta.includes("[PDF_FOTOS]");

  const limpa = resposta
    .replace(/\[NOTIF_AGENDAMENTO\]/g, "")
    .replace(/\[NOTIF_TRANSPLANTE\]/g, "")
    .replace(/\[PDF_FOTOS_M\]/g, "")
    .replace(/\[PDF_FOTOS_F\]/g, "")
    .replace(/\[PDF_FOTOS\]/g, "")
    .replace(/\[HUMANO\]/g, "")
    .trim();

  const partes = dividirMensagem(limpa);
  for (const parte of partes) {
    await enviarMensagem(from, parte);
    if (partes.length > 1) await new Promise(r => setTimeout(r, 700));
  }

  if (enviarPdf || enviarFotoM || enviarFotoF) {
    await new Promise(r => setTimeout(r, 800));
    if (enviarFotoM) await enviarGuiaFotos(from, "masculino");
    else if (enviarFotoF) await enviarGuiaFotos(from, "feminino");
    else await enviarPdfOrientacaoFotos(from);
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
// GUIA DE FOTOS POR GÊNERO
// ==========================
const GUIA_FOTOS_URL = {
  masculino: process.env.GUIA_FOTOS_M || "https://lh3.googleusercontent.com/d/18Hw5UpfApl0CG5mPUdSCtsAoKysEEvBd",
  feminino:  process.env.GUIA_FOTOS_F || "https://lh3.googleusercontent.com/d/1yFMQhCURScmw0SjHsASbkzVBSGl6CzLc"
};

async function enviarGuiaFotos(to, genero) {
  const url = GUIA_FOTOS_URL[genero];
  if (!url) return;
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: {
          link: url,
          caption: "Use essa imagem como referencia para os angulos das fotos."
        }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
  } catch (e) {
    console.error("Erro ao enviar guia de fotos:", e.response?.data || e.message);
  }
}

// ==========================
// ENCAMINHAR FOTO PARA CLÍNICA
// ==========================
async function encaminharFotoParaClinica(from, imageId) {
  if (!NOTIFY_PHONE) return;
  try {
    // Obtém URL da imagem
    const meta = await axios.get(
      `https://graph.facebook.com/v18.0/${imageId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 10000 }
    );
    const imageUrl = meta.data.url;
    const mimeType = meta.data.mime_type || "image/jpeg";

    // Baixa a imagem
    const imgResp = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      timeout: 15000
    });

    // Faz upload para WhatsApp Media API
    const blob = new Blob([imgResp.data], { type: mimeType });
    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("type", mimeType);
    formData.append("file", blob, "foto_paciente.jpg");

    const uploadResp = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/media`,
      { method: "POST", headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, body: formData }
    );
    const uploadData = await uploadResp.json();

    if (!uploadData.id) {
      console.error("Upload falhou:", uploadData);
      return;
    }

    // Envia para o Dr. Ricardo
    const caption = `*HairTech — Foto para avaliacao*\nPaciente: +${from}\n\nAnalise e use o painel /admin para dar continuidade ao atendimento.`;
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: NOTIFY_PHONE,
        type: "image",
        image: { id: uploadData.id, caption }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 }
    );

    console.log(`Foto encaminhada para clinica: paciente ${from}`);
  } catch (e) {
    console.error("Erro ao encaminhar foto:", e.response?.data || e.message);
  }
}

// ==========================
// NOTIFICAÇÃO INTERNA
// ==========================
async function notificarClinica(numeroPaciente, motivo) {
  if (!NOTIFY_PHONE) return;
  try {
    const temp = conversas[numeroPaciente]?.temperatura || "frio";
    const emoji = temp === "quente" ? "LEAD QUENTE" : temp === "morno" ? "Lead morno" : "Lead frio";
    const texto = `*HairTech — ${emoji}*\n\nPaciente: +${numeroPaciente}\nMotivo: ${motivo}\n\nAssuma o atendimento quando possivel.`;
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

app.get("/status", async (req, res) => {
  const metricas = await db.buscarMetricas().catch(() => null);
  res.json({
    status: "online",
    conversasAtivas: Object.keys(conversas).length,
    modelo: AI_MODEL,
    consultasAgendadas: Object.keys(lembretes.consultas).length,
    banco: !!db.pool,
    metricas
  });
});

// API para registrar consulta agendada (usada pelo especialista após confirmar)
app.post("/consulta", async (req, res) => {
  const { senha, numero, nome, data, unidade, tipo } = req.body;
  if (senha !== ADMIN_PASS) return res.status(401).json({ erro: "Não autorizado" });
  if (!numero || !data || !unidade) return res.status(400).json({ erro: "numero, data e unidade são obrigatórios" });

  const dataObj = new Date(data);

  const id = lembretes.agendarLembrete(numero, {
    nome,
    data: dataObj,
    unidade,
    tipo: tipo || "consulta"
  });

  // Envia link do Google Calendar para Dr. Ricardo
  try {
    const msgAgenda = formatarMensagemAgenda({ nome, data: dataObj, unidade, tipo, numero });
    await enviarMensagem(NOTIFY_PHONE, msgAgenda);
  } catch (_) {}

  res.json({ ok: true, id });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HairTech Bot v3.0 rodando na porta ${PORT}`);
  console.log(`Painel: /admin?senha=${ADMIN_PASS}`);
});
