FROM node:20-slim

# Instala as dependencias completas do sistema que o Chromium precisa
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libu2f-udev \
    libvulkan1 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# fixa onde o chromium do puppeteer fica salvo, pra nao depender de HOME variar
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

COPY package*.json ./
RUN npm install

# VERIFICACAO: confirma que o chromium foi baixado de verdade.
# Se isso falhar aqui, o build para com erro claro, em vez de falhar silenciosamente no runtime.
RUN node -e "const p = require('puppeteer'); const path = p.executablePath(); console.log('Chromium esperado em:', path); require('fs').accessSync(path); console.log('OK: Chromium encontrado.');"

COPY . .

EXPOSE 3000

CMD ["node", "index-puppeteer.js"]
