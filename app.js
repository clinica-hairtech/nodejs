const express = require('express');
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "meutoken123";

// VERIFICAÇÃO DA META
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado!');
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// TESTE SIMPLES
app.get('/', (req, res) => {
  res.send('Servidor rodando');
});

// RECEBER MENSAGENS
app.post('/webhook', (req, res) => {
  console.log('Recebido:', req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Servidor rodando na porta', PORT);
});
