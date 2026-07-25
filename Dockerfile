# Railway / production: UI (Vite dist) + market API in one process.
FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# TV submodule may be absent in CI — sync script exits 0 and continues.
RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HISTORIC_API_HOST=0.0.0.0
# Railway injects PORT; historicApiPort also reads it.
ENV SERVE_SPA=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/public ./public
COPY --from=build /app/api ./api

# Persist market DB / Dukascopy cache on a Railway volume mounted at /data.
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server/historicGoldApi.mjs"]
