import os
import asyncio
from dotenv import load_dotenv
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


async def main():

    await client.start()

    print("Conectado")

    bot = await client.get_entity("VortexBank_bot")

    print("Abrindo bot:", bot.username)

    await client.send_message(bot, "/start")

    print("START enviado")

    await asyncio.sleep(5)

    mensagens = await client.get_messages(bot, limit=10)

    clicou = False

    for msg in mensagens:

        if not msg.reply_markup:
            continue

        for row in msg.reply_markup.rows:

            for button in row.buttons:

                print("BOTÃO:", button.text)

                if "DEPOSITAR" in button.text:

                    print("ACHOU DEPOSITAR")

                    try:

                        await client(
                            GetBotCallbackAnswerRequest(
                                peer=bot,
                                msg_id=msg.id,
                                data=button.data
                            )
                        )

                    except BotResponseTimeoutError:

                        print("Callback executado (timeout ignorado).")

                    clicou = True
                    break

            if clicou:
                break

        if clicou:
            break

    if not clicou:

        print("Botão DEPOSITAR não encontrado.")
        return

    print("Esperando tela do valor...")

    await asyncio.sleep(4)

    valor_num = 1200

    if valor_num == int(valor_num):
        valor = str(int(valor_num))
    else:
        valor = f"{valor_num:.2f}"

    print("Enviando valor:", valor)

    await client.send_message(bot, valor)

    print("Valor enviado!")

    await asyncio.sleep(8)

    mensagens = await client.get_messages(bot, limit=20)

    print("========== MENSAGENS ==========")

    for msg in mensagens:

        if not msg.message:
            continue

        print("--------------------------------")
        print(msg.message)

        if "PIX Copia e Cola:" in msg.message:

            texto = msg.message.split("PIX Copia e Cola:")[1].strip()
            pix = texto.split("\n\n")[0].strip()

            print()
            print("=======================")
            print("PIX ENCONTRADO")
            print(pix)
            print("=======================")

            break

    await client.disconnect()


with client:
    client.loop.run_until_complete(main())
