# Development

## Prerequisites

- **Node.js 24 LTS** (`.nvmrc`). With nvm: `nvm install && nvm use`.
- **pnpm 11.28.2** via corepack: `corepack enable`. The version comes from `packageManager` in `package.json`. pnpm 12 is not used, because corepack cannot run its native binary.
- **Docker** (Docker Desktop or compatible) for local infrastructure and image checks.
- Playwright browsers for UI and E2E tests: `pnpm --filter @eventdrop/ui exec playwright install chromium` and `pnpm --filter @eventdrop/e2e exec playwright install chromium webkit`.

## Workspace

| Path                  | Package                | Purpose                                                                |
| --------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `apps/api`            | `@eventdrop/api`       | NestJS 12 REST API (ESM)                                               |
| `apps/web`            | `@eventdrop/web`       | Next.js 16 web app (guest + admin), proxies `/api/*` to the API        |
| `packages/contracts`  | `@eventdrop/contracts` | Zod schemas shared by API and web (built with `tsc`)                   |
| `packages/ui`         | `@eventdrop/ui`        | shadcn/Radix/Tailwind components + Storybook                           |
| `packages/config`     | `@eventdrop/config`    | tsconfig, ESLint and Prettier presets                                  |
| `e2e`                 | `@eventdrop/e2e`       | Playwright tests against production builds                             |
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

- PostgreSQL uses host port 5433 so it does not clash with a locally installed PostgreSQL.
- Nothing uses these services yet: Prisma and mail arrive in Phase 2.
- The S3-compatible storage emulator is added in Phase 2 (spike S4).
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
| `pnpm --filter @eventdrop/ui storybook`         | Storybook dev server on 6006                                  |
| `pnpm format` / `pnpm format:check`             | Prettier (Markdown, docs and `.claude/` are not formatted)    |
| `bash docker/scripts/verify-images.sh`          | Build production images and check non-root, no `.env`, no dev deps, health, proxy |

Local `.env` files: copy `apps/api/.env.example` to `apps/api/.env`, and `apps/web/.env.example` to `apps/web/.env`. `pnpm dev` loads them. Turborepo runs in strict env mode, so every new runtime variable must also be added to `passThroughEnv` in `turbo.json`.

## Environment variables

These are names only; real values never go into the repository. Staging and production use separate credentials.

| Variable              | App | Required | Purpose                                                                                       |
| --------------------- | --- | -------- | --------------------------------------------------------------------------------------------- |
| `NODE_ENV`            | api | yes      | `development`, `test` or `production`                                                         |
| `API_PORT`            | api | no       | Listen port, default `4000`                                                                   |
| `LOG_LEVEL`           | api | no       | `fatal`…`trace`, default `info`                                                               |
| `API_INTERNAL_URL`    | web | yes      | http(s) origin the web server forwards `/api/*` to; read at runtime                           |
| `TRUST_PROXY_HEADERS` | web | no       | `true` only behind an edge that overwrites `X-Forwarded-*`; default `false` (headers dropped) |
| `PORT`, `HOSTNAME`    | web | no       | Standalone Next.js server bind address                                                        |

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

Before merge you also need a review.
