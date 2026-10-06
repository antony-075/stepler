# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/api/Dockerfile .
# Base image pinned by multi-arch digest (node:24-slim); bump deliberately.
FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Prisma's schema engine (migrations) needs OpenSSL; installed before `pnpm install` so the
# engine for the right OpenSSL version is downloaded.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.5 prune @stepler/api --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter @stepler/api \
 && pnpm deploy --filter @stepler/api --prod /prod/api

FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS runner
ENV NODE_ENV=production
# OpenSSL for Prisma's schema engine (the pre-deploy `prisma migrate deploy`).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Root-owned, read-only for the runtime user: the app cannot modify its own code.
COPY --from=builder /prod/api .
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.API_PORT ?? 4000}/api/v1/health/live`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
