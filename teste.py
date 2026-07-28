import os
import asyncio
import threading
import time
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, jsonify
from telethon import TelegramClient
from telethon.tl.functions.messages import GetBotCallbackAnswerRequest
from telethon.errors import BotResponseTimeoutError

load_dotenv()

api_id = int(os.getenv("API_ID"))
api_hash = os.getenv("API_HASH")

# Cria e fixa o loop ANTES do client, e passa ele explicitamente
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

client = TelegramClient(
    "sessao_telegram",
    api_id,
    api_hash,
    loop=loop
)

app = Flask(__name__)

# Valor fixo enviado ao VortexBank_bot
valor_num = 1000

# client.start() já gerencia o loop sozinho, não precisa de run_until_complete
client.start()
print("Conectado ao Telegram")


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


# Guarda o último PIX gerado (seja automático ou por chamada)
ultimo_pix = {
    "pix": None,
    "valor": None,
    "gerado_em": None,
    "erro": None
}

# Lock pra evitar que a geração automática e uma chamada da API
# rodem ao mesmo tempo e briguem pelo bot
gerar_lock = threading.Lock()


def gerar_pix_seguro():
    """Gera um PIX novo e atualiza o estado global. Nunca derruba o processo."""

    with gerar_lock:

        try:
            pix = loop.run_until_complete(gerar_pix(valor_num))

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


def loop_24h():
    """Roda em background, gerando um PIX novo a cada 24 horas."""

    while True:
        gerar_pix_seguro()
        time.sleep(24 * 60 * 60)  # 24 horas


@app.route("/deposito", methods=["POST"])
def deposito():

    resultado = gerar_pix_seguro()

    if resultado["sucesso"]:
        return jsonify(resultado)

    return jsonify(resultado), 500 if "inesperado" in resultado["erro"] else 200


@app.route("/ultimo-pix", methods=["GET"])
def ultimo():
    """Consulta o último PIX gerado, sem disparar uma geração nova."""
    return jsonify(ultimo_pix)


if __name__ == "__main__":
    thread = threading.Thread(target=loop_24h, daemon=True)
    thread.start()

    porta = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=porta)
