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

    print(f"[debug] is_connected() antes: {client.is_connected()}")

    if not client.is_connected():
        print("[debug] não conectado, chamando client.connect()...")
        await client.connect()
        print(f"[debug] is_connected() depois do connect(): {client.is_connected()}")

    print("[debug] buscando entidade do bot (get_entity)...")
    bot = await client.get_entity("VortexBank_bot")
    print(f"[debug] entidade obtida: id={bot.id}, username={getattr(bot, 'username', None)}")

    print("[debug] enviando /start...")
    msg_start = await client.send_message(bot, "/start")
    print(f"[debug] /start enviado, msg.id={msg_start.id}, date={msg_start.date}")

    await asyncio.sleep(5)

    print("[debug] lendo mensagens após /start...")
    mensagens = await client.get_messages(bot, limit=10)
    print(f"[debug] {len(mensagens)} mensagens lidas. IDs: {[m.id for m in mensagens]}")
    for m in mensagens[:5]:
        preview = (m.message or "")[:60].replace("\n", " ")
        print(f"[debug]   msg id={m.id} out={m.out} tem_botoes={bool(m.reply_markup)} texto='{preview}'")

    clicou = False

    for msg in mensagens:

        if not msg.reply_markup:
            continue

        for row in msg.reply_markup.rows:

            for button in row.buttons:

                if "DEPOSITAR" in button.text:

                    print(f"[debug] botão DEPOSITAR encontrado na msg id={msg.id}, clicando...")

                    try:
                        resposta_click = await client(
                            GetBotCallbackAnswerRequest(
                                peer=bot,
                                msg_id=msg.id,
                                data=button.data
                            )
                        )
                        print(f"[debug] callback respondido: {resposta_click}")
                    except BotResponseTimeoutError:
                        print("[debug] BotResponseTimeoutError ao clicar (ignorado, seguindo fluxo)")

                    clicou = True
                    break

            if clicou:
                break

        if clicou:
            break

    if not clicou:
        print("[debug] botão DEPOSITAR NÃO encontrado em nenhuma mensagem")
        raise RuntimeError("Botão DEPOSITAR não encontrado.")

    await asyncio.sleep(4)

    if valor == int(valor):
        valor_str = str(int(valor))
    else:
        valor_str = f"{valor:.2f}"

    print(f"[debug] enviando valor '{valor_str}'...")
    msg_valor = await client.send_message(bot, valor_str)
    print(f"[debug] valor enviado, msg.id={msg_valor.id}")

    await asyncio.sleep(8)

    print("[debug] lendo mensagens após enviar valor...")
    mensagens = await client.get_messages(bot, limit=20)
    print(f"[debug] {len(mensagens)} mensagens lidas. IDs: {[m.id for m in mensagens]}")

    for msg in mensagens:

        if not msg.message:
            continue

        if "PIX Copia e Cola:" in msg.message:

            texto = msg.message.split("PIX Copia e Cola:")[1].strip()
            pix = texto.split("\n\n")[0].strip()

            print(f"[debug] PIX encontrado na msg id={msg.id}")

            return pix

    print("[debug] PIX NÃO encontrado em nenhuma mensagem lida")
    raise RuntimeError("PIX não encontrado na resposta do bot.")


async def gerar_pix_seguro() -> dict:
    """Gera um PIX novo e atualiza o estado global. Nunca derruba o processo."""

    async with gerar_lock:

        try:
            pix = await asyncio.wait_for(gerar_pix(valor_num), timeout=60)

            ultimo_pix["pix"] = pix
            ultimo_pix["valor"] = valor_num
            ultimo_pix["gerado_em"] = datetime.now().isoformat()
            ultimo_pix["erro"] = None

            print(f"[{ultimo_pix['gerado_em']}] PIX gerado: {pix}")

            return {"sucesso": True, "valor": valor_num, "pix": pix}

        except asyncio.TimeoutError:

            erro = "Timeout: o bot do Telegram demorou demais pra responder (>60s)."
            ultimo_pix["erro"] = erro
            print(f"[erro] {erro}")

            # a conexão pode ter ficado "zumbi" (parece viva mas não responde).
            # força desconectar aqui pra próxima chamada reconectar do zero.
            try:
                await client.disconnect()
                print("[info] Conexão reiniciada após timeout.")
            except Exception as e2:
                print(f"[aviso] Falha ao reiniciar conexão: {e2}")

            return {"sucesso": False, "valor": valor_num, "erro": erro}

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


async def heartbeat(app):
    """Imprime um sinal de vida a cada 30s. Se isso parar de aparecer no log,
    o processo inteiro travou (não é só a chamada do Telegram)."""

    contador = 0
    while True:
        contador += 1
        print(f"[heartbeat] processo vivo #{contador} - {datetime.now().isoformat()}")
        await asyncio.sleep(30)


# ---------- rotas HTTP ----------

async def rota_deposito(request):
    print(f"[requisição] /deposito recebido às {datetime.now().isoformat()}")

    if gerar_lock.locked():
        return web.json_response(
            {"sucesso": False, "status": "ja_processando",
             "mensagem": "Já tem uma geração de PIX em andamento, aguarde e consulte /ultimo-pix."},
            status=202
        )

    # dispara em segundo plano e responde NA HORA — nunca deixa o Railway
    # estourar o tempo limite esperando o Telegram responder.
    asyncio.create_task(gerar_pix_seguro())

    return web.json_response(
        {"sucesso": True, "status": "processando",
         "mensagem": "PIX sendo gerado, consulte /ultimo-pix em alguns segundos."},
        status=202
    )


async def rota_ultimo_pix(request):
    return web.json_response(ultimo_pix)


async def rota_raiz(request):
    return web.Response(text="API ONLINE")


async def rota_status(request):
    conectado = client.is_connected() if client else False
    return web.json_response({
        "status": "online",
        "telegram_conectado": conectado,
        "hora": datetime.now().isoformat()
    })


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
    app["tarefa_heartbeat"] = asyncio.create_task(heartbeat(app))


async def ao_encerrar(app):
    app["tarefa_24h"].cancel()
    app["tarefa_heartbeat"].cancel()
    await client.disconnect()


async def rota_options(request):
    return web.Response()


def criar_app():
    app = web.Application(middlewares=[cors_middleware])

    app.router.add_post("/deposito", rota_deposito)
    app.router.add_get("/ultimo-pix", rota_ultimo_pix)
    app.router.add_get("/", rota_raiz)
    app.router.add_get("/status", rota_status)
    app.router.add_route("OPTIONS", "/deposito", rota_options)
    app.router.add_route("OPTIONS", "/ultimo-pix", rota_options)

    app.on_startup.append(ao_iniciar)
    app.on_cleanup.append(ao_encerrar)

    return app


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 8000))
    web.run_app(criar_app(), host="0.0.0.0", port=porta)
