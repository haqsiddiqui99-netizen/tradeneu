# Railway / production: UI (Vite dist) + market API in one process.
FROM node:20-bookworm-slim

WORKDIR /app

ENV HISTORIC_API_HOST=0.0.0.0
ENV SERVE_SPA=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Ignore scripts: postinstall needs scripts/ which is copied next.
RUN npm install --include=dev --ignore-scripts

COPY . .
# Enable TradingView Advanced Charts in the Vite build (requires vendor/charting_library submodule in repo).
ENV VITE_USE_TV_CHART=1
# prebuild runs TV sync (non-strict); then Vite/tsc build.
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

ENV NODE_ENV=production

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server/historicGoldApi.mjs"]
