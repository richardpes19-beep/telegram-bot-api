const puppeteer = require("puppeteer");

(async () => {

    console.log("Abrindo navegador para login manual...");

    const browser = await puppeteer.launch({
        headless: false, // precisa ver a tela pra escanear o QR code
        userDataDir: "./sessao_telegram", // aqui fica salva a sessão logada
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto("https://web.telegram.org/k/", {
        waitUntil: "networkidle2"
    });

    console.log("");
    console.log("=======================================================");
    console.log("ESCANEIA O QR CODE COM SEU CELULAR (Telegram > Configuracoes > Dispositivos > Conectar Dispositivo)");
    console.log("Depois de logar, espera a tela de conversas carregar e so ai feche este terminal (Ctrl+C).");
    console.log("=======================================================");
    console.log("");

    // deixa aberto esperando você logar manualmente
    // não fecha sozinho — feche o terminal manualmente depois de logar

})();
