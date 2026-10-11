# Multi-stage image for the booking server. Build from the repository root:
#   docker build -f apps/server/Dockerfile -t klientela-server .
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json turbo.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @klientela/core build && pnpm --filter @klientela/server build

FROM node:22-slim AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=build /app ./
ENV NODE_ENV=production
ENV DB_PATH=/data/klientela.db
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
