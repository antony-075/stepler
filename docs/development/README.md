# Development

## Prerequisites

- **Node.js 24 LTS** (`.nvmrc`). With nvm: `nvm install && nvm use`.
- **pnpm 11.28.2** via corepack: `corepack enable`. The version comes from `packageManager` in `package.json`. pnpm 12 is not used, because corepack cannot run its native binary.
- **Docker** (Docker Desktop or compatible) for local infrastructure and image checks.
- Playwright browsers for UI and E2E tests: `pnpm --filter @stepler/ui exec playwright install chromium` and `pnpm --filter @stepler/e2e exec playwright install chromium webkit`.

## Workspace

| Path                  | Package                | Purpose                                                                |
| --------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `apps/api`            | `@stepler/api`       | NestJS 12 REST API (ESM)                                               |
| `apps/web`            | `@stepler/web`       | Next.js 16 web app (guest + admin), proxies `/api/*` to the API        |
| `packages/contracts`  | `@stepler/contracts` | Zod schemas shared by API and web (built with `tsc`)                   |
| `packages/ui`         | `@stepler/ui`        | shadcn/Radix/Tailwind components + Storybook                           |
| `packages/config`     | `@stepler/config`    | tsconfig, ESLint and Prettier presets                                  |
| `e2e`                 | `@stepler/e2e`       | Playwright tests against production builds                             |
| `docker/`             |                        | Local infrastructure (`compose.yaml`) and image checks                 |

## Local services

Apps run natively. Docker Compose runs the infrastructure only.

```sh
cp docker/.env.example docker/.env
docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait
docker compose -f docker/compose.yaml --env-file docker/.env down
```

| Service    | Address                                              |
| ---------- | ---------------------------------------------------- |
| PostgreSQL | `127.0.0.1:5433` (host port, `POSTGRES_PORT`)        |
| Mailpit    | SMTP `127.0.0.1:1025`, UI http://127.0.0.1:8025      |
| S3 (SeaweedFS) | `http://127.0.0.1:8333`, credentials `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` from `docker/.env` |

- PostgreSQL uses host port 5433 so it does not clash with a locally installed PostgreSQL.
- On first start, `docker/postgres/init/` creates `stepler_test` (integration and e2e tests) and `stepler_shadow` (Prisma's shadow database for the drift check; Prisma resets it). Init scripts run only on an empty volume. For a volume created before Phase 2, either run `docker compose -f docker/compose.yaml --env-file docker/.env down -v` (this deletes local data) or create the two databases by hand.
- API tests read the PostgreSQL credentials from `docker/.env` (or `docker/.env.example` when it is absent). `TEST_DATABASE_URL` / `TEST_SHADOW_DATABASE_URL` override them.
- The S3 emulator is SeaweedFS (ADR 0008, spike S4). After the first start, run `pnpm --filter @stepler/api storage:bootstrap`: it creates the `stepler-dev` and `stepler-test` buckets with CORS for the local web origins, and is safe to rerun. The API's `S3_*` values must match `docker/.env`.
- The worker process arrives with the processing slice.

## Commands

Run everything from the repository root.

| Command                                         | What it does                                                  |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `pnpm install`                                  | Install dependencies                                          |
| `pnpm dev`                                      | Build workspace packages, then run api (4000), web (3000) and contracts in watch mode |
| `pnpm build`                                    | Build all packages and apps                                   |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`    | Quality checks (Turborepo, cached)                            |
| `pnpm e2e`                                      | Build, start production servers on 3100/4100, run Playwright  |
| `pnpm build-storybook`                          | Static Storybook build                                        |
| `pnpm --filter @stepler/ui storybook`         | Storybook dev server on 6006                                  |
| `pnpm format` / `pnpm format:check`             | Prettier (Markdown, docs and `.claude/` are not formatted)    |
| `bash docker/scripts/verify-images.sh`          | Build production images and check non-root, no `.env`, no dev deps, health, proxy |
| `pnpm --filter @stepler/api db:migrate`         | Create/apply migrations against `DATABASE_URL` (`prisma migrate dev`; raw SQL rules in ADR 0005) |
| `pnpm --filter @stepler/api db:deploy`          | Apply pending migrations (`prisma migrate deploy`)            |
| `pnpm --filter @stepler/api db:check`           | Fail if migrations and schema differ; needs `SHADOW_DATABASE_URL` |
| `pnpm --filter @stepler/api openapi:write`      | Regenerate `apps/api/openapi.json`; the API test suite fails when it is stale |

Local `.env` files: copy `apps/api/.env.example` to `apps/api/.env`, and `apps/web/.env.example` to `apps/web/.env`. `pnpm dev` loads them. Turborepo runs in strict env mode, so every new runtime variable must also be added to `passThroughEnv` in `turbo.json`.

## Environment variables

These are names only; real values never go into the repository. Staging and production use separate credentials.

| Variable | App | Required | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | api | yes | `development`, `test` or `production` |
| `API_PORT` | api | no | Listen port, default `4000` |
| `LOG_LEVEL` | api | no | `fatal`…`trace`, default `info` |
| `APP_ORIGIN` | api | yes | Public web origin (`https://host`, no path). Magic links, the OAuth redirect URI and the CSRF `Origin` check use it |
| `DATABASE_URL` | api | yes | PostgreSQL connection URL |
| `SHADOW_DATABASE_URL` | api (CLI) | for `db:check` / `db:migrate` | Disposable database Prisma resets (`stepler_shadow`); never the dev or test database |
| `COOKIE_SECURE` | api | no | Adds `Secure` to cookies; default `true` in production, else `false` |
| `SESSION_TTL_DAYS` | api | no | Admin session lifetime, default `30` |
| `MAGIC_LINK_TTL_MINUTES` | api | no | Magic link lifetime, default `15` |
| `OPERATOR_EMAILS` | api | no | Comma-separated operator emails (ADR 0013), default empty |
| `API_TRUST_PROXY` | api | no | Express `trust proxy`: `false` (default), a hop count, or a trust string such as `loopback` |
| `APP_SECRET` | api | yes | Base64 of ≥ 32 random bytes; root key for HKDF-derived keys. Distinct per environment |
| `SMTP_URL` | api | yes | `smtp://` or `smtps://` URL of the mail server (Mailpit locally) |
| `MAIL_FROM` | api | yes | Sender, `Name <address>` |
| `TURNSTILE_SITE_KEY` | api | yes | Cloudflare Turnstile site key (served to the web app) |
| `TURNSTILE_SECRET_KEY` | api | yes | Cloudflare Turnstile secret key |
| `GOOGLE_CLIENT_ID` | api | no | Google OAuth client id; set together with the secret, or neither (Google sign-in off) |
| `GOOGLE_CLIENT_SECRET` | api | no | Google OAuth client secret |
| `S3_ENDPOINT` | api | no | S3 endpoint; unset for the provider default. Emulator: `http://127.0.0.1:8333` |
| `S3_REGION` | api | yes | `auto` for R2, `us-east-1` for the emulator |
| `S3_BUCKET` | api | yes | Bucket name |
| `S3_ACCESS_KEY_ID` | api | yes | Bucket-scoped access key |
| `S3_SECRET_ACCESS_KEY` | api | yes | Bucket-scoped secret key |
| `S3_FORCE_PATH_STYLE` | api | no | `true` for the emulator; default `false` |
| `LIMIT_MAGIC_LINK_PER_EMAIL_PER_HOUR` | api | no | Default `5` |
| `LIMIT_MAGIC_LINK_PER_IP_PER_HOUR` | api | no | Default `20` |
| `LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR` | api | no | Default `60` |
| `LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT` | api | no | Default `3` |
| `LIMIT_STORAGE_BYTES_PER_ACCOUNT` | api | no | Bytes, default 20 GiB |
| `LIMIT_STORAGE_BYTES_PER_COLLECTION` | api | no | Bytes, default 10 GiB |
| `API_INTERNAL_URL` | web | yes | http(s) origin the web server forwards `/api/*` to; read at runtime |
| `TRUST_PROXY_HEADERS` | web | no | `true` only behind an edge that overwrites `X-Forwarded-*`; default `false` (headers dropped) |
| `PORT`, `HOSTNAME` | web | no | Standalone Next.js server bind address |

Both apps validate their env at startup and exit when it is invalid. Error messages name the variables but never print their values.

## Dependency policy

- Versions are pinned exactly. Shared versions live in the `catalog:` section of `pnpm-workspace.yaml`.
- Use the latest stable release that is **at least 1 day old**. This is the pnpm 11 `minimumReleaseAge` default; never add `minimumReleaseAgeExclude`.
- pnpm 11 blocks dependency install scripts. Every package that needs one is listed in `allowBuilds` (true/false) in `pnpm-workspace.yaml`. Install telemetry (`@scarf/scarf`) is denied.
- Deliberate holds:

| Package                 | Held at         | Reason                                                                   |
| ----------------------- | --------------- | ------------------------------------------------------------------------ |
| TypeScript              | 6.0             | typescript-eslint does not support 7                                     |
| ESLint                  | 9              | eslint-plugin-react and jsx-a11y do not support 10 (npm marks 9 deprecated) |
| Vitest                  | 4.1             | the Storybook Vitest addon supports `^3 \|\| ^4`                        |
| Prisma (Phase 2)        | 7.x             | npm `latest` is an 8.0 release candidate                                 |
| pnpm                    | 11              | see Prerequisites                                                        |

Resolved majors at bootstrap (2026-09-29): Node 24, pnpm 11, Turborepo 2, TypeScript 6, NestJS 12, Next.js 16, React 19, next-intl 4, Zod 4, Tailwind CSS 4, Storybook 10, Vitest 4, Playwright 1, ESLint 9.

## Quality gates

CI (`.github/workflows/ci.yml`) runs on pull requests and on pushes to `main`:

1. **quality:** format check, lint, typecheck, unit/integration/story tests, build, Storybook build.
2. **e2e:** Playwright on iPhone 15, Pixel 7 and desktop Chrome.
3. **images:** `docker/scripts/verify-images.sh`.
4. **secrets:** gitleaks scan of the full git history (see `SECURITY.md`).

Dependabot (`.github/dependabot.yml`) proposes npm, GitHub Actions and Docker base-image updates weekly, with a 1-day cooldown and the deliberate holds ignored.

The `quality` and `e2e` jobs restore the local Turborepo cache (`.turbo/cache`) with `actions/cache`. A remote cache is not configured.

Before merge you also need a review.

## Agent files

- `CLAUDE.md` and `.claude/` hold the project rules for Claude Code.
- `AGENTS.md` is written by Turborepo, which adds a managed block whenever it detects an AI agent. The block tells agents to read the installed Turborepo version's bundled docs. It is kept committed on purpose, so the next agent run does not leave an uncommitted change. To opt out, set `"agentGuidance": false` in `turbo.json`.
