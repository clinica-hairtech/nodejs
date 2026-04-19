const express = require("express");
const axios = require("axios");
const SYSTEM_PROMPT = require("./systemPrompt");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "openai/gpt-4o-mini";
const NOTIFY_PHONE = process.env.NOTIFY_PHONE || "5521967813366";

// Conversation history per user (in-memory)
const conversas = {};
const idsProcessados = new Set();

// Clear processed IDs hourly
setInterval(() => idsProcessados.clear(), 60 * 60 * 1000);

// Clear inactive conversations after 24h
setInterval(() => {
  const limite = Date.now() - 24 * 60 * 60 * 1000;
  for (const numero in conversas) {
    if (conversas[numero].ultimaAtividade < limite) {
      delete conversas[numero];
    }
  }
}, 60 * 60 * 1000);

// ==========================
// VERIFICAÇÃO DO WEBHOOK
// ==========================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado com sucesso");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ==========================
// RECEBER MENSAGENS
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responde imediatamente ao WhatsApp

  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    // Deduplicação
    const msgId = message.id;
    if (idsProcessados.has(msgId)) return;
    idsProcessados.add(msgId);

    const from = message.from;
    let userMessage = "";

    if (message.type === "text") {
      userMessage = message.text.body;
    } else if (message.type === "image") {
      userMessage = "[O paciente enviou uma imagem]";
    } else if (message.type === "audio" || message.type === "voice") {
      userMessage = "[O paciente enviou um áudio]";
    } else if (message.type === "document") {
      userMessage = "[O paciente enviou um documento]";
    } else if (message.type === "interactive") {
      const interactive = message.interactive;
      if (interactive.type === "button_reply") {
        userMessage = interactive.button_reply.title;
      } else if (interactive.type === "list_reply") {
        userMessage = interactive.list_reply.title;
      } else {
        return;
      }
    } else {
      return;
    }

    console.log(`[${from}] ${userMessage.substring(0, 120)}`);

    const resposta = await obterRespostaIA(from, userMessage);

    // Detecta marcadores especiais na resposta da IA
    if (resposta.includes("[BOTAO_ESPECIALISTA]")) {
      const textoAntes = resposta.split("[BOTAO_ESPECIALISTA]")[0].trim();
      if (textoAntes) await enviarMensagem(from, textoAntes);
      await new Promise(r => setTimeout(r, 500));
      await enviarBotaoEspecialista(from);
      await notificarClinica(from, "Comprovante recebido — paciente encaminhado para especialista");
    } else {
      // Detecta outros momentos de alto interesse
      if (resposta.includes("[NOTIF_AGENDAMENTO]")) {
        await notificarClinica(from, "Paciente confirmou interesse em agendar consulta");
      }
      if (resposta.includes("[NOTIF_TRANSPLANTE]")) {
        await notificarClinica(from, "Paciente com interesse em transplante capilar");
      }

      const respostaLimpa = resposta
        .replace(/\[NOTIF_AGENDAMENTO\]/g, "")
        .replace(/\[NOTIF_TRANSPLANTE\]/g, "")
        .trim();

      const partes = dividirMensagem(respostaLimpa);
      for (const parte of partes) {
        await enviarMensagem(from, parte);
        if (partes.length > 1) await new Promise(r => setTimeout(r, 600));
      }
    }

  } catch (error) {
    console.error("Erro no webhook:", error.message);
  }
});

// ==========================
// RESPOSTA DA IA
// ==========================
async function obterRespostaIA(numero, mensagem) {
  if (!conversas[numero]) {
    conversas[numero] = { historico: [], ultimaAtividade: Date.now() };
  }

  conversas[numero].ultimaAtividade = Date.now();
  conversas[numero].historico.push({ role: "user", content: mensagem });

  // Manter últimas 30 mensagens (15 trocas)
  if (conversas[numero].historico.length > 30) {
    conversas[numero].historico = conversas[numero].historico.slice(-30);
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...conversas[numero].historico
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

    const aiResponse = response.data.choices[0].message.content;
    conversas[numero].historico.push({ role: "assistant", content: aiResponse });
    return aiResponse;

  } catch (error) {
    console.error("Erro na IA:", error.response?.data || error.message);
    return "Desculpa, tive uma dificuldade técnica agora. Pode repetir sua mensagem?";
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
        to: to,
        type: "text",
        text: { body: mensagem, preview_url: false }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );
  } catch (error) {
    console.error("Erro ao enviar:", error.response?.data || error.message);
  }
}

// ==========================
// NOTIFICAÇÃO INTERNA CLÍNICA
// ==========================
async function notificarClinica(numeroPaciente, motivo) {
  if (!NOTIFY_PHONE) return;
  try {
    const texto = `*HairTech — Novo Interesse*\n\nPaciente: +${numeroPaciente}\nMotivo: ${motivo}\n\nAssuma o atendimento quando possível.`;
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: NOTIFY_PHONE,
        type: "text",
        text: { body: texto }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );
    console.log(`Notificação enviada para clínica: ${motivo}`);
  } catch (error) {
    console.error("Erro ao notificar clínica:", error.response?.data || error.message);
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
        to: to,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: {
            text: "Clique no botão abaixo para falar com um dos nossos especialistas e dar continuidade ao seu agendamento:"
          },
          action: {
            name: "cta_url",
            parameters: {
              display_text: "Falar com Especialista",
              url: "https://wa.me/message/AYEFKCOTY24ZC1"
            }
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );
  } catch (error) {
    // Fallback: envia link como texto se o botão falhar
    console.error("Botão falhou, enviando como texto:", error.response?.data || error.message);
    await enviarMensagem(to, "Para dar continuidade ao seu agendamento, fale com um dos nossos especialistas:\n\nhttps://wa.me/message/AYEFKCOTY24ZC1");
  }
}

// Divide texto longo em partes menores respeitando parágrafos
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
// ROTAS UTILITÁRIAS
// ==========================
app.get("/", (req, res) => {
  res.json({ status: "online", bot: "Clínica HairTech", versao: "2.0" });
});

app.get("/status", (req, res) => {
  res.json({
    status: "online",
    conversasAtivas: Object.keys(conversas).length,
    modelo: AI_MODEL
  });
});

// ==========================
// START SERVIDOR
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HairTech Bot rodando na porta ${PORT}`);
  console.log(`Modelo IA: ${AI_MODEL}`);
});
