FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY src/ src/
COPY tests/ tests/
COPY scripts/ scripts/
RUN npm run build && npm prune --omit=dev
FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules node_modules/
COPY --from=build --chown=node:node /app/dist-node dist-node/
COPY --from=build --chown=node:node /app/dist-web dist-web/
COPY --chown=node:node package.json ./
COPY --chown=node:node docs/results/benchmark.json docs/results/benchmark.json
RUN mkdir .cache && chown node:node .cache
USER node
ENV HOST=0.0.0.0 PORT=8097
EXPOSE 8097
CMD ["node","dist-node/src/server.js"]
