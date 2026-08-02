# Railway / production: UI (Vite dist) + market API in one process.
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HISTORIC_API_HOST=0.0.0.0
ENV SERVE_SPA=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server/historicGoldApi.mjs"]
