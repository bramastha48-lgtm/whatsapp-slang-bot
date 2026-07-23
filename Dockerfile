FROM node:20-slim
ENV NODE_OPTIONS="--max-old-space-size=300"
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["node", "--expose-gc", "--max-old-space-size=300", "index.js"]
