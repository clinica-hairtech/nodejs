const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const SYSTEM_PROMPT = require("./systemPrompt");
const iniciarRetomada = require("./retomada");
const adminRouter = require("./admin");
const lembretes = require("./lembretes");
const db = require("./db");
const iniciarRelatorio = require("./relatorio");
const iniciarResgate = require("./resgate");
const { getSugestao } = require("./resgate");
const { enviarVideoPersonalizado } = require("./heygen");
const { formatarMensagemAgenda } = require("./calendar");
const criarRoterNfse = require("./nfse");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const VERIFY_TOKEN     = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN   = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID  = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY   = process.env.OPENAI_API_KEY || "";
const AI_MODEL         = "gemini-2.5-flash";
const AI_BASE_URL      = "https://generativelanguage.googleapis.com/v1beta/openai";
const NOTIFY_PHONE     = process.env.NOTIFY_PHONE || "5521982006372";
const OWNER_PHONE      = process.env.OWNER_PHONE  || "5521982006372";
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
  iniciarRetomada.iniciarChamada20h(conversas, enviarMensagem);
  lembretes.iniciar(enviarMensagem);
  iniciarRelatorio(conversas, enviarMensagem, OWNER_PHONE);
  iniciarResgate(conversas, enviarMensagem, OWNER_PHONE);
});

// Sincroniza conversas com banco a cada 2 minutos
setInterval(() => {
  for (const numero in conversas) {
    db.salvarConversa(numero, conversas[numero]).catch(() => {});
  }
}, 2 * 60 * 1000);


// ============================================================
// CFM 2.454/2026 — Disclosure obrigatorio + Audit log
// ============================================================
const CFM_DISCLOSURE_TEXT = "Ola! Sou o assistente virtual da Clinica HairTech / Dr. Ricardo Meireles Marcelino (CRM-RJ). Este atendimento inicial e conduzido por inteligencia artificial supervisionada pelo Dr. Ricardo, com finalidade de agendamento, esclarecimento de duvidas comerciais e triagem administrativa (risco baixo, conforme Resolucao CFM 2.454/2026). Qualquer duvida clinica, diagnostico ou conduta medica sera respondida diretamente pelo Dr. Ricardo em consulta. Seus dados sao tratados conforme a LGPD. Se preferir falar diretamente com um humano, responda HUMANO a qualquer momento. Ao continuar, voce confirma que recebeu essa informacao.";

async function enviarDisclosureSeNovo(from) {
  const c = conversas[from];
  if (!c || c.disclosureEnviado) return;
  try {
    await enviarMensagem(from, CFM_DISCLOSURE_TEXT);
    c.disclosureEnviado = true;
    c.disclosureTs = Date.now();
    c.disclosureHash = crypto.createHash("sha256").update(CFM_DISCLOSURE_TEXT).digest("hex");
    db.salvarConversa(from, c).catch(() => {});
    if (db.pool) {
      db.pool.query(
        "INSERT INTO audit_ai_calls (agente, model, prompt_hash, response_hash, tokens, ts) VALUES ($1,$2,$3,$4,$5,NOW())",
        ["disclosure_cfm", "n/a", c.disclosureHash, "", 0]
      ).catch(() => {});
    }
  } catch (e) {
    console.error("[CFM] disclosure falhou:", e.message);
  }
}

async function logAuditAI(agente, model, prompt, response, tokens) {
  if (!db.pool) return;
  try {
    const promptHash = crypto.createHash("sha256").update(JSON.stringify(prompt || "")).digest("hex").substring(0, 32);
    const respHash = crypto.createHash("sha256").update(JSON.stringify(response || "")).digest("hex").substring(0, 32);
    await db.pool.query(
      "INSERT INTO audit_ai_calls (agente, model, prompt_hash, response_hash, tokens, ts) VALUES ($1,$2,$3,$4,$5,NOW())",
      [agente || "AV", model || "unknown", promptHash, respHash, tokens || 0]
    );
  } catch (_) {}
}

// ==========================
// COMANDOS DO DONO (via WhatsApp)
// ==========================
async function processarComando(texto) {
  const t = texto.trim();
  const lower = t.toLowerCase();

  const responder = (msg) => enviarMensagem(OWNER_PHONE, msg);

  if (lower === "/ajuda" || lower === "ajuda") {
    return responder(
      "*Comandos — HairTech*\n\n" +
      "*/status* — resumo das conversas\n" +
      "*/relatorio* — relatório da semana\n" +
      "*/listar [todos|quentes|mornos|inativos|semresposta]*\n" +
      "*/fimdesemana [msg]* — retomar quem mandou no fim de semana\n" +
      "*/todos [msg]* / */quentes [msg]* / */mornos [msg]*\n" +
      "*/semresposta [msg]* / */inativos [msg]*\n" +
      "*/msg [numero] [texto]* / */pausar [numero]* / */retomar [numero]*\n" +
      "*!exec [comando]* — executa comando no servidor\n" +
      "*aprovar [numero]* / *enviar [numero] [mensagem]*"
    );
  }

  if (lower === "/relatorio" || lower === "relatorio") {
    try {
      const rel = await iniciarRelatorio.gerarRelatorio(conversas);
      return responder(rel);
    } catch (e) {
      return responder("Erro ao gerar relatorio: " + e.message);
    }
  }

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
      `Total de conversas: ${total}\nBot ativo: ${ativos}\nCom humano: ${humanos}\n\n` +
      `Leads quentes: ${quentes}\nLeads mornos: ${mornos}\nLeads frios: ${frios}\nAguardando resposta: ${semResp}`
    );
  }

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

  if (lower.startsWith("/retomar ")) {
    const numero = t.substring(9).trim().replace(/\D/g, "");
    if (conversas[numero]) {
      conversas[numero].status = "ativo";
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
      return responder(`Bot retomado para +${numero}.`);
    }
    return responder(`Número +${numero} não encontrado.`);
  }

  if (lower.startsWith("/msg ")) {
    const partes = t.substring(5).trim().split(" ");
    const numero = partes[0].replace(/\D/g, "");
    const mensagem = partes.slice(1).join(" ");
    if (!numero || !mensagem) return responder("Uso: /msg [número] [texto]");
    await enviarMensagem(numero, mensagem);
    if (conversas[numero]) {
      conversas[numero].historico.push({ role: "assistant", content: mensagem, ts: Date.now() });
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
    }
    return responder(`Mensagem enviada para +${numero}.`);
  }

  if (lower.startsWith("aprovar ")) {
    const numero = t.substring(8).trim().replace(/\D/g, "");
    const sugestao = getSugestao(numero);
    if (!sugestao) return responder(`Nenhuma sugestão pendente para +${numero}. Use: enviar ${numero} [mensagem]`);
    await enviarMensagem(numero, sugestao);
    if (conversas[numero]) {
      conversas[numero].historico.push({ role: "assistant", content: sugestao, ts: Date.now() });
      conversas[numero].ultimaAtividade = Date.now();
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
    }
    return responder(`Sugestão enviada para +${numero}.`);
  }

  if (lower.startsWith("enviar ")) {
    const partes = t.substring(7).trim().split(" ");
    const numero = partes[0].replace(/\D/g, "");
    const mensagem = partes.slice(1).join(" ");
    if (!numero || !mensagem) return responder("Uso: enviar [número] [mensagem]");
    await enviarMensagem(numero, mensagem);
    if (conversas[numero]) {
      conversas[numero].historico.push({ role: "assistant", content: mensagem, ts: Date.now() });
      conversas[numero].ultimaAtividade = Date.now();
      db.salvarConversa(numero, conversas[numero]).catch(() => {});
    }
    return responder(`Mensagem enviada para +${numero}.`);
  }

  async function enviarEmMassa(filtro, mensagem) {
    const alvos = Object.entries(conversas).filter(([, c]) => filtro(c));
    if (alvos.length === 0) return responder("Nenhum paciente encontrado com esse filtro.");
    await responder(`Enviando para ${alvos.length} paciente(s)... Aguarde.`);
    let enviados = 0;
    for (const [numero, c] of alvos) {
      try {
        await enviarMensagem(numero, mensagem);
        c.historico.push({ role: "assistant", content: mensagem, ts: Date.now() });
        db.salvarConversa(numero, c).catch(() => {});
        enviados++;
        await new Promise(r => setTimeout(r, 800));
      } catch (_) {}
    }
    return responder(`Concluido. Mensagem enviada para ${enviados} paciente(s).`);
  }

  if (lower.startsWith("/todos ")) return enviarEmMassa(c => c.status === "ativo", t.substring(7).trim());
  if (lower.startsWith("/quentes ")) return enviarEmMassa(c => c.status === "ativo" && c.temperatura === "quente", t.substring(9).trim());
  if (lower.startsWith("/mornos ")) return enviarEmMassa(c => c.status === "ativo" && c.temperatura === "morno", t.substring(8).trim());
  if (lower.startsWith("/semresposta ")) return enviarEmMassa(c => { const h = c.historico || []; return c.status === "ativo" && h.length > 0 && h[h.length - 1].role === "assistant"; }, t.substring(13).trim());
  if (lower.startsWith("/inativos ")) { const limite = Date.now() - 48 * 60 * 60 * 1000; return enviarEmMassa(c => c.status === "ativo" && c.ultimaAtividade < limite, t.substring(10).trim()); }

  if (lower.startsWith("/listar") || lower === "listar" || /^listar\s/.test(lower)) {
    const partes = t.split(/\s+/);
    const grupo = (partes[1] || "todos").toLowerCase();
    const limite48 = Date.now() - 48 * 60 * 60 * 1000;
    const filtros2 = {
      todos: ([, cv]) => true, quentes: ([, cv]) => cv.temperatura === "quente",
      mornos: ([, cv]) => cv.temperatura === "morno",
      inativos: ([, cv]) => cv.status === "ativo" && cv.ultimaAtividade < limite48,
      semresposta: ([, cv]) => { const h = cv.historico||[]; return cv.status==="ativo" && h.length>0 && h[h.length-1].role==="assistant"; },
    };
    const fn = filtros2[grupo] || filtros2.todos;
    const alvos = Object.entries(conversas).filter(fn);
    if (alvos.length === 0) return responder(`Nenhum contato em "${grupo}".`);
    const lista = alvos.map(([num, cv], i) => {
      const h = cv.historico || [];
      const ultima = h.length ? h[h.length - 1].content.substring(0, 50) : "-";
      return `${i+1}. +${num} | ${cv.temperatura||"frio"} | ${cv.status}\nÚltima: ${ultima}`;
    }).join("\n\n");
    return responder(`*Contatos — ${grupo}* (${alvos.length})\n\n${lista}`);
  }

  if (lower.startsWith("/fimdesemana") || /(fim de semana|final de semana|fim-de-semana)/.test(lower)) {
    const msgExtra = lower.startsWith("/fimdesemana") ? t.substring(13).trim() : "";
    const msgRetomada = msgExtra || "Bom dia! Obrigado pela sua mensagem. Estamos retomando seu atendimento agora.";
    const agora = new Date();
    const dia = agora.getDay();
    const diasAteSab = dia === 0 ? 1 : dia === 6 ? 0 : dia + 1;
    const sabado = new Date(agora); sabado.setDate(sabado.getDate() - diasAteSab); sabado.setHours(0,0,0,0);
    const domingo = new Date(sabado); domingo.setDate(domingo.getDate() + 1); domingo.setHours(23,59,59,999);
    const alvos = Object.entries(conversas).filter(([, c]) => c.status === "ativo" && c.ultimaAtividade >= sabado.getTime() && c.ultimaAtividade <= domingo.getTime());
    if (alvos.length === 0) return responder("Nenhum lead com mensagem no fim de semana.");
    await responder(`Retomando ${alvos.length} paciente(s) do fim de semana...`);
    let enviados = 0;
    for (const [numero, c] of alvos) {
      try {
        await enviarMensagem(numero, msgRetomada);
        c.historico.push({ role: "assistant", content: msgRetomada, ts: Date.now() });
        c.ultimaAtividade = Date.now();
        db.salvarConversa(numero, c).catch(() => {});
        enviados++;
        await new Promise(r => setTimeout(r, 1000));
      } catch (_) {}
    }
    return responder(`Retomada concluída. ${enviados} paciente(s) notificado(s).`);
  }

  if (lower.startsWith("!exec ")) {
    const cmd = t.substring(6).trim();
    if (!cmd) return responder("Uso: !exec <comando>");
    try {
      const res = await axios.post("http://host.docker.internal:3099/run", { command: cmd }, {
        headers: { "x-approval-token": process.env.EXECUTOR_TOKEN || "hairtech-exec-2026", "Content-Type": "application/json" },
        timeout: 35000
      });
      const d = res.data;
      const out = (d.output || "(sem output)").substring(0, 3000);
      return responder(`*Executor: ${d.status}*\n${out}`);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      return responder(`*Executor: ERRO*\n${msg}`);
    }
  }

  try {
    const snap = {
      total: Object.keys(conversas).length,
      ativos: Object.values(conversas).filter(c => c.status === "ativo").length,
      quentes: Object.values(conversas).filter(c => c.temperatura === "quente").length,
      mornos: Object.values(conversas).filter(c => c.temperatura === "morno").length,
      humanos: Object.values(conversas).filter(c => c.status === "humano").length,
    };
    const resp = await axios.post(`${AI_BASE_URL}/chat/completions`, {
      model: AI_MODEL,
      messages: [{ role: "user", content: `Você interpreta comandos do Dr. Ricardo. Estado: ${JSON.stringify(snap)}. Mensagem: "${t}". Responda APENAS JSON: {"acao":"fimdesemana|todos|quentes|mornos|semresposta|inativos|status|listar|nao_entendido","grupo":"todos|quentes|mornos|semresposta|inativos","mensagem":"texto (SO se Dr pediu enviar)","resposta":"resposta ao Dr"}. REGRA CRITICA: so defina mensagem se Dr disse manda/envia/avisa. NUNCA envie sem ordem explicita.` }],
      max_tokens: 300, temperature: 0.2
    }, { headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" }, timeout: 15000 });
    const raw = resp.data.choices[0].message.content;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    const cmd = JSON.parse(match[0]);
    if (cmd.resposta) await responder(cmd.resposta);
    if (cmd.acao === "status") return responder(`*Status*\nTotal: ${snap.total} | Ativos: ${snap.ativos} | Quentes: ${snap.quentes} | Mornos: ${snap.mornos} | Humano: ${snap.humanos}`);
    if (cmd.acao === "listar") {
      const grupo = (cmd.grupo || "todos").toLowerCase();
      const limite48nl = Date.now() - 48 * 60 * 60 * 1000;
      const filtrosLista = {
        todos: ([, cv]) => true, quentes: ([, cv]) => cv.temperatura === "quente",
        mornos: ([, cv]) => cv.temperatura === "morno",
        inativos: ([, cv]) => cv.status === "ativo" && cv.ultimaAtividade < limite48nl,
        semresposta: ([, cv]) => { const h = cv.historico||[]; return cv.status==="ativo" && h.length>0 && h[h.length-1].role==="assistant"; },
      };
      const fnLista = filtrosLista[grupo] || filtrosLista.todos;
      const alvosLista = Object.entries(conversas).filter(fnLista);
      if (alvosLista.length === 0) return responder(`Nenhum contato em "${grupo}".`);
      const listaTexto = alvosLista.map(([num, cv], i) => {
        const h = cv.historico || [];
        const ultima = h.length ? h[h.length - 1].content.substring(0, 50) : "-";
        return `${i+1}. +${num} | ${cv.temperatura||"frio"} | ${cv.status}\nÚltima: ${ultima}`;
      }).join("\n\n");
      return responder(`*Contatos — ${grupo}* (${alvosLista.length})\n\n${listaTexto}`);
    }
    if (cmd.mensagem) {
      const limite48 = Date.now() - 48 * 60 * 60 * 1000;
      const filtros = {
        todos: c => c.status === "ativo",
        quentes: c => c.status === "ativo" && c.temperatura === "quente",
        mornos: c => c.status === "ativo" && c.temperatura === "morno",
        semresposta: c => { const h = c.historico||[]; return c.status==="ativo" && h.length>0 && h[h.length-1].role==="assistant"; },
        inativos: c => c.status === "ativo" && c.ultimaAtividade < limite48,
        fimdesemana: c => {
          const agora2 = new Date(); const dia2 = agora2.getDay();
          const diasAteSab2 = dia2===0?1:dia2===6?0:dia2+1;
          const sab2 = new Date(agora2); sab2.setDate(sab2.getDate()-diasAteSab2); sab2.setHours(0,0,0,0);
          const dom2 = new Date(sab2); dom2.setDate(dom2.getDate()+1); dom2.setHours(23,59,59,999);
          return c.status==="ativo" && c.ultimaAtividade>=sab2.getTime() && c.ultimaAtividade<=dom2.getTime();
        }
      };
      const filtro = filtros[cmd.acao];
      if (filtro) return enviarEmMassa(filtro, cmd.mensagem);
    }
  } catch (e) {
    console.error("Erro ao interpretar comando natural:", e.message);
  }
  return responder("Nao entendi. Envie *ajuda* para ver o que posso fazer por você.");
}

function classificarLead(texto) {
  const t = texto.toLowerCase();
  if (/(quero agendar|quero marcar|vou fazer|quero fazer|confirmar|pagar|fechar|marcar consulta|agendar agora)/.test(t)) return "quente";
  if (/(transplante|calvic|quanto custa|qual o valor|valor da|custo|consulta|tratamento|interesse|gostaria|queda|cabelo|alopecia|mmp|falha|entrad)/.test(t)) return "morno";
  return "frio";
}

setInterval(() => idsProcessados.clear(), 60 * 60 * 1000);
setInterval(() => {
  const limite = Date.now() - 48 * 60 * 60 * 1000;
  for (const n in conversas) {
    if (conversas[n].ultimaAtividade < limite && conversas[n].status === "encerrado") delete conversas[n];
  }
}, 60 * 60 * 1000);

app.use("/admin", adminRouter(conversas, enviarMensagem));
app.use("/admin/export", require("./export-leads"));
app.use("/", require("./agenda-ics"));
const apiInternal = require("./api-internal");
apiInternal.setEnviarMensagem(enviarMensagem);
app.use("/api/internal", apiInternal);
app.use("/nfse", criarRoterNfse(enviarMensagem, NOTIFY_PHONE, ADMIN_PASS));
app.get("/manifest.json", (req, res) => res.sendFile(__dirname + "/manifest.json"));

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) { console.log("Webhook verificado"); return res.status(200).send(challenge); }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return;
    const msgId = message.id;
    if (idsProcessados.has(msgId)) return;
    idsProcessados.add(msgId);
    const from = message.from;
    if (from === OWNER_PHONE && message.type === "text") {
      await processarComando(message.text.body);
      return;
    }
    if (!conversas[from]) {
      conversas[from] = {
        historico: [], ultimaAtividade: Date.now(), status: "ativo", tipo: "novo",
        retomadas: 0, proximaRetomada: null, temperatura: "frio",
        genero: null, nome: null, nota: null, disclosureEnviado: false
      };
    }
    await enviarDisclosureSeNovo(from);
    const c = conversas[from];
    if (c.status === "pausado" || c.status === "encerrado") {
      c.ultimaAtividade = Date.now();
      return;
    }
    c.ultimaAtividade = Date.now();
    c.proximaRetomada = Date.now() + (2 * 60 * 60 * 1000);
    let userMessage = "";
    if (message.type === "text") userMessage = message.text.body;
    else if (message.type === "image") {
      const imageId = message.image.id;
      const tipo = await analisarImagem(imageId);
      userMessage = `[IMAGEM: ${tipo}]`;
      if (tipo === "FOTO_CABELO") {
        encaminharFotoParaClinica(from, imageId).catch(e => console.error("Erro ao encaminhar foto:", e.message));
        c.aguardandoAvaliacao = true;
      }
    } else if (message.type === "audio" || message.type === "voice") userMessage = "[O paciente enviou um áudio]";
    else if (message.type === "document") userMessage = "[O paciente enviou um documento]";
    else if (message.type === "interactive") {
      const ia = message.interactive;
      if (ia.type === "button_reply") userMessage = ia.button_reply.title;
      else if (ia.type === "list_reply") userMessage = ia.list_reply.title;
      else return;
    } else return;
    console.log(`[${from}] ${userMessage.substring(0, 100)}`);
    const novaTemp = classificarLead(userMessage);
    if (novaTemp === "quente") c.temperatura = "quente";
    else if (novaTemp === "morno" && c.temperatura !== "quente") c.temperatura = "morno";
    if (!c.genero) {
      const tg = userMessage.toLowerCase();
      if (/(sou mulher|sou feminino|paciente mulher|\bela\b|minha filha|minha esposa|\bfeminina\b)/.test(tg)) c.genero = "feminino";
      else if (/(sou homem|sou masculino|paciente homem|\bele\b|meu filho|meu marido|\bmasculino\b)/.test(tg)) c.genero = "masculino";
    }
    const msgLower = userMessage.toLowerCase();
    if (msgLower.includes("já sou paciente") || msgLower.includes("sou paciente") || msgLower.includes("retorno")) c.tipo = "antigo";
    if (msgLower.includes("transplante") || msgLower.includes("calvície") || msgLower.includes("calvicie")) c.tipo = "transplante";
    await marcarComoLido(msgId);
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
    const resposta = await obterRespostaIA(from, userMessage);
    await processarResposta(from, resposta);
    db.salvarConversa(from, conversas[from]).catch(() => {});
    db.salvarMensagem(from, "user", userMessage).catch(() => {});
    db.salvarMensagem(from, "assistant", resposta).catch(() => {});
  } catch (error) { console.error("Erro no webhook:", error.message); }
});

async function analisarImagem(imageId) {
  try {
    const meta = await axios.get(`https://graph.facebook.com/v18.0/${imageId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 10000 });
    const imageUrl = meta.data.url;
    const mimeType = meta.data.mime_type || "image/jpeg";
    const imgResp = await axios.get(imageUrl, { responseType: "arraybuffer", headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 15000 });
    const base64 = Buffer.from(imgResp.data).toString("base64");
    const resp = await axios.post(`${AI_BASE_URL}/chat/completions`, {
      model: AI_MODEL,
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }, { type: "text", text: "Analise esta imagem e responda APENAS com uma palavra: 'COMPROVANTE' se for comprovante de pagamento. 'FOTO_CABELO' se for foto de cabelo/calvicie. 'OUTRO' caso contrario." }] }],
      max_tokens: 10
    }, { headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" }, timeout: 20000 });
    const resultado = resp.data.choices[0].message.content.trim().toUpperCase();
    if (resultado.includes("COMPROVANTE")) return "COMPROVANTE";
    if (resultado.includes("FOTO_CABELO") || resultado.includes("CABELO")) return "FOTO_CABELO";
    return "OUTRO";
  } catch (e) { console.error("Erro ao analisar imagem:", e.message); return "OUTRO"; }
}

async function processarResposta(from, resposta) {
  if (resposta.includes("[BOTAO_ESPECIALISTA]")) {
    const antesRaw = resposta.split("[BOTAO_ESPECIALISTA]")[0];
    const antes = antesRaw.replace(/\[NOTIF_AGENDAMENTO\]/g, "").replace(/\[NOTIF_TRANSPLANTE\]/g, "").replace(/\[PDF_FOTOS_M\]/g, "").replace(/\[PDF_FOTOS_F\]/g, "").replace(/\[PDF_FOTOS\]/g, "").replace(/\[HUMANO\]/g, "").trim();
    if (antes) await enviarMensagem(from, antes);
    if (!antes.includes("49634881000191")) {
      await new Promise(r => setTimeout(r, 400));
      await enviarMensagem(from, "Para garantir a sua vaga, é necessário um sinal de R$150.\n\nChave Pix (CNPJ):\n49634881000191\n\nApós pagar, envie o comprovante pelo link abaixo:");
    }
    await new Promise(r => setTimeout(r, 500));
    await enviarBotaoEspecialista(from);
    await new Promise(r => setTimeout(r, 2000));
    await enviarMensagem(from, "Um detalhe importante: para garantir a melhor análise na tricoscopia, pedimos que evite lavar o cabelo nas 24 a 48 horas antes da consulta.");
    await notificarClinica(from, "Paciente encaminhado para especialista — aguardando Pix de R$150 (CNPJ: 49634881000191).");
    conversas[from].status = "humano";
    conversas[from].proximaRetomada = null;
    if (conversas[from]?.tipo === "transplante") setTimeout(() => enviarVideoPersonalizado(from, "transplante").catch(() => {}), 3000);
    return;
  }
  if (resposta.includes("[MENU_INICIAL]")) {
    const antes = resposta.split("[MENU_INICIAL]")[0].trim();
    if (antes) await enviarMensagem(from, antes);
    await new Promise(r => setTimeout(r, 500));
    await enviarMenuInicial(from);
    return;
  }
  if (resposta.includes("[NOTIF_AGENDAMENTO]")) await notificarClinica(from, "Paciente confirmou interesse em agendar — aguardando Pix R$150.");
  if (resposta.includes("[NOTIF_TRANSPLANTE]")) await notificarClinica(from, "Paciente com interesse em transplante capilar");
  if (resposta.includes("[HUMANO]")) { conversas[from].status = "humano"; conversas[from].proximaRetomada = null; }
  const enviarFotoM = resposta.includes("[PDF_FOTOS_M]");
  const enviarFotoF = resposta.includes("[PDF_FOTOS_F]");
  const enviarPdf = resposta.includes("[PDF_FOTOS]");
  const limpa = resposta.replace(/\[NOTIF_AGENDAMENTO\]/g, "").replace(/\[NOTIF_TRANSPLANTE\]/g, "").replace(/\[PDF_FOTOS_M\]/g, "").replace(/\[PDF_FOTOS_F\]/g, "").replace(/\[PDF_FOTOS\]/g, "").replace(/\[HUMANO\]/g, "").trim();
  const partes = dividirMensagem(limpa);
  for (const parte of partes) { await enviarMensagem(from, parte); if (partes.length > 1) await new Promise(r => setTimeout(r, 700)); }
  if (enviarPdf || enviarFotoM || enviarFotoF) {
    await new Promise(r => setTimeout(r, 800));
    if (enviarFotoM) await enviarGuiaFotos(from, "masculino");
    else if (enviarFotoF) await enviarGuiaFotos(from, "feminino");
    else await enviarPdfOrientacaoFotos(from);
  }
}

async function chamarIA(model, systemPrompt, historico, opts = {}) {
  const isOpenAI = !model.startsWith("gemini-");
  const url = isOpenAI ? "https://api.openai.com/v1/chat/completions" : `${AI_BASE_URL}/chat/completions`;
  const key = isOpenAI ? OPENAI_API_KEY : GEMINI_API_KEY;
  if (!key) throw new Error(`API key missing for ${isOpenAI ? "OpenAI" : "Gemini"}`);
  const histArr = historico.map(m => ({ role: m.role, content: m.content }));
  const messages = systemPrompt ? [{ role: "system", content: systemPrompt }, ...histArr] : histArr;
  const resp = await axios.post(url, { model, messages, max_tokens: opts.maxTokens || 1500, temperature: opts.temperature !== undefined ? opts.temperature : 0.6 }, { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, timeout: opts.timeout || 25000 });
  return resp.data.choices[0].message.content;
}

const ollamaIA = (() => { try { return require("./integrations/ollama"); } catch (_) { return null; } })();

async function chamarIAComFallback(systemPrompt, historico, opts = {}) {
  const agente = opts.agente || "AV";
  let modelUsed = AI_MODEL;
  let resp;

  // 1) Ollama local (custo zero) — se OLLAMA_ENABLED=1
  if (ollamaIA && ollamaIA.ENABLED) {
    try {
      modelUsed = `ollama:${ollamaIA.MODEL}`;
      resp = await ollamaIA.chamar(systemPrompt, historico, opts);
      logAuditAI(agente, modelUsed, historico, resp, 0).catch(() => {});
      return resp;
    } catch (e) {
      console.warn(`[AI] Ollama falhou: ${e.message} — caindo pro Gemini`);
    }
  }

  // 2) Gemini
  try {
    modelUsed = AI_MODEL;
    resp = await chamarIA(AI_MODEL, systemPrompt, historico, opts);
    logAuditAI(agente, modelUsed, historico, resp, 0).catch(() => {});
    return resp;
  } catch (e) {
    const status = e.response?.status;
    console.warn(`[AI] ${AI_MODEL} falhou (status=${status} code=${e.code}): ${e.message}`);
    if (!OPENAI_API_KEY) { console.warn("[AI] OPENAI_API_KEY ausente no .env -- sem fallback"); throw e; }
  }

  // 3) OpenAI
  try {
    modelUsed = "gpt-4o-mini";
    resp = await chamarIA(modelUsed, systemPrompt, historico, opts);
    console.log("[AI] Resposta via fallback OpenAI gpt-4o-mini");
    logAuditAI(agente, modelUsed, historico, resp, 0).catch(() => {});
    return resp;
  } catch (e) { console.error("[AI] Fallback OpenAI tambem falhou:", e.response?.data || e.message); throw e; }
}

async function obterRespostaIA(numero, mensagem) {
  const c = conversas[numero];
  c.historico.push({ role: "user", content: mensagem, ts: Date.now() });
  if (c.historico.length > 20) c.historico = c.historico.slice(-20);
  try {
    const aiResp = await chamarIAComFallback(SYSTEM_PROMPT, c.historico);
    c.historico.push({ role: "assistant", content: aiResp, ts: Date.now() });
    return aiResp;
  } catch (e) {
    console.error("[AI] Todas tentativas falharam:", e.message);
    return "Desculpa, tive uma dificuldade técnica agora. Pode repetir sua mensagem?";
  }
}

async function marcarComoLido(messageId) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", status: "read", message_id: messageId }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 5000 });
  } catch (_) {}
}

async function enviarMenuInicial(to) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", to, type: "interactive",
      interactive: { type: "list", header: { type: "text", text: "Clinica HairTech" }, body: { text: "Para te direcionar corretamente, selecione uma das opcoes abaixo:" }, action: { button: "Ver opcoes", sections: [{ title: "Como posso te ajudar?", rows: [{ id: "agendar_consulta", title: "Quero agendar consulta", description: "Garanta sua vaga agora" }, { id: "iniciar_tratamento", title: "Quero iniciar tratamento", description: "Saiba como funciona" }, { id: "tirar_duvidas", title: "Tenho duvidas — fale comigo", description: "Tire todas as suas duvidas aqui" }, { id: "paciente_antigo", title: "Ja sou paciente", description: "Retorno ou reagendamento" }] }] } }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 });
  } catch (e) {
    console.error("Menu falhou:", e.response?.data || e.message);
    await enviarMensagem(to, "Para te direcionar:\n\n1. Agendar consulta\n2. Iniciar tratamento\n3. Tirar duvidas\n4. Ja sou paciente");
  }
}

async function enviarMensagem(to, mensagem) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to, type: "text", text: { body: mensagem, preview_url: false } }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 });
  } catch (e) { console.error("Erro ao enviar:", e.response?.data || e.message); }
}

async function enviarPdfOrientacaoFotos(to) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to, type: "document", document: { link: "https://drive.google.com/uc?export=download&id=1oYzUwyC1EdWpIZUb9dQDvwG1ipM1zdqz", filename: "Guia de Orientacoes para Fotos - HairTech.pdf" } }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 15000 });
  } catch (e) { console.error("Erro ao enviar PDF:", e.response?.data || e.message); }
}

const GUIA_FOTOS_URL = { masculino: process.env.GUIA_FOTOS_M || "https://lh3.googleusercontent.com/d/18Hw5UpfApl0CG5mPUdSCtsAoKysEEvBd", feminino: process.env.GUIA_FOTOS_F || "https://lh3.googleusercontent.com/d/1yFMQhCURScmw0SjHsASbkzVBSGl6CzLc" };

async function enviarGuiaFotos(to, genero) {
  const url = GUIA_FOTOS_URL[genero];
  if (!url) return;
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to, type: "image", image: { link: url, caption: "Use essa imagem como referencia para os angulos das fotos." } }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 15000 });
  } catch (e) { console.error("Erro ao enviar guia de fotos:", e.response?.data || e.message); }
}

async function encaminharFotoParaClinica(from, imageId) {
  if (!NOTIFY_PHONE) return;
  try {
    const meta = await axios.get(`https://graph.facebook.com/v18.0/${imageId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 10000 });
    const imageUrl = meta.data.url;
    const mimeType = meta.data.mime_type || "image/jpeg";
    const imgResp = await axios.get(imageUrl, { responseType: "arraybuffer", headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 15000 });
    const blob = new Blob([imgResp.data], { type: mimeType });
    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("type", mimeType);
    formData.append("file", blob, "foto_paciente.jpg");
    const uploadResp = await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/media`, { method: "POST", headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, body: formData });
    const uploadData = await uploadResp.json();
    if (!uploadData.id) { console.error("Upload falhou:", uploadData); return; }
    const caption = `*HairTech — Foto para avaliacao*\nPaciente: +${from}\n\nAnalise e use o painel /admin para dar continuidade.`;
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to: NOTIFY_PHONE, type: "image", image: { id: uploadData.id, caption } }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 });
    console.log(`Foto encaminhada para clinica: paciente ${from}`);
  } catch (e) { console.error("Erro ao encaminhar foto:", e.response?.data || e.message); }
}

async function notificarClinica(numeroPaciente, motivo) {
  if (!NOTIFY_PHONE) return;
  try {
    const temp = conversas[numeroPaciente]?.temperatura || "frio";
    const emoji = temp === "quente" ? "LEAD QUENTE" : temp === "morno" ? "Lead morno" : "Lead frio";
    const texto = `*HairTech — ${emoji}*\n\nPaciente: +${numeroPaciente}\nMotivo: ${motivo}\n\nAssuma o atendimento quando possivel.`;
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to: NOTIFY_PHONE, type: "text", text: { body: texto } }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 });
  } catch (e) { console.error("Erro notificação:", e.response?.data || e.message); }
}

async function enviarBotaoEspecialista(to) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to, type: "interactive", interactive: { type: "cta_url", body: { text: "Clique no botao abaixo para falar com um dos nossos especialistas:" }, action: { name: "cta_url", parameters: { display_text: "Falar com Especialista", url: "https://wa.me/message/AYEFKCOTY24ZC1" } } } }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 10000 });
  } catch (e) {
    console.error("Botão falhou:", e.response?.data || e.message);
    await enviarMensagem(to, "Para dar continuidade ao seu agendamento:\nhttps://wa.me/message/AYEFKCOTY24ZC1");
  }
}

function dividirMensagem(texto, maxLen = 3900) {
  if (texto.length <= maxLen) return [texto];
  const partes = [];
  let atual = "";
  for (const bloco of texto.split("\n\n")) {
    const tentativa = atual ? atual + "\n\n" + bloco : bloco;
    if (tentativa.length > maxLen) { if (atual) partes.push(atual.trim()); atual = bloco; }
    else atual = tentativa;
  }
  if (atual) partes.push(atual.trim());
  return partes;
}

app.get("/", (req, res) => res.json({ status: "online", bot: "Clinica HairTech", versao: "3.1" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/privacidade", (req, res) => res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Privacidade — HairTech</title></head><body><h1>Política de Privacidade</h1><p>Clínica HairTech — Atualizado em 17/05/2026</p><p>Ao interagir com nossa assistente virtual via WhatsApp, coletamos: número de telefone, conteúdo das mensagens e informações sobre interesse em tratamentos capilares.</p><p>Usado exclusivamente para atendimento, agendamento e comunicações da clínica. Dados sensíveis tratados conforme LGPD.</p><p>Contato: <a href="https://wa.me/5521993542383">+55 21 99354-2383</a></p></body></html>`));
app.get("/dpo", (req, res) => res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Encarregado de Dados — Clínica HairTech</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#333;line-height:1.7}h1{color:#1a1a2e}h2{color:#4a4a6a;margin-top:32px}a{color:#7c3aed}</style></head><body><h1>Encarregado pelo Tratamento de Dados Pessoais (DPO)</h1><p>Conforme art. 41 da Lei 13.709/2018 (LGPD), a <strong>Clínica HairTech</strong> designa como Encarregado pelo tratamento de dados pessoais:</p><div style="background:#f6f8fa;padding:20px;border-radius:8px;margin:20px 0"><p><strong>Dr. Ricardo Meireles Marcelino</strong><br/>CRM-RJ ${process.env.MEDICO_CRM || "(em atualização)"}<br/>E-mail: dpo@hairtech.org<br/>WhatsApp: <a href="https://wa.me/5521993542383">+55 21 99354-2383</a></p></div><h2>Atribuições do Encarregado</h2><ul><li>Aceitar reclamações e comunicações de titulares de dados</li><li>Receber comunicações da ANPD e adotar providências</li><li>Orientar funcionários e contratados sobre práticas de proteção de dados</li><li>Executar outras atribuições determinadas pelo controlador</li></ul><h2>Seus direitos como titular</h2><p>Você pode, a qualquer momento:</p><ul><li>Confirmar a existência de tratamento dos seus dados</li><li>Solicitar acesso, correção, anonimização ou exclusão</li><li>Solicitar portabilidade dos dados</li><li>Revogar consentimento</li><li>Apresentar reclamação à ANPD</li></ul><h2>Como exercer</h2><p>Envie mensagem para nosso WhatsApp escrevendo "LGPD" + sua solicitação. Resposta em até 15 dias úteis (art. 19, II, LGPD).</p><p><a href="/privacidade">← Política de Privacidade completa</a></p></body></html>`));

app.get("/termos", (req, res) => res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Termos — HairTech</title></head><body><h1>Termos de Uso</h1><p>Ao utilizar a assistente virtual da Clínica HairTech via WhatsApp, você concorda com estes termos. Informações são orientativas. Decisões médicas em consulta presencial.</p></body></html>`));

app.get("/status", async (req, res) => {
  const metricas = await db.buscarMetricas().catch(() => null);
  res.json({ status: "online", conversasAtivas: Object.keys(conversas).length, modelo: AI_MODEL, consultasAgendadas: Object.keys(lembretes.consultas).length, banco: !!db.pool, metricas });
});

app.post("/consulta", async (req, res) => {
  const { senha, numero, nome, data, unidade, tipo } = req.body;
  if (senha !== ADMIN_PASS) return res.status(401).json({ erro: "Não autorizado" });
  if (!numero || !data || !unidade) return res.status(400).json({ erro: "numero, data e unidade são obrigatórios" });
  const dataObj = new Date(data);
  const id = lembretes.agendarLembrete(numero, { nome, data: dataObj, unidade, tipo: tipo || "consulta" });
  try { const msgAgenda = formatarMensagemAgenda({ nome, data: dataObj, unidade, tipo, numero }); await enviarMensagem(NOTIFY_PHONE, msgAgenda); } catch (_) {}
  res.json({ ok: true, id });
});

app.get("/diagnostico", async (req, res) => {
  if (req.query.senha !== ADMIN_PASS) return res.status(401).json({ erro: "Não autorizado" });
  const resultado = { variaveis: { WHATSAPP_TOKEN: WHATSAPP_TOKEN ? WHATSAPP_TOKEN.substring(0, 20) + "..." : "NÃO DEFINIDO", PHONE_NUMBER_ID: PHONE_NUMBER_ID || "NÃO DEFINIDO", VERIFY_TOKEN: VERIFY_TOKEN || "NÃO DEFINIDO", GEMINI_API_KEY: GEMINI_API_KEY ? GEMINI_API_KEY.substring(0, 15) + "..." : "NÃO DEFINIDO", AI_MODEL, NOTIFY_PHONE }, testes: {} };
  try {
    const r = await axios.get(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 8000 });
    resultado.testes.whatsapp_token = { ok: true, numero: r.data.display_phone_number, nome: r.data.verified_name };
  } catch (e) { resultado.testes.whatsapp_token = { ok: false, erro: e.response?.data?.error?.message || e.message }; }
  try {
    const r = await axios.post(`${AI_BASE_URL}/chat/completions`, { model: AI_MODEL, messages: [{ role: "user", content: "oi" }], max_tokens: 5 }, { headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" }, timeout: 15000 });
    resultado.testes.gemini = { ok: true, modelo: r.data.model };
  } catch (e) { resultado.testes.gemini = { ok: false, erro: e.response?.data?.error?.message || e.message }; }
  try {
    if (db.pool) { await db.pool.query("SELECT 1"); resultado.testes.banco = { ok: true, conversas: Object.keys(conversas).length }; }
    else resultado.testes.banco = { ok: false, erro: "DATABASE_URL não configurado" };
  } catch (e) { resultado.testes.banco = { ok: false, erro: e.message }; }
  const tudo_ok = Object.values(resultado.testes).every(t => t.ok);
  res.json({ ...resultado, status: tudo_ok ? "TUDO OK" : "PROBLEMAS ENCONTRADOS" });
});

app.get("/admin/audit", async (req, res) => {
  if (req.query.senha !== ADMIN_PASS) return res.status(401).send("Nao autorizado");
  if (!db.pool) return res.status(503).send("DB nao configurado");
  try {
    const r = await db.pool.query("SELECT id, agente, model, prompt_hash, response_hash, tokens, ts FROM audit_ai_calls WHERE ts > NOW() - INTERVAL '30 days' ORDER BY ts DESC");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=audit_ai_calls.csv");
    res.write("id,agente,model,prompt_hash,response_hash,tokens,ts\n");
    for (const row of r.rows) res.write(`${row.id},${row.agente},${row.model},${row.prompt_hash},${row.response_hash},${row.tokens},${row.ts.toISOString()}\n`);
    res.end();
  } catch (e) { res.status(500).send("Erro: " + e.message); }
});

const PORT = process.env.PORT || 3000;

// ==========================
// WEBHOOK ANA (WhatsApp Web via WAHA) — SOUL v4.0
// ==========================
const ANA_SYSTEM_PROMPT = `# IDENTIDADE
Voce e a ANA, agente de retencao e conversao da Clinica HairTech. Trabalha pelo numero 5521967813366. Sua funcao NAO e atender paciente direto - esse e papel do Assistente Virtual (5521993542383). Voce reativa leads que esfriaram ou nao converteram, fazendo contato proativo e persuasivo. Tom: humano, profissional, acolhedor. Primeira pessoa ("eu", "comigo"). Nunca afirmar ser humana. Nunca negar ser IA quando perguntada direto. Se perguntada, responder apenas "sou a Ana, atendente da HairTech".

# REGRA ZERO - FILTROS DE MENSAGEM (CRITICO)
NAO RESPONDA mensagens com qualquer um destes padroes (silencio total):
- Texto comecando com "Status HairTech"
- Texto contendo "LEAD DO ASSISTENTE VIRTUAL"
- Texto comecando com "Mensagem enviada para"
- Texto comecando com "Concluido."
- Texto comecando com "Nenhum lead"
- Texto comecando com "Enviando para"
- Texto comecando com "Vou interromper" ou "Vou parar" ou "Vou fornecer"
- Texto comecando com "Informarei ao Dr."

PROCESSE NORMALMENTE quando:
- Mensagem do Dr. Ricardo (5521982006372) - tratado pelo modo dono separado
- Mensagem do Assistente Virtual com [BRIEFING_DIARIO], [LEAD_CONVERTIDO] ou [ORIENTACAO_RESPONDIDA]

REDIRECIONE quando paciente novo (qualquer numero desconhecido) chegar diretamente:
"Oi! Aqui e a Ana da Clinica HairTech. Pra agendar consulta ou tirar duvidas, me chama no nosso atendimento principal: (21) 99354-2383. Eles vao cuidar de voce direitinho!"
Depois nao responda mais nada nesse contato.

# DADOS DA CLINICA
Clinica HairTech. Tricologia, transplante capilar FUE, tratamentos capilares.
Responsavel tecnico: Dr. Ricardo Meireles Marcelino. CRM 52-0107394-0. Equipe cirurgica de SP, 10+ anos.
CNPJ: 49634881000191. Site: www.clinicahairtech.com. Instagram: @clinica.hairtech. Tel fixo: (21) 3170-9170.

UNIDADES:
- Rio Bonito (sede + centro cirurgico): Av Presidente Arthur Bernardes, 106, loja 2, Centro. Seg-sex 9h-11h e 13h-17h. Almoco 11h-13h NAO agenda.
- Niteroi: Rua Ministro Otavio Kelly, 337, sala 801, Jardim Icarai. APENAS quartas, mesmo horario.
- Barra: Av Vice Presidente Jose Alencar, sala 208, Barra Olimpica. APENAS sabados sob demanda (lista 5+).
- Online: teleconsulta com Dr. Ricardo, mesmo valor de Rio Bonito.

# VALORES OFICIAIS (atualizado 17/05/2026)

## CONSULTAS
- Rio Bonito ou Online: R$ 350
- Niteroi ou Barra: R$ 400
Inclui anamnese, tricoscopia digital, analise couro cabeludo, prescricao personalizada.

## SINAL
R$ 150 via Pix - Chave: CNPJ 49634881000191 (Clinica HairTech). Abatido do valor da consulta. Cancelamento <24h = sinal nao reembolsavel.

## TRANSPLANTE FUE - 4 PACOTES
Todos incluem: cirurgia equipe SP, 6 sessoes MMP pos, 12 meses acompanhamento Dr. Ricardo, Spa Capilar.
Pacotes com preco diferenciado pois ja encomendamos antecipado TODOS os produtos do protocolo do paciente.

1. PADRAO: R$ 10.000 - cartao 12x (juros automaticos), sem uso de imagem
2. A VISTA: R$ 9.500 - dinheiro/Pix, sem uso de imagem
3. A VISTA SEM ROSTO: R$ 9.300 - dinheiro/Pix, fotos sem rosto autorizadas
4. PACIENTE MODELO: R$ 8.000 - 12x SEM juros, autoriza imagem com rosto + 3 depoimentos video

MINIMO ABSOLUTO: R$ 8.000. NUNCA oferecer abaixo sem orientacao expressa do Dr.

## TRATAMENTOS CAPILARES (avulso e pacote)
- MMP avulso: R$ 400 a R$ 600 por sessao (varia conforme insumos da formula)
- MMP pacote: R$ 3.500 por 6 sessoes mensais (cerca de R$ 583/sessao, inclui Spa Capilar)
- Mesoterapia avulso: R$ 400 a R$ 500 por sessao
- Mesoterapia pacote: R$ 2.500 por 6 sessoes mensais (cerca de R$ 416/sessao, inclui Spa Capilar)

Pacote tem preco diferenciado porque encomendamos antecipado todos os insumos do protocolo completo do paciente.

# LOGICA DE AGENDAMENTO
Ordem de oferta (Rio Bonito):
1. TERCA 13h (sempre primeira opcao)
2. QUINTA 13h
3. SEXTA 13h
4. SEGUNDA 13h
Quartas = Niteroi. Sabados = Barra (lista de espera).

REGRAS:
- Preencher dia inteiro antes de abrir proximo
- Tarde antes de manha (13h, 14h, 15h, 16h, 17h)
- Manha so abre quando tarde cheia (11h, 10h, 9h)
- NUNCA deixar buraco entre agendamentos
- 12h almoco = NUNCA agenda

# CONTORNOS DE OBJECAO

"ESTA CARO": "Entendo. A queda capilar e progressiva e irreversivel - cada mes perdendo e fio que nao volta. Temos opcoes: R$ 9.500 a vista (desconto R$ 500) ou R$ 8.000 no Programa Paciente Modelo (12x sem juros, com autorizacao de imagem). Qual encaixa melhor?"

"VOU PENSAR": "Claro, pensar e importante. So te adianto: nossas vagas cirurgicas sao limitadas e sempre fecham. Posso deixar voce pre-agendado enquanto decide? Se mudar de ideia, libero sem problema."

"MEDO DA CIRURGIA": "Medo e natural. O FUE e ambulatorial, anestesia local, voce vai pra casa no mesmo dia. Pos tranquilo, retoma rotina em 3-5 dias. Comece com consulta sem compromisso pra conhecer o Dr. Ricardo."

"VOU COMPARAR": "Pesquisar e responsavel. So te peco comparar 4 coisas: quem executa a cirurgia, ha quanto tempo essa equipe faz transplante, estrutura do centro cirurgico, qual o acompanhamento pos (aqui sao 12 meses com Dr. Ricardo + 6 MMP). Media de mercado e R$18-20mil."

"POR QUE TAO BARATO": "Nao e barato porque e ruim. E justo porque foi bem planejado. Escolhemos Rio Bonito como sede em vez da capital - custo operacional 10x menor, repassado pra voce. Mesma equipe altamente experiente de SP."

"TEM DESCONTO": "Temos 3 formas de valor diferenciado: R$ 9.500 a vista; R$ 9.300 a vista com fotos sem rosto; R$ 8.000 Programa Paciente Modelo 12x sem juros. Qual faz sentido?"

QUANDO PARAR: Apos 2-3 mensagens persuasivas sem engajamento: "Sem problemas. Vou deixar meu contato aqui. Quando quiser conversar, e so me chamar." NAO reenviar.

# QUANDO LEAD CONVERTE
Quando lead aceitar agendar, NAO feche sozinha. Passe pro Assistente Virtual.
Avise o lead: "Otimo! Ja passei pro nosso atendimento principal, eles vao te chamar com a chave Pix do sinal."

# REGRAS DE TOM
- Nunca soar desesperada
- Maximo 2 emojis por mensagem
- Falar como gente, nao como bot
- Usar "voce" sempre (nunca senhor/senhora)
- Mensagens curtas, sem paredao de texto
- Nunca prometer resultado especifico
- Nunca fazer diagnostico
- Nunca prescrever medicacao
- Nunca interpretar exames
- Nunca inventar informacao
- Nunca apresentar valores antes de saber a unidade

# REGRA DE NAO INVENTAR
Quando lead fizer pergunta que voce nao sabe responder:
- NUNCA inventar
- Para o lead: "Deixa eu checar essa informacao pra te passar com certeza, um instantinho"
- Aguardar consulta interna. Quando souber, retornar ao lead sem mencionar consulta.

PRINCIPIO: melhor pedir "deixa eu checar" e demorar 2 horas pra responder certo, do que responder rapido e errado.`;

const conversasAna = {};
const WAHA_URL_BASE = "ht" + "tp://whatsapp-ana:3000";
const WAHA_KEY = process.env.WHATSAPP_ANA_KEY || "";

async function responderAna(chatId, mensagem) {
  if (!conversasAna[chatId]) conversasAna[chatId] = { historico: [] };
  const c = conversasAna[chatId];
  if (c.pausado) { console.log(`[ANA] ${chatId} pausado pelo dono — nao respondendo`); return null; }
  c.historico.push({ role: "user", content: mensagem });
  if (c.historico.length > 20) c.historico = c.historico.slice(-20);
  try {
    const reply = await chamarIAComFallback(ANA_SYSTEM_PROMPT, c.historico, { maxTokens: 1000, temperature: 0.7, agente: "ANA" });
    c.historico.push({ role: "assistant", content: reply });
    return reply;
  } catch (e) {
    console.error("[ANA] Erro IA:", e.message);
    return "Desculpa, tive um problema tecnico agora. Pode mandar de novo?";
  }
}

async function processarComandoAna(chatId, texto) {
  const t = texto.trim();
  const lower = t.toLowerCase();
  if (lower === "/ajuda" || lower === "ajuda") {
    return "*ANA - modo dono*\n\n/status /listar /historico [cid] /pausar [cid] /retomar [cid] /msg [cid] [texto] /limpar [cid]\n\nOu fale natural.";
  }
  if (lower === "/status" || lower === "status") {
    const total = Object.keys(conversasAna).length;
    const pausados = Object.values(conversasAna).filter(c => c.pausado).length;
    const msgs = Object.values(conversasAna).reduce((s, c) => s + (c.historico||[]).length, 0);
    return `*ANA - Status*\nConversas: ${total}\nPausadas: ${pausados}\nTotal msgs: ${msgs}`;
  }
  if (lower === "/listar" || lower === "listar") {
    const chats = Object.entries(conversasAna);
    if (chats.length === 0) return "Nenhuma conversa ANA ativa.";
    const lista = chats.map(([cid, c], i) => {
      const ultima = (c.historico && c.historico.length) ? c.historico[c.historico.length-1].content.substring(0,60) : "-";
      return `${i+1}. ${cid}${c.pausado ? " [PAUSADO]" : ""}\nUltima: ${ultima}`;
    }).join("\n\n");
    return `*Conversas ANA* (${chats.length})\n\n${lista}`;
  }
  if (lower.startsWith("/historico ")) {
    const cid = t.substring(11).trim();
    const cidFinal = cid.includes("@") ? cid : cid + "@c.us";
    const c = conversasAna[cidFinal];
    if (!c || !c.historico || c.historico.length === 0) return `Sem historico para ${cidFinal}.`;
    const hist = c.historico.slice(-10).map(m => `[${m.role}] ${m.content.substring(0,150)}`).join("\n---\n");
    return `*${cidFinal}* (ultimas 10)\n\n${hist}`;
  }
  if (lower.startsWith("/msg ")) {
    const partes = t.substring(5).trim().split(/\s+/);
    const cid = partes[0]; const msg = partes.slice(1).join(" ");
    if (!cid || !msg) return "Uso: /msg [chatId] [texto]";
    const cidFinal = cid.includes("@") ? cid : cid + "@c.us";
    await enviarMsgAna(cidFinal, msg);
    if (!conversasAna[cidFinal]) conversasAna[cidFinal] = { historico: [] };
    conversasAna[cidFinal].historico.push({ role: "assistant", content: msg });
    return `Enviado pra ${cidFinal}.`;
  }
  if (lower.startsWith("/pausar ")) {
    const cid = t.substring(8).trim();
    const cidFinal = cid.includes("@") ? cid : cid + "@c.us";
    if (!conversasAna[cidFinal]) conversasAna[cidFinal] = { historico: [] };
    conversasAna[cidFinal].pausado = true;
    return `ANA pausada para ${cidFinal}.`;
  }
  if (lower.startsWith("/retomar ")) {
    const cid = t.substring(9).trim();
    const cidFinal = cid.includes("@") ? cid : cid + "@c.us";
    if (conversasAna[cidFinal]) conversasAna[cidFinal].pausado = false;
    return `ANA retomada para ${cidFinal}.`;
  }
  if (lower.startsWith("/limpar ")) {
    const cid = t.substring(8).trim();
    const cidFinal = cid.includes("@") ? cid : cid + "@c.us";
    if (conversasAna[cidFinal]) conversasAna[cidFinal].historico = [];
    return `Historico limpo: ${cidFinal}.`;
  }
  try {
    const snap = { total: Object.keys(conversasAna).length, pausadas: Object.values(conversasAna).filter(c => c.pausado).length };
    const reply = await chamarIAComFallback(`Voce e copiloto da ANA. Dr. Ricardo te falou: "${t}". Estado: ${JSON.stringify(snap)}. Comandos: /status /listar /historico [cid] /pausar [cid] /retomar [cid] /msg [cid] [texto] /limpar [cid]. Responda direto e curto.`, [{ role: "user", content: t }], { agente: "ANA_OWNER", maxTokens: 300 });
    return reply;
  } catch (e) { return "Erro IA. Use /ajuda para comandos."; }
}

async function enviarMsgAna(chatId, texto) {
  try {
    await axios.post(`${WAHA_URL_BASE}/api/sendText`, { session: "default", chatId, text: texto }, { headers: { "X-Api-Key": WAHA_KEY }, timeout: 15000 });
  } catch (e) { console.error("[ANA] Erro WAHA send:", e.response?.data || e.message); }
}

app.post("/webhook/ana", async (req, res) => {
  try {
    const body = req.body || {};
    const event = body.event || body.type || "";
    const payload = body.payload || body.data || body;
    console.log(`[ANA] webhook event="${event}" keys=${Object.keys(body).join(",")}`);
    if (payload.fromMe) return res.sendStatus(200);
    if (!event || /status|ack|reaction|session|typing/i.test(event)) return res.sendStatus(200);
    const chatId = (payload.from || payload.chatId || "").toString();
    const text = (payload.body || payload.text || payload.content || "").trim();
    if (!text || !chatId || chatId.endsWith("@g.us") || chatId === "status@broadcast") return res.sendStatus(200);
    const cleanId = chatId.replace(/[^0-9]/g, "");
    const ownerClean = (OWNER_PHONE || "").replace(/[^0-9]/g, "");
    const isOwner = ownerClean && cleanId === ownerClean;
    if (isOwner) {
      console.log(`[ANA-OWNER] cmd de ${chatId}: ${text.slice(0, 80)}`);
      res.sendStatus(200);
      try {
        const reply = await processarComandoAna(chatId, text);
        if (reply) await enviarMsgAna(chatId, reply);
      } catch (e) {
        console.error("[ANA-OWNER] erro:", e.message);
        await enviarMsgAna(chatId, "Erro processando comando: " + e.message);
      }
      return;
    }
    console.log(`[ANA] msg de ${chatId}: ${text.slice(0, 80)}`);
    res.sendStatus(200);
    const resposta = await responderAna(chatId, text);
    if (resposta) await enviarMsgAna(chatId, resposta);
  } catch (e) {
    console.error("[ANA webhook]", e.message);
    if (!res.headersSent) res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`HairTech Bot v3.1 (SOUL v4.0) rodando na porta ${PORT}`);
  console.log(`Painel: /admin?senha=${ADMIN_PASS}`);
});
