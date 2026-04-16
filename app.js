const express = require("express");
const app = express();

app.use(express.json());

// TOKEN DE VERIFICAÇÃO (tem que ser igual ao da Meta)
const VERIFY_TOKEN = "hairtech_token_2026";

// ROTA DE VERIFICAÇÃO DO WEBHOOK (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("WEBHOOK VERIFICADO");
    return res.status(200).send(challenge);
  } else {
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
