const express = require('express');
const app = express();

app.use(express.json());

// TESTE NO NAVEGADOR
app.get('/webhook', (req, res) => {
  res.send('Webhook ativo');
});

// RECEBER POST
app.post('/webhook', (req, res) => {
  console.log('Recebido:', req.body);
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Servidor rodando na porta', PORT);
});
