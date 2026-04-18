const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Variáveis do Railway
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ===============================
// VERIFICAÇÃO DO WEBHOOK (GET)
// ===============================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Modo:", mode);
  console.log("Token recebido:", token);
  console.log("Token esperado:", VERIFY_TOKEN);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK VERIFICADO");
    return res.status(200).send(challenge);
  } else {
    console.log("ERRO NA VERIFICAÇÃO");
    return res.sendStatus(403);
  }
});

// ===============================
// FUNÇÃO PARA ENVIAR MENSAGEM
// ===============================
async function enviarMensagem(numero, mensagem) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        type: "text",
        text: { body: mensagem }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Mensagem enviada com sucesso");
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error.response?.data || error.message);
  }
}

// ===============================
// RECEBER MENSAGENS (POST)
// ===============================
app.post("/webhook", (req, res) => {
  console.log("Mensagem recebida:");
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const mensagem =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (mensagem) {
      const numero = mensagem.from;
      const texto = mensagem.text?.body;

      console.log("Número:", numero);
      console.log("Texto:", texto);

      // RESPOSTA AUTOMÁTICA
      enviarMensagem(numero, "Olá! Recebemos sua mensagem 👨‍⚕️ Em breve vamos te responder.");
    }
  } catch (error) {
    console.log("Erro ao processar mensagem");
  }

  res.sendStatus(200);
});

// ===============================
// ROTA TESTE
// ===============================
app.get("/", (req, res) => {
  res.send("Servidor rodando");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
