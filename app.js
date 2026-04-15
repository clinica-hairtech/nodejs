const express = require('express');
const app = express();

app.use(express.json());

// rota principal
app.get('/', (req, res) => {
  res.send('Servidor online 🚀');
});

// webhook (ESSA É A PARTE IMPORTANTE)
app.post('/webhook', (req, res) => {
  console.log('Webhook recebido:', req.body);

  res.status(200).json({
    status: 'ok'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
