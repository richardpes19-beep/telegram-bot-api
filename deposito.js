/**
 * Automacao GramJS -> @VortexBank_bot
 *
 * Fluxo:
 *   /start  ->  espera menu  ->  clica no botao "DEPOSITAR"
 *           ->  envia 1200   ->  captura codigo pix (copia e cola) + QR (base64)
 *
 * Rode isso no Railway (Node 18+), NAO em serverless.
 *
 *   npm i telegram express cors input
 *   node deposito.js
 */

const express = require("express");
const cors = require("cors");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

// ---------------------------------------------------------------- credenciais
const API_ID = Number(process.env.API_ID || 37889023);
const API_HASH = process.env.API_HASH || "683e350606fdede275a7a8dd31b39cfb";
const SESSION = process.env.SESSION || "COLE_SUA_STRING_SESSION_AQUI";

const BOT = "@VortexBank_bot";
const BOTAO_DEPOSITO = "DEPOSITAR"; // match parcial, ignora emoji
const VALOR_PADRAO = 1200;

// ---------------------------------------------------------------- util
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let client = null;
let conectando = null;

async function getClient() {
  if (client && client.connected) return client;
  if (conectando) return conectando;

  conectando = (async () => {
    const c = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {
      connectionRetries: 5,
    });
    await c.connect();
    if (!(await c.checkAuthorization())) {
      throw new Error("SESSION invalida ou expirada");
    }
    client = c;
    conectando = null;
    return c;
  })();

  return conectando;
}

/** Espera uma nova mensagem do bot que satisfaca `cond`, ate `timeoutMs`. */
async function esperarMensagem(c, cond, timeoutMs = 25000, desdeId = 0) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const msgs = await c.getMessages(BOT, { limit: 5 });
    for (const m of msgs) {
      if (m.id <= desdeId) continue;
      if (m.out) continue; // ignora as minhas proprias
      if (cond(m)) return m;
    }
    await sleep(1200);
  }
  return null;
}

/** Procura o botao pelo texto dentro do teclado inline da mensagem. */
function acharBotao(msg, alvo) {
  const kb = msg.replyMarkup;
  if (!kb || !kb.rows) return null;
  const norm = (s) => (s || "").normalize("NFD").replace(/[^\w\s]/g, "").trim().toUpperCase();
  for (let i = 0; i < kb.rows.length; i++) {
    const row = kb.rows[i];
    for (let j = 0; j < row.buttons.length; j++) {
      const b = row.buttons[j];
      if (norm(b.text).includes(norm(alvo))) {
        return { botao: b, i, j };
      }
    }
  }
  return null;
}

/** Extrai o codigo pix copia-e-cola de um texto. */
function extrairPix(texto) {
  if (!texto) return null;
  // codigo EMV do pix comeca com 000201 e costuma ter 80+ chars
  const m = texto.match(/00020[0-9A-Za-z._\-*+:/$@%\s]{60,}/);
  if (m) return m[0].replace(/\s+/g, "");
  // fallback: bloco em monospace/code
  const c = texto.match(/`([^`]{60,})`/);
  return c ? c[1].trim() : null;
}

// ---------------------------------------------------------------- fluxo
async function gerarDeposito(valor = VALOR_PADRAO) {
  const c = await getClient();

  const ultimas = await c.getMessages(BOT, { limit: 1 });
  let ultimoId = ultimas.length ? ultimas[0].id : 0;

  // 1) /start
  await c.sendMessage(BOT, { message: "/start" });

  // 2) espera o menu com o botao DEPOSITAR
  let menu = await esperarMensagem(
    c,
    (m) => !!acharBotao(m, BOTAO_DEPOSITO),
    25000,
    ultimoId,
  );
  if (!menu) throw new Error("menu com o botao DEPOSITAR nao apareceu");
  ultimoId = menu.id;

  // 3) clica no botao
  const alvo = acharBotao(menu, BOTAO_DEPOSITO);
  if (alvo.botao.data) {
    await c.invoke(
      new Api.messages.GetBotCallbackAnswer({
        peer: BOT,
        msgId: menu.id,
        data: alvo.botao.data,
      }),
    );
  } else {
    // botao de teclado normal (nao inline): manda o texto
    await c.sendMessage(BOT, { message: alvo.botao.text });
  }

  // 4) espera o bot pedir o valor
  await esperarMensagem(c, () => true, 20000, ultimoId);
  await sleep(1500);

  const antes = await c.getMessages(BOT, { limit: 1 });
  ultimoId = antes.length ? antes[0].id : ultimoId;

  // 5) manda o valor
  await c.sendMessage(BOT, { message: String(valor) });

  // 6) espera a resposta com o pix / qr
  const resp = await esperarMensagem(
    c,
    (m) => !!extrairPix(m.message) || !!m.photo || !!m.media,
    45000,
    ultimoId,
  );
  if (!resp) throw new Error("BOT_RESPONSE_TIMEOUT");

  let pix = extrairPix(resp.message);
  let qrBase64 = null;

  // se veio imagem, baixa o QR
  if (resp.photo || resp.media) {
    try {
      const buf = await c.downloadMedia(resp, {});
      if (buf) qrBase64 = Buffer.from(buf).toString("base64");
    } catch (_) {}
  }

  // as vezes o codigo vem numa mensagem seguinte
  if (!pix) {
    const extra = await esperarMensagem(
      c,
      (m) => !!extrairPix(m.message),
      20000,
      resp.id,
    );
    if (extra) pix = extrairPix(extra.message);
  }

  if (!pix && !qrBase64) throw new Error("nao consegui capturar o codigo pix");

  return { sucesso: true, valor, pix, qrBase64 };
}

// ---------------------------------------------------------------- http
const app = express();
app.use(cors());
app.use(express.json());

app.post("/deposito", async (req, res) => {
  const valor = Number(req.body?.valor) > 0 ? Number(req.body.valor) : VALOR_PADRAO;
  try {
    const r = await gerarDeposito(valor);
    res.json(r);
  } catch (e) {
    console.error("[deposito]", e);
    res.json({ sucesso: false, erro: String(e.message || e) });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("rodando na porta " + PORT));
