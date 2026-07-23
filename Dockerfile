FROM node:20-slim

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    fonts-liberation \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Batasi memory Node.js maksimal 300MB
ENV NODE_OPTIONS="--max-old-space-size=300"
# Matikan halaman yang ga dipake
ENV PUPPETEER_CHROMIUM_REVISION=1

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p session_data

CMD ["node", "--expose-gc", "--max-old-space-size=300", "index.js"]
