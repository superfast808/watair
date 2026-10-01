FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r watair && useradd -r -g watair -d /app watair
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/data /app/public/uploads \
    && chown -R watair:watair /app/data /app/public/uploads
USER watair
EXPOSE 8080
CMD ["node", "server.js"]
