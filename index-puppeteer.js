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
        headless: false, // visivel - pra voce conseguir ver e escanear o QR code do Telegram
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

    console.log("Tentando enviar mensagem:", texto);

    // tenta varios seletores possiveis pra caixa de texto do Telegram Web
    const seletoresPossiveis = [
        'div[contenteditable="true"][data-peer-id]',
        'div.input-message-input',
        'div[contenteditable="true"]'
    ];

    let seletorEncontrado = null;

    for (const seletor of seletoresPossiveis) {

        const existe = await page.$(seletor);

        if (existe) {
            seletorEncontrado = seletor;
            console.log("Caixa de texto encontrada com seletor:", seletor);
            break;
        }

    }

    if (!seletorEncontrado) {
        throw new Error("Nao encontrou a caixa de texto do chat na tela");
    }

    await page.click(seletorEncontrado);

    await esperar(2000);

    // limpa o RASCUNHO que o Telegram salva automaticamente no campo
    // (seleciona so o conteudo do campo, nao a pagina inteira, e apaga)
    await page.evaluate((seletor) => {

        const campo = document.querySelector(seletor);
        campo.focus();

        const range = document.createRange();
        range.selectNodeContents(campo);

        const selecao = window.getSelection();
        selecao.removeAllRanges();
        selecao.addRange(range);

        document.execCommand("delete", false, null);

    }, seletorEncontrado);

    await esperar(1000);

    // insere o texto de UMA VEZ SO (como se fosse colar), em vez de digitar letra por letra.
    // isso evita que o re-render do autocomplete do Telegram corte o texto no meio.
    // agora que o campo esta limpo (sem rascunho), digita de verdade, tecla por tecla
    await page.click(seletorEncontrado);

    await esperar(1000);

    await page.type(seletorEncontrado, texto, { delay: 200 });

    await esperar(2000);

    await page.keyboard.press("Enter");

    await esperar(2000);

    console.log("Mensagem enviada com sucesso:", texto);
}


async function clicarBotaoDepositar() {

    console.log("Procurando botao 📥 DEPOSITAR...");

    // busca generica: percorre todos os elementos "folha" (sem filhos) da pagina
    // procurando o texto do botao, e clica no elemento clicavel mais proximo
    const botaoEncontrado = await page.evaluate(() => {

        const todosElementos = Array.from(document.querySelectorAll("*"));

        let alvo = null;

        for (const el of todosElementos) {

            // elemento "folha": nao tem elementos filhos, so texto
            if (el.children.length === 0) {

                const texto = (el.textContent || "").trim();

                if (texto.includes("DEPOSITAR")) {

                    alvo = el;
                    break;

                }

            }

        }

        if (!alvo) return false;

        // tenta subir ate achar um ancestral que pareça clicavel (botao/linha do teclado)
        const clicavel =
            alvo.closest('[class*="reply-markup"]') ||
            alvo.closest('button') ||
            alvo.closest('[role="button"]') ||
            alvo;

        clicavel.click();

        return true;

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

    console.log("========================================");
    console.log("GERANDO PIX - VALOR:", valor);
    console.log("========================================");

    // pasta onde os prints de cada etapa vao ser salvos
    const fs = require("fs");
    if (!fs.existsSync("./prints")) fs.mkdirSync("./prints");

    console.log("Esperando 3 segundos pra tela estabilizar...");
    await esperar(3000);
    await page.screenshot({ path: "./prints/1-antes-do-start.png" });

    console.log("PASSO 1: enviando /start...");
    await enviarMensagem("/start");
    console.log("PASSO 1 OK: /start enviado.");

    console.log("Esperando 6 segundos pro menu aparecer...");
    await esperar(6000);
    await page.screenshot({ path: "./prints/2-depois-do-start.png" });

    console.log("PASSO 2: clicando no botao DEPOSITAR...");
    await clicarBotaoDepositar();
    console.log("PASSO 2 OK: botao clicado.");

    console.log("Esperando 6 segundos pro bot pedir o valor...");
    await esperar(6000);
    await page.screenshot({ path: "./prints/3-depois-do-clique.png" });

    console.log("PASSO 3: enviando o valor:", valor);
    await enviarMensagem(String(valor));
    console.log("PASSO 3 OK: valor enviado.");

    console.log("Esperando 10 segundos pelo PIX...");
    await esperar(10000);
    await page.screenshot({ path: "./prints/4-depois-do-valor.png" });

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
