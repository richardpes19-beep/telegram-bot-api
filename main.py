from telethon import TelegramClient
from dotenv import load_dotenv
import os

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

    print("Telegram conectado!")

    await client.disconnect()


with client:
    client.loop.run_until_complete(main())