# Railway / production: UI (Vite dist) + market API in one process.
FROM node:20-bookworm-slim

WORKDIR /app

ENV HISTORIC_API_HOST=0.0.0.0
ENV SERVE_SPA=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Include devDependencies so `vite` / `tsc` are available for the image build.
RUN npm ci --include=dev

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

ENV NODE_ENV=production

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server/historicGoldApi.mjs"]
