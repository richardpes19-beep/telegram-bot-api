require("dotenv").config();

const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json());

const NOME_BOT = "VortexBank_bot";

let browser;
let page;


function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function iniciarNavegador() {

    console.log("Abrindo navegador com sessao salva...");

    console.log("Chromium sendo usado em:", puppeteer.executablePath());

    browser = await puppeteer.launch({
        headless: true, // ja logado, nao precisa ver a tela
        executablePath: puppeteer.executablePath(),
        userDataDir: process.env.SESSAO_PATH || "./sessao_telegram", // pasta gerada no login.js
        dumpio: true, // mostra o log real do Chrome no console (pra achar o motivo do crash)
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage", // usa /tmp em vez de /dev/shm (containers tem pouco shm)
            "--disable-gpu",
            "--no-zygote",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-sync",
            "--disable-translate",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-first-run",
            "--disable-hang-monitor",
            "--js-flags=--max-old-space-size=256" // limita memoria do V8 dentro do Chrome
        ]
    });

    page = await browser.newPage();

    await page.goto(`https://web.telegram.org/k/#@${NOME_BOT}`, {
        waitUntil: "networkidle2",
        timeout: 60000
    });

    console.log("Telegram Web carregado, chat com o bot aberto.");

    await esperar(4000);
}


async function enviarMensagem(texto) {

    // acha a caixa de texto do chat e digita
    const seletorCaixaTexto = 'div[contenteditable="true"][data-peer-id]';

    await page.waitForSelector(seletorCaixaTexto, { timeout: 20000 });

    await page.click(seletorCaixaTexto);

    await page.type(seletorCaixaTexto, texto, { delay: 50 });

    await page.keyboard.press("Enter");

    console.log("Mensagem enviada:", texto);
}


async function clicarBotaoDepositar() {

    console.log("Procurando botao 📥 DEPOSITAR...");

    // procura o botao com o emoji e texto especificos
    const botaoEncontrado = await page.evaluate(() => {

        const botoes = Array.from(document.querySelectorAll("button, .inline-button, .reply-markup-row button"));

        for (const botao of botoes) {

            const texto = botao.innerText || "";

            if (texto.includes("📥") && texto.includes("DEPOSITAR")) {

                botao.click();
                return true;

            }

        }

        return false;

    });

    if (!botaoEncontrado) {
        throw new Error("Botao 📥 DEPOSITAR nao encontrado na tela");
    }

    console.log("Botao 📥 DEPOSITAR clicado.");
}


async function pegarUltimasMensagens(quantidade = 10) {

    return await page.evaluate((qtd) => {

        const mensagens = Array.from(document.querySelectorAll(".message, .bubble-content"));

        return mensagens
            .slice(-qtd)
            .map(el => el.innerText || "");

    }, quantidade);

}


async function gerarPix(valor) {

    console.log("GERANDO PIX:", valor);

    await enviarMensagem("/start");

    await esperar(3000);

    await clicarBotaoDepositar();

    await esperar(6000);

    console.log("MANDANDO VALOR:", valor);

    await enviarMensagem(String(valor));

    await esperar(10000);

    const mensagens = await pegarUltimasMensagens(20);

    console.log("MENSAGENS RECEBIDAS:", mensagens.length);

    for (const texto of mensagens) {

        console.log("MSG:", texto.substring(0, 150));

        if (texto.includes("PIX Copia e Cola:")) {

            const pix = texto.split("PIX Copia e Cola:")[1].trim();

            console.log("PIX ENCONTRADO");

            return {
                sucesso: true,
                valor,
                pix
            };

        }

    }

    console.log("NAO ACHOU PIX");

    return {
        sucesso: false,
        erro: "PIX não encontrado"
    };

}


(async () => {

    await iniciarNavegador();

    app.get("/", (req, res) => {
        res.send("API ONLINE (puppeteer)");
    });

    app.post("/deposito", async (req, res) => {

        try {

            const valor = req.body.valor || 1200;

            const resultado = await gerarPix(valor);

            res.json(resultado);

        } catch (err) {

            console.log(err);

            res.status(500).json({
                sucesso: false,
                erro: err.message
            });

        }

    });

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
        console.log("Servidor rodando na porta " + PORT);
    });

})();
