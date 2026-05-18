// Anonimizacao de PII antes de chamar IA cloud.
// LGPD art. 11 + 12: dados sensiveis nao devem sair sem necessidade.
// Estrategia: substituir CPF/RG/CNPJ/email/telefone/nome por tokens reversiveis.
// Retorna { texto_anon, mapa } - mapa permite restaurar a resposta da IA.

const crypto = require("crypto");

// Padroes regex (ordem importa - mais especificos primeiro)
const PADROES = [
  { tipo: "CPF", regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
  { tipo: "CNPJ", regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g },
  { tipo: "CEP", regex: /\b\d{5}-?\d{3}\b/g },
  { tipo: "EMAIL", regex: /\b[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
  { tipo: "TEL_BR", regex: /(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)9?\d{4}[\s-]?\d{4}/g },
  { tipo: "CARTAO", regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
];

function gerarToken(tipo, contador) {
  return `[${tipo}_${contador}]`;
}

// Anonimiza nome se passado explicitamente (heuristica de nome puro nao confiavel)
function anonimizar(texto, opcoes = {}) {
  if (!texto || typeof texto !== "string") return { texto_anon: texto, mapa: {} };
  let resultado = texto;
  const mapa = {};
  const contadores = {};

  for (const { tipo, regex } of PADROES) {
    resultado = resultado.replace(regex, (match) => {
      if (Object.values(mapa).includes(match)) {
        return Object.entries(mapa).find(([_, v]) => v === match)[0];
      }
      contadores[tipo] = (contadores[tipo] || 0) + 1;
      const token = gerarToken(tipo, contadores[tipo]);
      mapa[token] = match;
      return token;
    });
  }

  // Nome explicito (passado pelo chamador, ja conhecido)
  if (opcoes.nomePaciente && opcoes.nomePaciente.length > 2) {
    contadores.NOME = (contadores.NOME || 0) + 1;
    const token = gerarToken("NOME", 1);
    const escapadoRegex = new RegExp(opcoes.nomePaciente.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (escapadoRegex.test(resultado)) {
      resultado = resultado.replace(escapadoRegex, token);
      mapa[token] = opcoes.nomePaciente;
    }
  }

  return { texto_anon: resultado, mapa };
}

// Restaura tokens em uma resposta. Mantemos esta funcao caso queira
// inverter o mascaramento no output da IA antes de enviar ao paciente.
function desanonimizar(texto, mapa) {
  if (!texto || !mapa) return texto;
  let resultado = texto;
  for (const [token, valor] of Object.entries(mapa)) {
    resultado = resultado.split(token).join(valor);
  }
  return resultado;
}

// Hash deterministico (mesma string -> mesmo hash) pra usar como ID
// quando nao queremos guardar o texto mas precisamos comparar.
function hashPII(texto) {
  if (!texto) return null;
  return crypto.createHash("sha256").update(String(texto).trim().toLowerCase()).digest("hex").slice(0, 16);
}

module.exports = { anonimizar, desanonimizar, hashPII };
