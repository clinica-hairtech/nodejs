const express = require("express");
const app = express();

app.use(express.json());

// TOKEN vem do Railway (variável de ambiente)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ROTA DE VERIFICAÇÃO DO WEBHOOK (GET)
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

// ROTA PARA RECEBER MENSAGENS (POST)
app.post("/webhook", (req, res) => {
  console.log("Mensagem recebida:");
  console.log(JSON.stringify(req.body, null, 2));

  return res.sendStatus(200);
});

// ROTA TESTE
app.get("/", (req, res) => {
  res.send("Servidor rodando");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
