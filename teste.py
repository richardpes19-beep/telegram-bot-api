import os
import asyncio
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
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

app = FastAPI()

# Lock para garantir que só um fluxo de depósito roda por vez
deposito_lock = asyncio.Lock()

# Valor fixo que será enviado ao VortexBank_bot
valor_num = 1200


class DepositoResponse(BaseModel):
    sucesso: bool
    valor: float | None = None
    pix: str | None = None
    erro: str | None = None


@app.on_event("startup")
async def startup():
    await client.start()
    print("Conectado ao Telegram")


@app.on_event("shutdown")
async def shutdown():
    await client.disconnect()


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


@app.post("/deposito", response_model=DepositoResponse)
async def deposito():

    async with deposito_lock:

        try:
            pix = await gerar_pix(valor_num)

            return DepositoResponse(
                sucesso=True,
                valor=valor_num,
                pix=pix
            )

        except RuntimeError as e:
            return DepositoResponse(
                sucesso=False,
                valor=valor_num,
                erro=str(e)
            )

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
