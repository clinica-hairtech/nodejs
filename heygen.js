// HeyGen integration — gera vídeo personalizado do Dr. Ricardo e envia via WhatsApp
const axios = require("axios");

const HEYGEN_API_KEY  = process.env.HEYGEN_API_KEY;
const HEYGEN_AVATAR   = process.env.HEYGEN_AVATAR_ID;
const HEYGEN_VOICE    = process.env.HEYGEN_VOICE_ID;
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

function scriptPara(motivo) {
  if (motivo === "transplante") {
    return "Olá! Aqui é o Dr. Ricardo, da Clínica HairTech. Fico muito feliz com o seu interesse no transplante capilar. É uma decisão que transforma vidas, e a nossa equipe vai te acompanhar em cada etapa. Aguardo você aqui!";
  }
  return "Olá! Aqui é o Dr. Ricardo, da Clínica HairTech. Parabéns por dar esse passo! Sua consulta está quase confirmada e estamos ansiosos para te atender. Qualquer dúvida, é só chamar. Até breve!";
}

async function criarVideo(motivo) {
  const resp = await axios.post(
    "https://api.heygen.com/v2/video/generate",
    {
      video_inputs: [{
        character: { type: "avatar", avatar_id: HEYGEN_AVATAR, avatar_style: "normal" },
        voice:     { type: "text", input_text: scriptPara(motivo), voice_id: HEYGEN_VOICE, speed: 1.0 },
        background: { type: "color", value: "#1a1a2e" }
      }],
      dimension: { width: 720, height: 1280 }
    },
    {
      headers: { "X-Api-Key": HEYGEN_API_KEY, "Content-Type": "application/json" },
      timeout: 30000
    }
  );
  return resp.data?.data?.video_id || null;
}

async function aguardarVideo(videoId, timeoutMs = 4 * 60 * 1000) {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    await new Promise(r => setTimeout(r, 12000));
    try {
      const resp = await axios.get(
        `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
        { headers: { "X-Api-Key": HEYGEN_API_KEY }, timeout: 15000 }
      );
      const d = resp.data?.data;
      if (d?.status === "completed" && d.video_url) return d.video_url;
      if (d?.status === "failed") { console.error("HeyGen: vídeo falhou", d.error); return null; }
    } catch (_) {}
  }
  console.error("HeyGen: timeout ao aguardar vídeo");
  return null;
}

async function enviarVideoWpp(to, videoUrl) {
  const videoResp = await axios.get(videoUrl, { responseType: "arraybuffer", timeout: 90000 });
  const blob = new Blob([videoResp.data], { type: "video/mp4" });
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "video/mp4");
  form.append("file", blob, "mensagem_dr_ricardo.mp4");

  const up = await fetch(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, body: form }
  );
  const upData = await up.json();
  if (!upData.id) { console.error("HeyGen: upload WhatsApp falhou", upData); return; }

  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: {
        id: upData.id,
        caption: "Uma mensagem especial do Dr. Ricardo para você! Estamos ansiosos para te receber na Clínica HairTech."
      }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, timeout: 15000 }
  );
  console.log(`HeyGen: vídeo enviado para ${to}`);
}

async function enviarVideoPersonalizado(to, motivo) {
  if (!HEYGEN_API_KEY || !HEYGEN_AVATAR || !HEYGEN_VOICE) {
    console.log("HeyGen não configurado — HEYGEN_API_KEY, HEYGEN_AVATAR_ID e HEYGEN_VOICE_ID necessários");
    return;
  }
  try {
    const videoId = await criarVideo(motivo);
    if (!videoId) { console.error("HeyGen: video_id não retornado"); return; }
    console.log(`HeyGen: gerando vídeo ${videoId} para ${to}...`);
    const url = await aguardarVideo(videoId);
    if (url) await enviarVideoWpp(to, url);
  } catch (e) {
    console.error("HeyGen erro:", e.response?.data || e.message);
  }
}

module.exports = { enviarVideoPersonalizado };
