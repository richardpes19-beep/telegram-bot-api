import os
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from aiohttp import web
from telethon import TelegramClient
from telethon.tl.functions.messages import GetBotCallbackAnswerRequest
from telethon.errors import BotResponseTimeoutError

load_dotenv()

api_id = int(os.getenv("API_ID"))
api_hash = os.getenv("API_HASH")

client = TelegramClient(
    "sessao_telegram",
    api_id,
    api_hash
)

# Valor fixo enviado ao VortexBank_bot
valor_num = 1000

# Guarda o último PIX gerado (seja automático ou por chamada)
ultimo_pix = {
    "pix": None,
    "valor": None,
    "gerado_em": None,
    "erro": None
}

# Lock assíncrono: evita que a geração automática e uma chamada da API
# rodem ao mesmo tempo e briguem pelo bot
gerar_lock = asyncio.Lock()


async def gerar_pix(valor: float) -> str:

    bot = await client.get_entity("VortexBank_bot")

    await client.send_message(bot, "/start")

    await asyncio.sleep(5)

    mensagens = await client.get_messages(bot, limit=10)

    clicou = False

    for msg in mensagens:

        if not msg.reply_markup:
            continue

        for row in msg.reply_markup.rows:

            for button in row.buttons:

                if "DEPOSITAR" in button.text:

                    try:
                        await client(
                            GetBotCallbackAnswerRequest(
                                peer=bot,
                                msg_id=msg.id,
                                data=button.data
                            )
                        )
                    except BotResponseTimeoutError:
                        pass

                    clicou = True
                    break

            if clicou:
                break

        if clicou:
            break

    if not clicou:
        raise RuntimeError("Botão DEPOSITAR não encontrado.")

    await asyncio.sleep(4)

    if valor == int(valor):
        valor_str = str(int(valor))
    else:
        valor_str = f"{valor:.2f}"

    await client.send_message(bot, valor_str)

    await asyncio.sleep(8)

    mensagens = await client.get_messages(bot, limit=20)

    for msg in mensagens:

        if not msg.message:
            continue

        if "PIX Copia e Cola:" in msg.message:

            texto = msg.message.split("PIX Copia e Cola:")[1].strip()
            pix = texto.split("\n\n")[0].strip()

            return pix

    raise RuntimeError("PIX não encontrado na resposta do bot.")


async def gerar_pix_seguro() -> dict:
    """Gera um PIX novo e atualiza o estado global. Nunca derruba o processo."""

    async with gerar_lock:

        try:
            pix = await gerar_pix(valor_num)

            ultimo_pix["pix"] = pix
            ultimo_pix["valor"] = valor_num
            ultimo_pix["gerado_em"] = datetime.now().isoformat()
            ultimo_pix["erro"] = None

            print(f"[{ultimo_pix['gerado_em']}] PIX gerado: {pix}")

            return {"sucesso": True, "valor": valor_num, "pix": pix}

        except RuntimeError as e:

            ultimo_pix["erro"] = str(e)
            print(f"[erro] {e}")

            return {"sucesso": False, "valor": valor_num, "erro": str(e)}

        except Exception as e:

            ultimo_pix["erro"] = f"Erro inesperado: {e}"
            print(f"[erro inesperado] {e}")

            return {"sucesso": False, "valor": valor_num, "erro": f"Erro inesperado: {e}"}


async def loop_24h(app):
    """Roda em background, gerando um PIX novo a cada 24 horas."""

    while True:
        await gerar_pix_seguro()
        await asyncio.sleep(24 * 60 * 60)  # 24 horas


# ---------- rotas HTTP ----------

async def rota_deposito(request):
    resultado = await gerar_pix_seguro()

    status = 200
    if not resultado["sucesso"] and "inesperado" in resultado.get("erro", ""):
        status = 500

    return web.json_response(resultado, status=status)


async def rota_ultimo_pix(request):
    return web.json_response(ultimo_pix)


# ---------- CORS simples (equivalente ao flask-cors) ----------

@web.middleware
async def cors_middleware(request, handler):

    if request.method == "OPTIONS":
        resposta = web.Response()
    else:
        try:
            resposta = await handler(request)
        except web.HTTPException as exc:
            # Exceções HTTP do aiohttp (404, 405, etc) já são respostas válidas,
            # só precisam passar pelos headers de CORS também.
            resposta = exc

    resposta.headers["Access-Control-Allow-Origin"] = "*"
    resposta.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resposta.headers["Access-Control-Allow-Headers"] = "Content-Type"

    return resposta


# ---------- ciclo de vida da aplicação ----------

async def ao_iniciar(app):
    await client.start()
    print("Conectado ao Telegram")

    # dispara o loop de 24h em background, sem travar o servidor
    app["tarefa_24h"] = asyncio.create_task(loop_24h(app))


async def ao_encerrar(app):
    app["tarefa_24h"].cancel()
    await client.disconnect()


async def rota_options(request):
    return web.Response()


def criar_app():
    app = web.Application(middlewares=[cors_middleware])

    app.router.add_post("/deposito", rota_deposito)
    app.router.add_get("/ultimo-pix", rota_ultimo_pix)
    app.router.add_route("OPTIONS", "/deposito", rota_options)
    app.router.add_route("OPTIONS", "/ultimo-pix", rota_options)

    app.on_startup.append(ao_iniciar)
    app.on_cleanup.append(ao_encerrar)

    return app


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 8000))
    web.run_app(criar_app(), host="0.0.0.0", port=porta)
