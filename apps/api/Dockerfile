# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

# Keep only the API and the workspace packages it depends on.
FROM base AS pruner
COPY . .
RUN corepack pnpm dlx turbo@2.11.10 prune @order-splitter/api --docker

# Install with the lockfile (cached until a manifest changes), build, then deploy production deps only.
FROM base AS builder
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@order-splitter/api \
  && pnpm --filter @order-splitter/api deploy --prod --legacy /prod/api

FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
