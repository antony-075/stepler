# Development

## Prerequisites

- **Node.js 24 LTS** (`.nvmrc`). With nvm: `nvm install && nvm use`.
- **pnpm 11.28.2** via corepack: `corepack enable`. The version comes from `packageManager` in `package.json`. pnpm 12 is not used, because corepack cannot run its native binary.
- **Docker** (Docker Desktop or compatible) for local infrastructure and image checks.
- **Media tools** for the worker's previews and its tests (spike S5): libheif's CLI with the libde265 HEVC decoder (HEIC photos) and ffmpeg/ffprobe (video posters). macOS: `brew install libheif ffmpeg` (`heif-dec`, libheif 1.23, includes libde265); Ubuntu 24.04: `sudo apt-get install libheif-examples libheif-plugin-libde265 ffmpeg`. Check with `heif-dec --list-decoders` (lists `libde265`). The worker image installs its own (Debian 12: `heif-convert`, ffmpeg 5.1).
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
pnpm infra:up     # docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait
pnpm infra:down   # docker compose -f docker/compose.yaml --env-file docker/.env down
```

| Service    | Address                                              |
| ---------- | ---------------------------------------------------- |
| PostgreSQL | `127.0.0.1:5433` (host port, `POSTGRES_PORT`)        |
| Mailpit    | SMTP `127.0.0.1:1025`, UI http://127.0.0.1:8025      |
| S3 (SeaweedFS) | `http://127.0.0.1:8333`, credentials `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` from `docker/.env` |

### Local links

| What | Address | Started by |
| ---- | ------- | ---------- |
| Web | http://localhost:3000 | `pnpm dev` |
| API | http://localhost:4000/api/v1 | `pnpm dev` |
| Swagger UI (local only; not served in production mode) | http://localhost:4000/api/docs | `pnpm dev` |
| API health | http://localhost:4000/api/v1/health/live, `/health/ready` | `pnpm dev` |
| Mailpit (sent email) | http://127.0.0.1:8025 | `pnpm infra:up` |
| Prisma Studio (database UI) | http://localhost:5555 | `pnpm db:studio` |
| PostgreSQL (TablePlus, DBeaver, psql) | `127.0.0.1:5433`, user and password from `docker/.env` | `pnpm infra:up` |
| S3 emulator API | http://127.0.0.1:8333 | `pnpm infra:up`, then `pnpm storage:bootstrap` |
| Bucket browser (SeaweedFS filer UI; no auth, localhost only) | http://127.0.0.1:8888/buckets/ | `pnpm infra:up` |
| Storybook | http://localhost:6006 | `pnpm storybook` |
| e2e servers | web :3100, api :4100 | `pnpm e2e` |

Staging and provider consoles: https://stepler-staging.onrender.com (site), https://dashboard.render.com (deploys, logs, env), https://dash.cloudflare.com (R2, Turnstile), https://app.brevo.com (staging email), https://console.cloud.google.com/apis/credentials (OAuth clients).

- PostgreSQL uses host port 5433 so it does not clash with a locally installed PostgreSQL.
- On first start, `docker/postgres/init/` creates `stepler_test` (API integration tests), `stepler_e2e` (Playwright) and `stepler_shadow` (Prisma's shadow database for the drift check; Prisma resets it). Init scripts run only on an empty volume. For a volume created before Phase 2, either run `docker compose -f docker/compose.yaml --env-file docker/.env down -v` (this deletes local data) or create the three databases by hand.
- API tests read the PostgreSQL credentials from `docker/.env` (or `docker/.env.example` when it is absent). `TEST_DATABASE_URL` / `TEST_SHADOW_DATABASE_URL` override them.
- The S3 emulator is SeaweedFS (ADR 0008, spike S4). After the first start, run `pnpm storage:bootstrap`: it creates the `stepler-dev` and `stepler-test` buckets with CORS for the local web origins, and is safe to rerun. The API's `S3_*` values must match `docker/.env`.
- `pnpm worker:dev` runs the background worker (ADR 0009) against the same `apps/api/.env`. Without it deleted content and deleted collections are not purged (they stay hidden) and, from the processing slice on, previews stay pending. It serves no page; it logs `worker started` once it polls.

## Commands

Run everything from the repository root.

Every tool or process a developer starts has a root `package.json` script and a row in this table (and in **Local links** when it serves a page).

| Command                                         | What it does                                                  |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `pnpm install`                                  | Install dependencies                                          |
| `pnpm infra:up` / `pnpm infra:down`             | Start (and wait for healthy) / stop Postgres, Mailpit and the S3 emulator |
| `pnpm storage:bootstrap`                        | Create the local buckets and CORS; safe to rerun              |
| `pnpm dev`                                      | Build workspace packages, then run api (4000), web (3000) and contracts in watch mode |
| `pnpm worker:dev`                               | Background worker in watch mode (purges, sweeps; ADR 0009), built into `apps/api/dist-worker` so it never touches the API's `dist`. Reads `apps/api/.env`; run it next to `pnpm dev` |
| `pnpm build`                                    | Build all packages and apps                                   |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`    | Quality checks (Turborepo, cached). In `@stepler/ui`, `test` runs the Storybook stories in headless Chromium in two Vitest projects: `storybook` (all stories except those tagged `reduced-motion`) and `storybook-reduced-motion` (only those, with `prefers-reduced-motion: reduce` emulated; see `docs/ux/design-system.md` → Motion) |
| `pnpm e2e`                                      | Build, start production servers on 3100/4100 and the worker, migrate and empty `stepler_e2e`, run Playwright. Needs `pnpm infra:up`, `storage:bootstrap` and network (Turnstile's test key loads Cloudflare's script). Safe while `pnpm dev` runs: the API is built into `apps/api/dist-e2e` (`build:e2e`), and `next build` keeps `next dev`'s `.next/dev` |
| `pnpm e2e -- --shard=1/2`                       | Run one half of the Playwright tests (CI runs shards `1/2` and `2/2` in parallel); any Playwright flag works after `--`, e.g. `-- --grep @desktop` |
| `pnpm build-storybook`                          | Static Storybook build                                        |
| `pnpm storybook`         | Storybook dev server on 6006                                  |
| `pnpm format` / `pnpm format:check`             | Prettier (Markdown, docs and `.claude/` are not formatted)    |
| `bash docker/scripts/verify-images.sh`          | Build the api, worker and web images and check non-root, no `.env`, no dev deps, health, proxy, and that the worker starts and stops on SIGTERM |
| `pnpm db:migrate`         | Create/apply migrations against `DATABASE_URL` (`prisma migrate dev`; raw SQL rules in ADR 0005) |
| `pnpm db:deploy`          | Apply pending migrations (`prisma migrate deploy`)            |
| `pnpm db:studio`          | Prisma Studio on 5555 against `DATABASE_URL` (the API's `.env`) |
| `pnpm db:check`           | Fail if migrations and schema differ; needs `SHADOW_DATABASE_URL` |
| `pnpm openapi:write`      | Regenerate `apps/api/openapi.json`; the API test suite fails when it is stale |

Local `.env` files: copy `apps/api/.env.example` to `apps/api/.env`, and `apps/web/.env.example` to `apps/web/.env`. `pnpm dev` loads them. Turborepo runs in strict env mode, so every new runtime variable must also be added to `passThroughEnv` in `turbo.json`.

## Branches and environments

```
feature branch ──PR──► dev ──PR──► stage ──PR──► main
                        │           │             │
                 local only   staging (deployed)  production
```

| Branch | Environment | Configuration |
| --- | --- | --- |
| `dev` | local development only; never deployed | `apps/api/.env`, `apps/web/.env`, `docker/.env` on the developer's machine |
| `stage` | staging: a deployed copy of `dev` | its own secrets: database, `APP_SECRET`, `APP_ORIGIN`, S3 bucket and keys, SMTP, Turnstile keys, Google OAuth client |
| `main` | production | its own secrets, never shared with staging (rule 17) |

- `dev` is the default branch. Start work from it (`git switch -c <type>/<topic> dev`) and open PRs against it; Dependabot targets it too.
- Promote with PRs: `dev` → `stage` to deploy to staging, `stage` → `main` to release.
- Merge with **merge commits** (no squash, no rebase), so the branches share history and a promotion PR contains exactly what the source branch has.
- Changes to `dev`, `stage` and `main` land only through PRs with green CI (`secrets`, `quality`, `e2e`, `images`); no direct pushes, force-pushes or deletions. **Not enforced by GitHub yet:** branch protection for a private repository needs GitHub Pro (the API returns 403 on the free plan), so for now this is a team rule. The intended settings: required checks above, required PR (0 approvals), include administrators, no force-push, no deletion.
- Name branches by type: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `test/…`.
- CI runs on every PR and on pushes to `dev`, `stage` and `main`. Deployment (`stage` → staging, `main` → production) is wired up when hosting is chosen.

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
| `API_TRUST_PROXY` | api | no | Express `trust proxy`: `false` (default), a hop count, or a trust string such as `loopback`. `true` is rejected (it would trust any client's `X-Forwarded-For`) |
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
| `LIMIT_COLLECTION_CREATIONS_PER_DAY` | api | no | Collections an account may create per rolling 24 hours, counted from audit events; default `10` |
| `LIMIT_STORAGE_BYTES_PER_ACCOUNT` | api | no | Bytes, default 20 GiB |
| `LIMIT_STORAGE_BYTES_PER_COLLECTION` | api | no | Bytes, default 10 GiB |
| `LIMIT_GUEST_LINKS_PER_COLLECTION` | api | no | Non-revoked additional guest links per collection (the default link does not count); default `10` |
| `LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE` | api | no | Public guest link resolves per client IP per minute; default `120` (guests on one venue Wi-Fi share an IP) |
| `LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE` | api | no | Guest session exchanges (opening a guest link) per client IP per minute; default `120` (venue NAT, as above) |
| `LIMIT_FILE_BYTES_PHOTO` | api | no | Largest photo in bytes (decimal); default `50000000` (50 MB) |
| `LIMIT_FILE_BYTES_VIDEO` | api | no | Largest video in bytes; default `2000000000` (2 GB) |
| `LIMIT_FILE_BYTES_DOCUMENT` | api | no | Largest document in bytes; default `50000000` (50 MB) |
| `LIMIT_FILES_PER_BATCH` | api | no | Files a guest may pick at once (enforced by the guest page); default `100` |
| `LIMIT_TEXTS_PER_GUEST_SESSION_PER_HOUR` | api | no | Texts one guest session may send per rolling hour; default `60` |
| `LIMIT_UPLOAD_INITIATIONS_PER_GUEST_SESSION_PER_HOUR` | api | no | Upload starts one guest session may make per rolling hour; default `300` |
| `LIMIT_CONCURRENT_UPLOADS_PER_GUEST_SESSION` | api | no | Uploads one guest session may have in progress at once; default `10` |
| `UPLOAD_PART_SIZE_BYTES` | api | no | Part size of every upload (all uploads are multipart; a smaller file is one part), at least `5242880`; default `10485760` (10 MiB) |
| `LIMIT_UPLOAD_CALLS_PER_IP_PER_MINUTE` | api | no | Upload API calls (start, parts, complete, cancel) per client IP per minute, per route; default `600` (venue NAT) |
| `LIMIT_UPLOAD_CALLS_PER_GUEST_SESSION_PER_MINUTE` | api | no | The same per guest session; default `240` |
| `S3_REQUEST_TIMEOUT_MS` | api, worker | no | A storage call fails after this long (the API answers 503, retryable); default `15000` |
| `S3_COMPLETE_TIMEOUT_MS` | api, worker | no | The same for assembling a multipart upload; default `60000` |
| `UPLOAD_SESSION_TTL_HOURS` | api | no | An upload not completed within this many hours expires and its bytes are discarded; default `24` |
| `UPLOAD_URL_TTL_SECONDS` | api, worker | no | Lifetime of presigned upload URLs; a deleted collection's purge waits this long plus an hour; default `900` |
| `MEDIA_URL_WINDOW_SECONDS` | api | no | Media download URLs are signed per window of this length and stay valid for two; default `3600` |
| `LIMIT_TEXTS_PER_IP_PER_MINUTE` | api | no | Guest texts per client IP per minute, across sessions; default `60` (venue NAT) |
| `LIMIT_GUEST_READS_PER_IP_PER_MINUTE` | api | no | Guest reads (context, content list, one item) per client IP per minute, per route; default `600` |
| `WORKER_MEDIA_CONCURRENCY` | worker | no | Media jobs one worker runs at once; default `1` (memory, spike S5) |
| `WORKER_PURGE_BATCH_SIZE` | worker | no | Objects deleted per storage call and rows per sweep step, `1`–`1000`; default `500` |
| `GUEST_SESSION_IDLE_DAYS` | worker | no | Guest sessions idle this many days that never contributed are deleted by the hourly sweep; default `400` (the guest cookie's lifetime) |
| `API_INTERNAL_URL` | web | yes | http(s) origin the web server forwards `/api/*` to; read at runtime |
| `API_INTERNAL_HOSTPORT` | web | instead of `API_INTERNAL_URL` | `host:port` of a private API service as a platform exposes it (Render `hostport`); becomes `http://host:port` |
| `CLIENT_IP_HEADER` | web | no | Header in which the edge sets the client IP and overwrites client-sent values (Render: `cf-connecting-ip`). The web forwards only that IP to the API; all other forwarding headers are always dropped. `x-forwarded-for`, `forwarded` and `x-real-ip` are rejected (client-controlled). Unset: no client IP is forwarded. Replaces `TRUST_PROXY_HEADERS`, which is now ignored |
| `PORT`, `HOSTNAME` | web | no | Standalone Next.js server bind address |

The api, the worker and the web app validate their env at startup and exit when it is invalid. The worker reads `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`, the `S3_*` variables and the `WORKER_*` / `GUEST_SESSION_IDLE_DAYS` rows above; it needs no SMTP, Turnstile or `APP_SECRET`. Error messages name the variables but never print their values.

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
2. **e2e:** Playwright on iPhone 15, Pixel 7 and desktop Chrome, split into two parallel shards (`--shard=1/2`, `2/2`; add a third if a shard passes 25 minutes of the 35-minute timeout). Tag admin-only management journeys `@desktop` in the test title (`test('… @desktop', …)`): the mobile projects skip them (`grepInvert`). Guest journeys and anything that must work on a phone stay untagged and run on all three projects.
3. **images:** `docker/scripts/verify-images.sh`.
4. **secrets:** gitleaks scan of the full git history (see `SECURITY.md`).

Dependabot (`.github/dependabot.yml`) proposes npm, GitHub Actions and Docker base-image updates weekly, with a 1-day cooldown and the deliberate holds ignored.

The `quality` and `e2e` jobs restore the local Turborepo cache (`.turbo/cache`) with `actions/cache`. A remote cache is not configured.

Before merge you also need a review.

## Agent files

- `CLAUDE.md` and `.claude/` hold the project rules for Claude Code.
- `AGENTS.md` is written by Turborepo, which adds a managed block whenever it detects an AI agent. The block tells agents to read the installed Turborepo version's bundled docs. It is kept committed on purpose, so the next agent run does not leave an uncommitted change. To opt out, set `"agentGuidance": false` in `turbo.json`.
