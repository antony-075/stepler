# syntax=docker/dockerfile:1
# The background worker (ADR 0009): the API's codebase, its second entrypoint `dist/worker/main.js`.
# Build from the repository root: docker build -f apps/api/worker.Dockerfile .
# Same base and build as apps/api/Dockerfile, plus the media tools (spike S5).
# Base image pinned by multi-arch digest (node:24-slim); bump together with apps/api/Dockerfile.
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
# ffmpeg/ffprobe for video posters; libheif-examples (heif-convert, libheif1 + libde265 on
# bookworm) for HEIC. Debian 12 versions at the time of spike S5: ffmpeg 7:5.1.9-0+deb12u1,
# libheif 1.15.1-1+deb12u1, libde265 1.0.11-1+deb12u3. Not pinned: Debian security updates
# replace them and a pinned version stops resolving; the base image digest is pinned. About
# +409 MB uncompressed. Debian's ffmpeg is GPL (x264/x265); it runs as a separate CLI process.
# libimage-exiftool-perl (exiftool 12.57+dfsg-1 on bookworm, Perl Artistic or GPL, run as a CLI
# process) strips location metadata from originals (ADR 0008 addendum 2026-10-05); about +23 MB.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ffmpeg libheif-examples libimage-exiftool-perl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Root-owned, read-only for the runtime user: the worker cannot modify its own code.
COPY --from=builder /prod/api .
USER node
# No port and no HTTP health check: the worker serves nothing. It logs `worker started` once it
# polls, and exits non-zero on invalid env or when the database is unreachable at start.
CMD ["node", "dist/worker/main.js"]
