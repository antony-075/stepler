# syntax=docker/dockerfile:1
# The background worker (ADR 0009): the API's codebase, its second entrypoint `dist/worker/main.js`.
# Build from the repository root: docker build -f apps/api/worker.Dockerfile .
# Same base and build as apps/api/Dockerfile; media tools (ffmpeg, HEIC) join with media processing.
# Base image pinned by multi-arch digest (node:24-slim); bump together with apps/api/Dockerfile.
FROM node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
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

FROM node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runner
ENV NODE_ENV=production
# OpenSSL for Prisma's schema engine (the pre-deploy `prisma migrate deploy`).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Root-owned, read-only for the runtime user: the worker cannot modify its own code.
COPY --from=builder /prod/api .
USER node
# No port and no HTTP health check: the worker serves nothing. It logs `worker started` once it
# polls, and exits non-zero on invalid env or when the database is unreachable at start.
CMD ["node", "dist/worker/main.js"]
