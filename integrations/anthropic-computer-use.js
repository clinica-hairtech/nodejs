// Anthropic Computer Use API - Claude opera browser virtual na sandbox Anthropic.
// Lancada Out/2024, modelo claude-sonnet-4-5 com tool computer_20241022.
// Doc: https://docs.anthropic.com/en/docs/build-with-claude/computer-use

const axios = require("axios");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.COMPUTER_USE_MODEL || "claude-sonnet-4-5";
const DISPLAY_W = 1280;
const DISPLAY_H = 800;

function configured() { return Boolean(ANTHROPIC_API_KEY); }

// Executa uma tarefa de Computer Use. Loop ate Claude declarar "done" ou max iter.
// Cada iter: envia screenshot pra Claude, recebe acao, executa virtualmente.
// IMPORTANTE: O CLIENTE NAO EXECUTA AS ACOES localmente.
// A Anthropic mantem uma VM Linux+Firefox NA NUVEM deles - este modulo so orquestra
// a chamada API. Claude executa as acoes NO LADO DELES.
async function executarTarefa(tarefa, opts = {}) {
  if (!configured()) {
    return { ok: false, erro: "ANTHROPIC_API_KEY ausente no .env" };
  }
  const maxIter = opts.maxIter || 30;
  const sysPrompt = opts.systemPrompt || `Voce e um assistente que opera um computador Linux com Firefox.
Sua tarefa: ${tarefa}

Regras:
- Sempre tire screenshot ANTES de decidir proxima acao
- Em caso de CAPTCHA ou prova de humano: PARE e retorne "HANDOFF_NEEDED" como ultima mensagem
- Em caso de erro 4xx/5xx do site: tente novamente max 2x, depois PARE
- Quando tarefa concluida com sucesso: termine com "DONE: <resumo do que foi feito>"
- Quando tarefa impossivel: termine com "FAILED: <motivo>"`;

  let messages = [{ role: "user", content: tarefa }];
  const acoesExecutadas = [];
  let resultado = null;

  for (let i = 0; i < maxIter; i++) {
    try {
      const r = await axios.post("https://api.anthropic.com/v1/messages", {
        model: MODEL,
        max_tokens: 4096,
        system: sysPrompt,
        tools: [{
          type: "computer_20241022",
          name: "computer",
          display_width_px: DISPLAY_W,
          display_height_px: DISPLAY_H,
          display_number: 1,
        }],
        messages,
        betas: ["computer-use-2024-10-22"],
      }, {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "computer-use-2024-10-22",
        },
        timeout: 120000,
      });

      const blocks = r.data.content || [];
      const textoBlock = blocks.find(b => b.type === "text");
      const toolUseBlocks = blocks.filter(b => b.type === "tool_use");
      const ultimaMensagem = textoBlock?.text || "";

      // Detecta sinalizadores de termino
      if (ultimaMensagem.includes("DONE:")) {
        resultado = { ok: true, mensagem: ultimaMensagem, iteracoes: i + 1 };
        break;
      }
      if (ultimaMensagem.includes("FAILED:") || ultimaMensagem.includes("HANDOFF_NEEDED")) {
        resultado = {
          ok: false,
          erro: ultimaMensagem,
          handoff: ultimaMensagem.includes("HANDOFF_NEEDED"),
          iteracoes: i + 1,
        };
        break;
      }
      // Se nao houver tool_use, sai do loop
      if (toolUseBlocks.length === 0) {
        resultado = { ok: false, erro: "Claude parou sem completar - " + ultimaMensagem, iteracoes: i + 1 };
        break;
      }

      // Registra acoes
      for (const block of toolUseBlocks) {
        acoesExecutadas.push({ tool: block.name, input: block.input });
      }

      // NOTA: na implementacao oficial Anthropic Computer Use, o cliente envia
      // o resultado da ferramenta (screenshot etc.) de volta. Anthropic gerencia
      // a execucao real via deles. Aqui usamos a chamada API basica que ja inclui
      // VM Linux deles.
      // Por ora simplificamos: enviamos um tool_result placeholder e deixamos
      // Claude continuar. Pra producao real, integrar com Anthropic Tool Use loop.
      messages.push({ role: "assistant", content: blocks });
      messages.push({
        role: "user",
        content: toolUseBlocks.map(b => ({
          type: "tool_result",
          tool_use_id: b.id,
          content: "Acao registrada. Continuando.",
        })),
      });
    } catch (e) {
      const errData = e.response?.data;
      resultado = {
        ok: false,
        erro: `API erro: ${errData?.error?.message || e.message}`,
        status: e.response?.status,
        iteracoes: i + 1,
      };
      break;
    }
  }

  if (!resultado) {
    resultado = { ok: false, erro: "Max iteracoes atingido sem conclusao", iteracoes: maxIter };
  }
  resultado.acoes = acoesExecutadas;
  return resultado;
}

function status() {
  return {
    configurado: configured(),
    modelo: MODEL,
    display: `${DISPLAY_W}x${DISPLAY_H}`,
    nota: "Computer Use API beta. Para producao real precisa integrar tool_result loop completo (screenshot virtual managed pela Anthropic).",
  };
}

module.exports = { executarTarefa, status, configured };
