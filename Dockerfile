FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
 && npm install --no-save --ignore-scripts @rollup/rollup-linux-x64-gnu
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY shared ./shared
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV DATA_MODE=live

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY server ./server
COPY shared ./shared
COPY scripts/apply-config.mjs ./scripts/apply-config.mjs
COPY scripts/scheduler.mjs ./scripts/scheduler.mjs
COPY config.json ./config.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && useradd --system --uid 1001 --home /app app \
  && chown -R app:app /app

USER app
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
