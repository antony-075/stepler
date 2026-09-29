# Stepler Phase 2 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production foundations every MVP slice depends on:
- configuration;
- structured logging with request IDs;
- problem+json errors and OpenAPI;
- PostgreSQL through Prisma with migrations;
- provider ports (object storage, mail, Turnstile, error reporting);
- readiness health;
- config-driven limits;
- a complete admin authentication boundary (magic link, Google OAuth, sessions, CSRF, principal and operator resolution) with a minimal web login flow.

No product features (collections, guest links, uploads).

**Architecture:** This extends the Phase 1 skeleton (branch `bootstrap/phase-1`). Three uncertain choices are settled first by throwaway spikes, recorded in ADRs:
- S6: Prisma migrations with raw SQL constraints;
- S4: the S3-compatible emulator;
- S1: in-house auth vs Better Auth.

Provider integrations sit behind ports in `apps/api/src/<provider>/`, with one real adapter each (rule 02, rule 18). Tests use test doubles only at those boundaries. Authentication is enforced by a global guard: **default deny**, and routes opt out with `@Public()`.

**Tech Stack:**
- Phase 1 stack;
- Prisma 7.10 + `@prisma/adapter-pg` + `pg` on PostgreSQL 18;
- `nestjs-pino`, `@nestjs/throttler`, `arctic` (Google OAuth), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, `nodemailer`;
- web: `@tanstack/react-query`, `react-hook-form` + `@hookform/resolvers`.

**Spec:**
- `docs/architecture/mvp-architecture-spec.md` §5–§9, §13, §17–§19;
- ADR 0004 (API), 0005 (contracts), 0006 (auth), 0008 (storage), 0010 (limits), 0012 (Turnstile), 0013 (operator);
- `BOOTSTRAP.md` Phase 2;
- Phase 1 plan `docs/superpowers/plans/2026-09-29-bootstrap-phase-1.md`, for conventions.

## Global Constraints

Everything in the Phase 1 plan's Global Constraints still applies:
- Node 24, pnpm 11.28.2, ESM;
- exact pins, at least 1 day old, `catalog:` for shared versions, `allowBuilds` entries;
- no hardcoded user-facing strings;
- env validated at startup, and errors never print values;
- commit trailer.

Additional constraints:

- **API errors:** RFC 9457 `application/problem+json`, body `{ type, title, status, code, detail?, retryable, requestId, errors? }`. `code` comes from `ERROR_CODES` in `@stepler/contracts`. The web app translates codes; the API never returns localized prose.
- **Authorization:** a global `AuthGuard` denies every route except `@Public()` ones. Admin data is scoped by `principal.userId`. A resource outside scope returns 404.
- **Secrets at rest:** session tokens and magic-link tokens are random 32-byte values. Only `sha256` hashes are stored; the raw token is never logged or persisted.
- **Logging:**
  - pino JSON with `requestId`;
  - redacted: `cookie`, `set-cookie`, `authorization`, and query values of `token`, `code`, `state`, `X-Amz-*`;
  - request bodies are never logged.
- **Cookies:**
  - `st_session`: `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` when `COOKIE_SECURE=true` (default `true` in production, `false` otherwise);
  - OAuth transaction cookie `st_oauth`: `HttpOnly; SameSite=Lax; Path=/api/v1/auth/google; Max-Age=600`.
- **CSRF:** **every** unsafe method (`POST/PUT/PATCH/DELETE`) must send `Origin` equal to `APP_ORIGIN`; otherwise `403 CSRF_ORIGIN_MISMATCH`. This blocks the cross-site form of login CSRF, where an attacker page posts its own magic-link token so the victim is signed in as the attacker. It does not block an attacker who sends the victim a real `${APP_ORIGIN}/auth/verify?token=<attacker token>` link: that POST comes from our own origin. Against that case, the verify page first shows the email the link signs in to ("Sign in as anton@…?"), read through a non-consuming preview endpoint (Task 13), so the victim sees a foreign address before clicking. The app shell also shows the signed-in email (Task 15). Owner decision, 2026-09-29. Future server-to-server endpoints (payment webhooks) opt out explicitly with `@SkipOriginCheck()` and must authenticate by signature.
- **Public URLs** (magic links, OAuth redirect URI) are built from `APP_ORIGIN`, never from request `Host` or forwarded headers.
- **Client IP:** `req.ip` with Express `trust proxy` from `API_TRUST_PROXY` (default `false`). Documented limitation: behind the web proxy without a trusted edge, all clients share the web server's IP, so IP limits act as global limits. This is resolved with the hosting decision.
- **Tests:**
  - integration tests use the real PostgreSQL, S3 emulator and Mailpit from `docker/compose.yaml`, with database `stepler_test`;
  - API integration files run with `fileParallelism: false` and truncate tables between files;
  - Google and Turnstile are exercised against test doubles of their ports.
  - Turnstile additionally runs an opt-in live test with Cloudflare's documented test keys, marked `@network`.
- **Local ports (unchanged):** api 4000, web 3000, Postgres 5433, Mailpit 1025/8025. The S3 emulator uses 8333 (API) unless S4 picks an image with a different default; the port is recorded in the ADR.

## Deliberate deviations from the spec (for owner review)

**Status: all five approved by the owner on 2026-09-29.**

1. **Magic link verification is a POST from a web page, not `GET /auth/magic-link/verify`.** Email security scanners (for example Outlook Safe Links) fetch GET links and would burn single-use tokens. The email links to `${APP_ORIGIN}/auth/verify?token=…`. That page reads the email through a non-consuming `POST /api/v1/auth/magic-link/preview` and shows "Sign in as <email>". The "Sign in" button calls `POST /api/v1/auth/magic-link/verify`. This updates spec §9.
2. **Legal acceptance (`LegalAcceptance`, acceptance gate) moves to Phase 4 slice 10 (Legal pages).** The texts do not exist yet (D15/F8). Slice 10 adds a gate that also covers users created before it, and there are no real users before launch.
3. **The Jobs port (pg-boss) is deferred to Phase 4 slice 5 (upload),** its first consumer. A port without a consumer would be dead code (CLAUDE.md §14).
4. **No OpenAPI client code generation for the web app.** `openapi-typescript` 7.13 declares `typescript ^5` and we use 6.0. The web app imports request/response types and schemas directly from `@stepler/contracts`, the same source the API validates with. OpenAPI stays the documented public contract and is snapshot-checked in CI. This updates spec §4 and ADR 0005.
5. **`AuditEvent` is created with its first audited action** (collections, Phase 4 slice 1), not in Phase 2.

## Review Focus

1. **Email scanners prefetching the magic link.** Opening `/auth/verify?token=…` any number of times must not consume the token: the page's preview call is read-only, and only the verify POST consumes. Tested in Task 16 (e2e: load the page twice, then sign in).
2. **Double submission of one magic link** (double click, two tabs). Two concurrent verify POSTs must produce exactly one session and one `200`. The other returns `400 MAGIC_LINK_INVALID`. Tested in Task 13 with `Promise.all`.
3. **Account enumeration.** Unknown, existing and blocked emails get the same `202` with the same body, and are rate-limited the same way. Only unblocked addresses receive mail. Tested in Task 13.
4. **Secrets in logs.** A request to `/api/v1/auth/google/callback?code=abc&state=def` or with a `Cookie` header produces log lines with none of those values. Tested in Task 5.
5. **Email identity.** `Anton@Example.com ` and `anton@example.com` are one user, both when signing in by link and through Google. A Google identity with `email_verified=false` never attaches to an existing account. Tested in Tasks 13 and 14.

---

### Task 1: Spike S6 — Prisma 7 migrations with database-enforced constraints (throwaway)

**Files:** none in the repo. The result goes into `docs/architecture/decisions/0005-contracts-and-validation.md` (new section `## Spike S6 result`) and spec §7 and §18.

**Interfaces — produces a recorded decision used by Tasks 7 and 12–14:**
- how raw-SQL constraints live in migrations without drift;
- whether IDs use DB-side `uuidv7()` or Prisma-side `uuid(7)`;
- the test-database reset method.

- [x] **Step 1:** In `$TMPDIR/stepler-spikes/s6`, create a NestJS 12 ESM app like ADR 0005 with Prisma 7.10 (`prisma-client` generator, `moduleFormat = "esm"`, `@prisma/adapter-pg`, `prisma.config.ts`), against compose Postgres 18 on port 5433. Model:
  - `User(id uuid @default(dbgenerated("uuidv7()")), email citext @unique, status UserStatus @default(ACTIVE))`;
  - `Thing(id, userId, isDefault Boolean, revokedAt DateTime?)`.
- [x] **Step 2:** Create the first migration with `prisma migrate dev --create-only`. Add to its SQL:
  - `CREATE EXTENSION IF NOT EXISTS citext`;
  - `CHECK (status IN (...))` beyond the enum, as an example CHECK;
  - `CREATE UNIQUE INDEX thing_one_default ON "Thing"("userId") WHERE "isDefault" AND "revokedAt" IS NULL`.

  Apply it.
- [x] **Step 3: Pass criteria.**
  1. A second `prisma migrate dev` reports no drift and generates no migration that drops the partial index or the CHECK.
  2. `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` exits 0. The shadow database comes from `datasource.shadowDatabaseUrl` in `prisma.config.ts`; 7.10 has no `--shadow-database-url` flag.
  3. Inserting two live defaults for one user fails with Prisma error `P2002`, or a raw error mapped by code.
  4. `SELECT uuidv7()` works and ids sort by creation time.
  5. `TRUNCATE ... RESTART IDENTITY CASCADE` over all model tables resets state in under 100 ms.

  If criterion 1 or 2 fails, document the workaround:
  - Prisma's `@@index(..., where: ...)` if 7.10 supports partial indexes;
  - otherwise, a CI check that diffs against migrations only.
- [x] **Step 4:** Record the result, delete the spike, and commit `docs: record Prisma migration spike result`.

### Task 2: Spike S4 — S3-compatible emulator (throwaway)

**Files:** none in the repo. The result goes into ADR 0008 (new section `## Spike S4 result`) and spec §19.

**Interfaces — produces the decision used by Task 8:**
- image and tag, pinned by digest;
- compose service definition;
- the bucket and CORS bootstrap command;
- the S3 client settings (`forcePathStyle`, region).

Context: MinIO's GitHub repository is archived (2026-04) and its Docker Hub image is gone.

- [x] **Step 1: Candidates.** All were updated on Docker Hub within the last day as of 2026-09-29:
  - `chrislusf/seaweedfs` (Apache-2.0);
  - `rustfs/rustfs` (Apache-2.0);
  - `dxflrs/garage` (AGPL-3.0; acceptable as a dev-only service).

  Run each from compose with a bootstrap step that creates bucket `stepler-dev`.
- [x] **Step 2: Pass criteria**, run with a script using `@aws-sdk/client-s3` + `s3-request-presigner`:
  1. `HeadBucket` succeeds.
  2. A presigned PUT with signed `Content-Type` and `Content-Length` uploads, and a mismatched `Content-Length` is rejected.
  3. A presigned GET downloads with `response-content-disposition` honoured.
  4. Multipart upload with presigned part URLs; `ListParts` then `CompleteMultipartUpload`.
  5. A bucket CORS rule allowing `PUT`/`GET` from `http://localhost:3000` and exposing `ETag` works in a browser preflight (`curl -X OPTIONS` with `Origin` / `Access-Control-Request-Method`).
  6. Container healthy in under 20 s.

  Prefer permissive licence, then fewer bootstrap steps.
- [x] **Step 3:** Record which R2 behaviours the emulator does **not** reproduce: equal part sizes, no presigned POST, EU jurisdiction endpoint. These stay staging-only checks.
- [x] **Step 4:** Record the result, delete the spike, and commit `docs: record S3 emulator spike result`.

### Task 3: Spike S1 — authentication implementation (throwaway)

**Files:** none in the repo. The result goes into ADR 0006 (new section `## Spike S1 result`).

**Interfaces — produces the decision gating Tasks 12–15.**
- **If in-house wins:** those tasks run as written.
- **If Better Auth wins:** stop after this task. Revise Tasks 12–15 against Better Auth's API before continuing, and keep their tests and Review Focus items.

- [x] **Step 1** (partially executed: `better-auth` 1.7.6 with the magic-link plugin on the memory adapter; the Nest module, the Prisma adapter and Google were not mounted, because criteria 1 and 3 failed at the library level): In `$TMPDIR/stepler-spikes/s1`, mount `better-auth` 1.7 with `@thallesp/nestjs-better-auth` 2.8 in a NestJS 12 ESM app with the Prisma adapter. Enable the magic-link plugin and the Google provider (Google with dummy credentials; only the authorization-URL step is exercised).
- [x] **Step 2: Hard criteria** (1 and 3 fail; 5 passes; 7 partly observed; 2, 4, 6 and 8 not evaluated, see ADR 0006). Better Auth wins only if **all** hold:
  1. Session tokens are stored hashed, or can be configured to be.
  2. Table and column names map to spec §7.1 (`User`, `AuthAccount`, `AuthSession`), with UUIDv7 ids and a `citext` email.
  3. Magic-link verification can be a POST (scanner-safe).
  4. Sessions are resolvable inside our global guard as `Principal` without a second session lookup.
  5. Custom send-email hook, so we can use our Mailer port and uk/en templates.
  6. A pre-hook can require a valid Turnstile token on the magic-link request.
  7. The cookie name and attributes match the Global Constraints.
  8. It works under the web `/api` proxy (Set-Cookie and redirects).
- [x] **Step 3: Soft criteria** (only the security advisories were reviewed). Code size saved, maintenance (release cadence, open security issues), and how many of our tests it would replace.
- [x] **Step 4:** Record the decision with evidence per criterion, delete the spike, and commit `docs: record auth implementation spike result`.

### Task 4: Contracts — problem details, error codes, health readiness

**Files:**
- Create: `packages/contracts/src/errors.ts`, `packages/contracts/src/errors.test.ts`
- Modify: `packages/contracts/src/health.ts`, `packages/contracts/src/index.ts`

**Interfaces — produces:**
- `ERROR_CODES`: a readonly tuple of `'VALIDATION_FAILED' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CSRF_ORIGIN_MISMATCH' | 'RATE_LIMITED' | 'TURNSTILE_FAILED' | 'MAGIC_LINK_INVALID' | 'OAUTH_FAILED' | 'ACCOUNT_BLOCKED' | 'UPSTREAM_UNAVAILABLE' | 'DEPENDENCY_UNAVAILABLE' | 'INTERNAL'`, plus `type ErrorCode`.
- `problemDetailsSchema = z.object({ type: z.string(), title: z.string(), status: z.number().int(), code: z.enum(ERROR_CODES), detail: z.string().optional(), retryable: z.boolean(), requestId: z.string().optional(), errors: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })).optional() })`, plus `type ProblemDetails`.
- `healthReadyResponseSchema = z.object({ status: z.enum(['ok', 'degraded']), checks: z.object({ database: z.enum(['ok', 'fail']), storage: z.enum(['ok', 'fail']) }) }).strict()`.

- [ ] **Step 1: Failing tests.**
  - A valid problem parses.
  - An unknown `code` is rejected.
  - `errors[].path` accepts `['items', 0, 'name']`.
  - The readiness schema rejects extra keys.
- [ ] **Step 2:** Run `pnpm --filter @stepler/contracts test` → FAIL.
- [ ] **Step 3:** Implement and export from `index.ts`.
- [ ] **Step 4:** Tests PASS, then `build`.
- [ ] **Step 5:** Commit `feat(contracts): add problem details, error codes and readiness schema`.

### Task 5: API configuration, limits and structured logging

**Files:**
- Modify:
  - `apps/api/src/config/env.ts`, `apps/api/src/config/env.spec.ts`, `apps/api/.env.example`
  - `apps/api/src/create-app.ts`, `apps/api/src/app.module.ts`
  - `turbo.json` (`passThroughEnv`)
  - `docs/development/README.md` (env table)
- Create:
  - `apps/api/src/config/config.module.ts` (global provider `API_ENV` token → `ApiEnv`)
  - `apps/api/src/limits/limits.service.ts`, `apps/api/src/limits/limits.module.ts`, `apps/api/src/limits/limits.service.spec.ts`
  - `apps/api/src/logging/logging.module.ts`, `apps/api/src/logging/redact.ts`, `apps/api/src/logging/redact.spec.ts`, `apps/api/test/logging.e2e.spec.ts`
- Dependencies: `nestjs-pino` 5.2.1, `pino` 10.3.1, `pino-http` 11.0.0 (dependencies); `pino-pretty` 13.1.3 (dev dependency; pretty output only when `NODE_ENV=development`).

**Interfaces — produces:**
- `ApiEnv` extended with:
  - `APP_ORIGIN` (http(s) URL origin);
  - `DATABASE_URL` (postgres URL);
  - `COOKIE_SECURE` (boolean; default `NODE_ENV === 'production'`);
  - `SESSION_TTL_DAYS` (int, default 30);
  - `MAGIC_LINK_TTL_MINUTES` (int, default 15);
  - `OPERATOR_EMAILS` (comma list → `string[]` lowercased, default `[]`);
  - `API_TRUST_PROXY` (`'false'` | hop count | Express trust string, default `'false'`);
  - `SMTP_URL` (smtp/smtps URL);
  - `MAIL_FROM` (`Name <addr>`);
  - `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`;
  - `APP_SECRET` (base64, ≥ 32 bytes decoded; the root key for HKDF-derived keys: OAuth cookie signing, IP hashing; distinct per environment);
  - `GOOGLE_CLIENT_ID?`, `GOOGLE_CLIENT_SECRET?` (both or neither);
  - `S3_ENDPOINT?` (absent = AWS/R2 default), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (boolean);
  - `LIMIT_MAGIC_LINK_PER_EMAIL_PER_HOUR` (5), `LIMIT_MAGIC_LINK_PER_IP_PER_HOUR` (20), `LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR` (60), `LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT` (3), `LIMIT_STORAGE_BYTES_PER_ACCOUNT` (20 GiB), `LIMIT_STORAGE_BYTES_PER_COLLECTION` (10 GiB).
- `LimitsService.magicLink(): { perEmailPerHour: number; perIpPerHour: number; previewPerIpPerHour: number }` and `LimitsService.forUser(user: { id: string }): { activeCollections: number; storageBytes: bigint }`. The second is config-backed now; plans/entitlements plug in later (ADR 0010).
- `redactUrl(url: string): string` replaces values of query keys `token|code|state|x-amz-*` (case-insensitive) with `[REDACTED]`.
- `LoggingModule`:
  - pino-http;
  - `genReqId` uses an incoming `x-request-id` when it matches `/^[A-Za-z0-9._-]{8,128}$/`, else `randomUUID()`;
  - the id is echoed as the `x-request-id` response header;
  - redaction paths `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`;
  - the `req.url` serializer uses `redactUrl`.
- `createApp` uses `bufferLogs: true` + `app.useLogger(app.get(Logger))`, `app.set('trust proxy', env.API_TRUST_PROXY)`, and sets `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` on all API responses.

- [ ] **Step 1: Failing tests.**
  - **env:**
    - valid full env parses;
    - `GOOGLE_CLIENT_ID` without the secret fails naming both;
    - `OPERATOR_EMAILS=' A@x.io, b@y.io '` → `['a@x.io','b@y.io']`;
    - `COOKIE_SECURE` defaults per `NODE_ENV`;
    - `APP_SECRET` shorter than 32 decoded bytes fails;
    - errors never contain values (reuse the Phase 1 test).
  - **limits:** defaults and overrides from env.
  - **redact:** `/api/v1/auth/google/callback?code=abc&state=def&x=1` → `?code=[REDACTED]&state=[REDACTED]&x=1`; `X-Amz-Signature` is redacted.
  - **logging e2e:** capture the pino destination stream in the test.
    - A request with `Cookie: st_session=secret` and `?token=tok123` produces log output that contains the request id but neither `secret` nor `tok123`.
    - A valid incoming `x-request-id: abcd1234` is echoed; an invalid `x-request-id: <script>` is replaced.
- [ ] **Step 2:** Run the tests → FAIL.
- [ ] **Step 3:** Implement. Add all new variables to `turbo.json` `dev`/`e2e` `passThroughEnv`.
- [ ] **Step 4:** Run `pnpm --filter @stepler/api test lint typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(api): add typed config, limits and structured logging with redaction`.

### Task 6: Errors, validation and OpenAPI

**Files:**
- Create:
  - `apps/api/src/errors/app-error.ts`, `apps/api/src/errors/problem.filter.ts`, `apps/api/src/errors/problem.filter.spec.ts`
  - `apps/api/src/errors/error-reporter.ts` (port + `LoggingErrorReporter`)
  - `apps/api/src/openapi/openapi.ts`, `apps/api/scripts/write-openapi.ts`
  - `apps/api/openapi.json` (generated, committed)
  - `apps/api/test/errors.e2e.spec.ts`
- Modify: `apps/api/src/create-app.ts`, `apps/api/package.json` (scripts `openapi:write`, `openapi:check`)

**Interfaces — produces:**
- `class AppError extends Error { constructor(readonly code: ErrorCode, readonly status: number, options?: { detail?: string; retryable?: boolean; cause?: unknown }) }`.
- `ERROR_REPORTER` injection token; `interface ErrorReporter { capture(error: unknown, context: { requestId?: string; path?: string }): void }`. The only adapter now is `LoggingErrorReporter` (logs at `error` with the stack). The monitoring provider is an open decision (spec §21).
- The global `ProblemFilter` maps:
  - `AppError` → its code and status;
  - `NotFoundException` / unknown route → `404 NOT_FOUND`;
  - `ThrottlerException` → `429 RATE_LIMITED` (`retryable: true`) with a `Retry-After` header;
  - validation → `400 VALIDATION_FAILED` with `errors[]`;
  - anything else → `500 INTERNAL` (generic title, no detail) and `ErrorReporter.capture`.

  Every response carries `content-type: application/problem+json` and `requestId`.
- Global `new StandardSchemaValidationPipe({ transform: true, exceptionFactory })`, where `exceptionFactory` throws `AppError('VALIDATION_FAILED', 400)` carrying the issues.
- `buildOpenApiDocument(app): OpenAPIObject` (title `Stepler API`, version `1`, cookie auth scheme `st_session`). Swagger UI is served at `/api/docs` only when `NODE_ENV !== 'production'`.
- `pnpm --filter @stepler/api openapi:write` writes `apps/api/openapi.json` (sorted keys, 2-space indent). `openapi:check` regenerates to a temp file and fails if it differs.

- [ ] **Step 1: Failing tests** (e2e with a test-only controller registered in the testing module):
  - body validation error → 400 problem with `errors[0].path = ['name']`;
  - unknown route → 404 problem;
  - thrown `new Error('db password=x')` → 500 whose body does not contain `password` and `ErrorReporter.capture` is called once (test double);
  - each problem body parses with `problemDetailsSchema`;
  - the response `requestId` equals the `x-request-id` header.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. `openapi:write` builds the app with `NestFactory.create` without `init()`, so no DB connection is needed.
- [ ] **Step 4:** PASS. Run `openapi:write`, commit the JSON, and confirm `openapi:check` passes.
- [ ] **Step 5:** Commit `feat(api): add problem+json errors, validation and OpenAPI snapshot`.

### Task 7: Database — Prisma, identity schema, test database

**Files:**
- Create:
  - `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`, `apps/api/prisma/migrations/<ts>_identity/migration.sql`
  - `apps/api/src/database/prisma.service.ts`, `apps/api/src/database/database.module.ts`
  - `apps/api/test/support/database.ts` (global setup + `resetDatabase()`)
  - `docker/postgres/init/01-test-database.sql` (databases `stepler_test` and `stepler_shadow`)
- Modify:
  - `apps/api/package.json` (dependencies `@prisma/client`, `@prisma/adapter-pg`, `pg`; dev dependencies `prisma`, `@types/pg`, all exact and in the catalog; scripts `db:migrate`, `db:deploy`, `db:check`, and `postinstall`/`build` running `prisma generate`)
  - `apps/api/vitest.config.ts` (projects: `unit` with parallel files, `integration` with `fileParallelism: false` and `globalSetup`)
  - `docker/compose.yaml` (mount the init dir)
  - `pnpm-workspace.yaml` (`allowBuilds` for `prisma`, `@prisma/engines`)
  - `.gitignore` (`apps/api/src/generated/`)

**Interfaces — produces**, following the Task 1 decision:

```text
User(id uuidv7, email citext unique, emailVerifiedAt?, displayName? ≤80, locale Locale @default(uk),
     status UserStatus @default(ACTIVE), blockedAt?, blockedReason?, createdAt, updatedAt)
AuthAccount(id, userId → User cascade, provider AuthProvider(GOOGLE|EMAIL), providerAccountId, createdAt)
  UNIQUE(provider, providerAccountId)
AuthSession(id, userId → User cascade, tokenHash unique, expiresAt, lastUsedAt, createdAt) INDEX(userId)
MagicLinkToken(id, email citext, tokenHash unique, expiresAt, consumedAt?, locale Locale, requestIpHash?, createdAt)
  INDEX(email, createdAt)
```

- SQL CHECKs: `char_length("displayName") <= 80`, and `status = 'BLOCKED'` ⇔ `blockedAt IS NOT NULL`.
- `requestIpHash` = HMAC-SHA256 of the IP with an HKDF key from `APP_SECRET` (info `ip-hash`). It is kept for abuse investigation, never displayed.
- `PrismaService extends PrismaClient`, connects in `onModuleInit` and disconnects in `onModuleDestroy`.
- `resetDatabase(): Promise<void>` truncates all model tables.
- `pnpm --filter @stepler/api db:check` runs the Task 1 drift check (exit 0 = no drift). It needs `SHADOW_DATABASE_URL` pointing at `stepler_shadow` (ADR 0005, Spike S6 result). Prisma resets the shadow database, so it must never point at the dev or test database. `SHADOW_DATABASE_URL` goes into `apps/api/.env.example` and CI.

- [ ] **Step 1: Failing integration tests** (`apps/api/test/database.e2e.spec.ts`):
  - inserting `User` emails `Anton@Example.com` then `anton@example.com` violates the unique constraint (citext);
  - `status: BLOCKED` without `blockedAt` violates the CHECK;
  - ids from sequential, awaited inserts sort ascending (`uuidv7()` is only sub-millisecond ordered across concurrent connections).
- [ ] **Step 2:** FAIL (no schema).
- [ ] **Step 3:** Write the schema and migration (raw SQL per Task 1) and the module. The init script creates databases `stepler_test` and `stepler_shadow` owned by `stepler`. Global setup runs `prisma migrate deploy` against the test `DATABASE_URL`.
- [ ] **Step 4:** Run `docker compose -f docker/compose.yaml --env-file docker/.env.example up -d --wait`, then `pnpm --filter @stepler/api test` → PASS, then `db:check` → exit 0.
- [ ] **Step 5:** Commit `feat(api): add Prisma with identity schema and test database`.

### Task 8: Object storage port, S3 adapter, emulator

**Files:**
- Create:
  - `apps/api/src/storage/object-storage.ts` (port)
  - `apps/api/src/storage/s3-object-storage.ts`, `apps/api/src/storage/storage.module.ts`
  - `apps/api/test/storage.e2e.spec.ts`
  - `apps/api/scripts/storage-bootstrap.ts` (dev/CI only: idempotent bucket + CORS through the SDK; `weed shell` is not idempotent, see ADR 0008 S4)
- Modify: `docker/compose.yaml` (SeaweedFS service from ADR 0008 S4, pinned by digest, bound to 127.0.0.1), `docker/.env.example`, `apps/api/.env.example`, `apps/api/package.json` (script `storage:bootstrap`), `docs/development/README.md`
- Dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (same exact version).

**Interfaces — produces:**
- `OBJECT_STORAGE` injection token with this port:

```ts
interface ObjectStorage {
  checkHealth(): Promise<void>; // throws on failure
  presignPut(key: string, opts: { contentType: string; contentLength: number; expiresInSeconds: number }): Promise<string>;
  presignGet(key: string, opts: { expiresInSeconds: number; contentType?: string; contentDisposition?: string }): Promise<string>;
  head(key: string): Promise<{ size: number; contentType?: string } | null>;
  delete(key: string): Promise<void>; // idempotent: missing key is success
}
```

  Multipart and range reads are added by the upload slice.
- `S3ObjectStorage` uses a single `S3Client` configured from `ApiEnv`, and never logs presigned URLs. Required settings (ADR 0008 S4): `requestChecksumCalculation` and `responseChecksumValidation` set to `'WHEN_REQUIRED'`, `forcePathStyle` from env, and `presignPut` passes `signableHeaders: new Set(['content-type'])`.

- [ ] **Step 1: Failing integration tests** against the emulator:
  - `checkHealth` resolves; with a wrong bucket it rejects;
  - a presigned PUT of 11 bytes via `fetch` succeeds and `head` returns `{ size: 11 }`. This also guards the checksum setting, but only on SeaweedFS: RustFS does not verify checksums on single PUTs;
  - a PUT with a different `Content-Length` than signed is rejected;
  - a PUT with a different `Content-Type` than signed is rejected;
  - `presignGet` with `contentDisposition: 'attachment; filename="a.txt"'` returns that header;
  - `delete` twice resolves.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. `storage:bootstrap` creates `stepler-dev` and `stepler-test` buckets with CORS for `http://localhost:3000` (`PUT`, `GET`, exposing `ETag`).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): add object storage port with S3 adapter and local emulator`.

### Task 9: Mailer port, SMTP adapter, localized magic-link email

**Files:**
- Create:
  - `apps/api/src/mail/mailer.ts` (port), `apps/api/src/mail/smtp-mailer.ts`, `apps/api/src/mail/mail.module.ts`
  - `apps/api/src/mail/templates/magic-link.ts`, `apps/api/src/mail/templates/messages.ts` (uk/en)
  - `apps/api/src/mail/templates/magic-link.spec.ts`, `apps/api/test/mail.e2e.spec.ts`
- Dependencies: `nodemailer`, `@types/nodemailer`.

**Interfaces — produces:**
- `MAILER` token; `interface Mailer { send(message: { to: string; subject: string; text: string; html: string }): Promise<void> }`.
- `SmtpMailer`: nodemailer transport from `SMTP_URL`, `from` = `MAIL_FROM`.
- `renderMagicLinkEmail(input: { url: string; locale: 'uk' | 'en'; expiresInMinutes: number }): { subject: string; text: string; html: string }`.
  - The HTML escapes the URL.
  - Copy:
    - uk subject `Вхід до Stepler`, en subject `Sign in to Stepler`;
    - the body states the expiry in minutes and "If you didn't request this, ignore this email" in both languages.
  - Final wording may change in Phase 3; the tests pin structure, not prose.

- [ ] **Step 1: Failing tests.**
  - The template contains the URL exactly once in the text and once as an `href`.
  - A URL containing `"><script>` is escaped in the HTML.
  - The subject differs by locale.
  - Integration: `SmtpMailer.send` to Mailpit, then `GET http://127.0.0.1:8025/api/v1/messages` finds the message by recipient.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(api): add mailer port with SMTP adapter and localized magic-link email`.

### Task 10: Turnstile verifier port

**Files:**
- Create: `apps/api/src/turnstile/turnstile-verifier.ts` (port + `CloudflareTurnstileVerifier`), `apps/api/src/turnstile/turnstile.module.ts`, `apps/api/src/turnstile/turnstile-verifier.spec.ts`, `apps/api/test/turnstile.network.spec.ts`

**Interfaces — produces:**
- `TURNSTILE_VERIFIER` token; `interface TurnstileVerifier { verify(token: string, remoteIp?: string): Promise<boolean> }`.
- The Cloudflare adapter POSTs `secret`, `response`, `remoteip` to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with a 5 s timeout.
  - A network error or timeout throws `AppError('DEPENDENCY_UNAVAILABLE', 503, { retryable: true })`. Fail closed: never treat an error as a pass.
  - An empty token returns `false` without a network call.

- [ ] **Step 1: Failing unit tests** (stub `fetch`):
  - `success: true` → true, `success: false` → false;
  - timeout → `DEPENDENCY_UNAVAILABLE`;
  - an empty token makes no call.
- [ ] **Step 2: Network test**, included only when `RUN_NETWORK_TESTS=1`. It uses Cloudflare's documented test secrets: `1x0000000000000000000000000000000AA` always passes, `2x0000000000000000000000000000000AA` always fails.
- [ ] **Step 3:** Implement → PASS. Run the network test once locally and record the result in the task report.
- [ ] **Step 4:** Commit `feat(api): add Turnstile verifier port`.

### Task 11: Readiness health

**Files:**
- Modify: `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.module.ts`, `apps/api/test/health.e2e.spec.ts`, `apps/api/Dockerfile` (HEALTHCHECK stays on `/live`)

**Interfaces — produces:** `GET /api/v1/health/ready` (public):
- `200 { status: 'ok', checks: { database: 'ok', storage: 'ok' } }`;
- if any check fails, `503` with `status: 'degraded'` and the failing check set to `'fail'`;
- each check has a 2 s timeout, and the checks run in parallel.

- [ ] **Step 1: Failing tests.**
  - With real services → 200 and the body parses with the contract.
  - With `OBJECT_STORAGE` overridden by a failing double → 503, `storage: 'fail'`, `database: 'ok'`.
- [ ] **Step 2:** FAIL → implement (DB check `SELECT 1`, storage `checkHealth`) → PASS.
- [ ] **Step 3:** Commit `feat(api): add readiness health for database and storage`.

### Task 12: Auth core — sessions, guard, CSRF, principal, `/me`, logout

*Gated by Task 3.*

**Files:**
- Create:
  - `apps/api/src/auth/principal.ts`, `apps/api/src/auth/public.decorator.ts`, `apps/api/src/auth/current-principal.decorator.ts`
  - `apps/api/src/auth/session.service.ts`, `apps/api/src/auth/auth.guard.ts`, `apps/api/src/auth/csrf.guard.ts`
  - `apps/api/src/auth/session-cookie.ts`, `apps/api/src/auth/auth.module.ts`
  - `apps/api/src/users/users.service.ts`, `apps/api/src/users/me.controller.ts`, `apps/api/src/users/users.module.ts`
  - `apps/api/test/auth-core.e2e.spec.ts`
  - `packages/contracts/src/auth.ts` (+ tests)
- Modify: `apps/api/src/health/health.controller.ts` (mark `@Public()`), `apps/api/src/app.module.ts`

**Interfaces — produces:**
- `type Principal = { kind: 'admin'; userId: string } | { kind: 'operator'; userId: string }`. Guest principals arrive in Phase 4.
- `@Public()`, and `@CurrentPrincipal()` (param decorator, typed `Principal`).
- `SessionService`:
  - `create(userId: string): Promise<{ token: string; expiresAt: Date }>`: stores `sha256(token)`;
  - `resolve(token: string): Promise<{ userId: string } | null>`: rejects expired sessions and users with status `BLOCKED`; updates `lastUsedAt` at most once per hour;
  - `revoke(token: string): Promise<void>`;
  - `revokeAllForUser(userId: string): Promise<void>`.
- `setSessionCookie(res, token, expiresAt, env)` and `clearSessionCookie(res, env)` write the attributes from the Global Constraints.
- Global guards in order: `CsrfGuard` (Global Constraints rule; public routes included), then `AuthGuard`. An operator is an admin whose `emailVerifiedAt` is set and whose email is in `OPERATOR_EMAILS`.
- Contracts: `meResponseSchema = z.object({ id: z.uuid(), email: z.email(), displayName: z.string().nullable(), locale: z.enum(['uk','en']), isOperator: z.boolean() })`, `updateMeRequestSchema = z.object({ displayName: z.string().trim().min(1).max(80).nullable().optional(), locale: z.enum(['uk','en']).optional() }).strict()`.
- Endpoints: `GET /api/v1/me`, `PATCH /api/v1/me`, `POST /api/v1/auth/logout` (204; clears the cookie; idempotent).

- [ ] **Step 1: Failing tests.** Seed users and sessions through `SessionService`.
  - No cookie → `GET /me` 401 `UNAUTHENTICATED`.
  - Valid cookie → 200 with the contract body.
  - Expired session → 401.
  - Blocked user → 401.
  - A cookie value never appears in the DB (assert `tokenHash !== token`).
  - `PATCH /me` with the cookie but without `Origin` → 403 `CSRF_ORIGIN_MISMATCH`; with `Origin: APP_ORIGIN` → 200; with `Origin: https://evil.example` → 403.
  - A cookieless `POST /auth/magic-link/verify` from `Origin: https://evil.example` → 403 (login CSRF).
  - `POST /auth/logout` → 204, then the same cookie → 401.
  - An email in `OPERATOR_EMAILS` with `emailVerifiedAt` → `isOperator: true`; the same email unverified → `false`.
  - `/health/*` stays reachable without a cookie.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS. Update `openapi.json`.
- [ ] **Step 5:** Commit `feat(api): add session auth core with default-deny guard and CSRF origin check`.

### Task 13: Magic link sign-in

*Gated by Task 3.*

**Files:**
- Create: `apps/api/src/auth/magic-link.service.ts`, `apps/api/src/auth/magic-link.controller.ts`, `apps/api/test/magic-link.e2e.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts` (throttler: `ThrottlerModule.forRoot` with an in-memory store; a `magic-link` limit from `LimitsService.magicLink().perIpPerHour` and a `magic-link-preview` limit from `previewPerIpPerHour`), `packages/contracts/src/auth.ts`

**Interfaces — produces:**
- Contracts: `magicLinkRequestSchema = z.object({ email: z.email().trim().toLowerCase().max(254), turnstileToken: z.string().min(1), locale: z.enum(['uk','en']).optional() }).strict()`, `magicLinkVerifyRequestSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()`.
- `POST /api/v1/auth/magic-link` (public, throttled per IP) → always `202 { status: 'sent' }`:
  1. verify Turnstile (a failure → 400 `TURNSTILE_FAILED`);
  2. per-email limit from `MagicLinkToken` rows in the last hour (a breach still returns 202 but sends nothing, to avoid enumeration);
  3. create the token (TTL `MAGIC_LINK_TTL_MINUTES`);
  4. send `renderMagicLinkEmail({ url: `${APP_ORIGIN}/auth/verify?token=${token}`, locale })`, where `locale` is the existing user's locale, else the request locale, else `uk`;
  5. blocked users get no email; the response is identical.
- `POST /api/v1/auth/magic-link/preview` (public, throttled per IP by `LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR`) → `200 { email }`. The body is `magicLinkVerifyRequestSchema`; the response is `magicLinkPreviewResponseSchema = z.object({ email: z.string() })`.
  - Read-only: `SELECT email FROM "MagicLinkToken" WHERE tokenHash = $1 AND consumedAt IS NULL AND expiresAt > now()`. It never consumes, extends or logs the token.
  - Unknown, expired or consumed → 400 `MAGIC_LINK_INVALID`. A blocked user's token still previews; verify then returns 403.
  - POST rather than GET, so the token stays out of URLs and access logs and the call is subject to the Origin check. It only reveals the email to whoever already holds the link that was mailed to it.
- `POST /api/v1/auth/magic-link/verify` (public) → `200 { status: 'signed-in' }` + session cookie.
  - The token is consumed atomically: `UPDATE ... SET consumedAt = now() WHERE tokenHash = $1 AND consumedAt IS NULL AND expiresAt > now() RETURNING email, locale`.
  - Upsert the user by email (set `emailVerifiedAt` on first sign-in, `locale` from the token), plus `AuthAccount(EMAIL, email)`.
  - Invalid, expired or reused tokens → 400 `MAGIC_LINK_INVALID`; blocked user → 403 `ACCOUNT_BLOCKED`.

- [ ] **Step 1: Failing tests.** `TURNSTILE_VERIFIER` is overridden with a double; mail is read from Mailpit.
  - Happy path: request → Mailpit has one email whose link has a 43-char token → verify → 200 + `Set-Cookie: st_session` → `GET /me` 200.
  - Preview: returns the token's email; 10 previews then verify → the verify still succeeds (preview does not consume); after verify, preview → 400; an expired token → 400; exceeding the preview limit → 429.
  - **Review Focus 2:** two concurrent verifies with the same token → exactly one 200, one 400, and one `AuthSession` row.
  - **Review Focus 3:** unknown, existing and blocked emails → identical status and body; the blocked user receives no email.
  - The 6th request for one email within an hour → 202 and no 6th email.
  - Per-IP: exceeding the limit → 429 `RATE_LIMITED` with `Retry-After`.
  - Expired token (clock advanced via `vi.setSystemTime` or by an expired row) → 400.
  - Turnstile false → 400 `TURNSTILE_FAILED` and no email.
  - **Review Focus 5:** request with ` Anton@Example.COM ` then with `anton@example.com` → one `User`.
  - The email language follows the existing user's locale over the request locale.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS. Update `openapi.json`.
- [ ] **Step 5:** Commit `feat(api): add magic link sign-in with Turnstile and rate limits`.

### Task 14: Google OAuth sign-in

*Gated by Task 3.*

**Files:**
- Create:
  - `apps/api/src/auth/google/google-identity.ts` (port + `ArcticGoogleIdentity`)
  - `apps/api/src/auth/google/google.controller.ts`, `apps/api/src/auth/google/google-sign-in.service.ts`
  - `apps/api/test/google.e2e.spec.ts`
- Dependency: `arctic` 3.7.0.

**Interfaces — produces:**
- `GOOGLE_IDENTITY` token with `interface GoogleIdentity { authorizationUrl(state: string, codeVerifier: string): URL; exchange(code: string, codeVerifier: string): Promise<{ sub: string; email: string; emailVerified: boolean; name?: string }> }`.
  - The adapter uses `arctic.Google(clientId, clientSecret, `${APP_ORIGIN}/api/v1/auth/google/callback`)` with scopes `openid email profile` and PKCE.
  - Claims come from `decodeIdToken` on the id_token returned directly by Google's token endpoint over TLS (OIDC code flow).
  - It is registered only when both Google env vars are set.
- `GET /api/v1/auth/methods` (public) → `{ magicLink: true, google: boolean, turnstileSiteKey: string }`. The web app reads this at runtime, so it needs no Google or Turnstile env of its own.
- `GET /api/v1/auth/google/start` (public; 404 when Google is not configured) → sets `st_oauth` = signed JSON `{state, codeVerifier, returnTo}`, then 302 to Google. `returnTo` is limited to same-origin paths starting with `/app`, default `/app`.
- `GET /api/v1/auth/google/callback` (public):
  - validates `state` against `st_oauth` (constant-time), exchanges, then signs in:
    - an existing `AuthAccount(GOOGLE, sub)` → that user;
    - else, when `emailVerified`, the user with that email (link a new account);
    - else create the user;
    - `emailVerified=false` with an existing email → no link; 302 to `/login?error=OAUTH_FAILED`;
  - success: session cookie, clear `st_oauth`, 302 to `returnTo`.
- The `st_oauth` HMAC key is an HKDF key from `APP_SECRET` (info `st_oauth`). Unrelated secrets are never reused as keys.

- [ ] **Step 1: Failing tests** (`GOOGLE_IDENTITY` double; env with dummy Google credentials):
  - `/auth/methods` reflects the configuration;
  - `/start` → 302 to the double's URL and sets `st_oauth` with the Global Constraints attributes;
  - callback with a mismatched state → 302 `/login?error=OAUTH_FAILED`, no session;
  - new `sub` + new email → user created, session set, 302 `/app`;
  - existing magic-link user + verified Google email with different case → linked to the same user (**Review Focus 5**);
  - unverified Google email matching an existing user → not linked, 302 with the error (**Review Focus 5**);
  - a `returnTo` of `https://evil.example` → 302 `/app`;
  - no Google env → `/start` 404 and `methods.google === false`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS. Update `openapi.json`.

  The real Google flow is **unverified** until the owner creates OAuth credentials; the task report states this.
- [ ] **Step 5:** Commit `feat(api): add Google OAuth sign-in with PKCE and account linking`.

### Task 15: Web — login, verify, protected app shell

*Gated by Task 3.*

**Files:**
- Create:
  - `apps/web/src/api/client.ts` (typed fetch over contracts)
  - `apps/web/src/api/query-provider.tsx`
  - `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/login-form.tsx`, `apps/web/src/app/login/turnstile.tsx`
  - `apps/web/src/app/auth/verify/page.tsx`, `apps/web/src/app/auth/verify/verify-button.tsx`
  - `apps/web/src/app/app/layout.tsx`, `apps/web/src/app/app/page.tsx`
  - `apps/web/src/errors/error-message.ts` (code → message key)
  - `packages/ui/src/components/input.tsx`, `packages/ui/src/components/label.tsx`, and their stories (shadcn; 44px min height)
- Modify: `apps/web/messages/{uk,en}.json`, `apps/web/src/app/layout.tsx` (query provider)
- Dependencies: `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`.

**Interfaces — produces:**
- `apiRequest<T>(path: string, init: RequestInit & { schema: ZodType<T> }): Promise<T>`: same-origin `/api/v1…`, JSON; on non-2xx it parses `problemDetailsSchema` and throws `ApiError { code: ErrorCode; status: number; requestId?: string }`.
- `/login`, server component:
  - fetches `/api/v1/auth/methods` via `API_INTERNAL_URL` at request time;
  - renders an email form (RHF + `magicLinkRequestSchema`), the Turnstile widget with `turnstileSiteKey`, and a Google button when enabled;
  - success state: "check your email"; error states: `TURNSTILE_FAILED`, `RATE_LIMITED`, `OAUTH_FAILED` (from the query), and network failure;
  - the Turnstile script `https://challenges.cloudflare.com/turnstile/v0/api.js` loads only on this page (ADR 0012).
- `/auth/verify`: reads `token` from the query and calls preview. The token stays in the URL, so a reload still works. Loading state, then "Sign in as <email>" with a "Sign in" button that POSTs verify, then `router.replace('/app')`. The page sets `Referrer-Policy: no-referrer`. Loading the page never consumes the token (**Review Focus 1**). Error state (from preview or verify): `MAGIC_LINK_INVALID` with a link back to `/login`; `ACCOUNT_BLOCKED` from verify; network failure with retry.
- `/app` layout, client side: `useQuery(['me'])` → 401 redirects to `/login`. It renders email + logout (POST logout, then clear the query cache, then `/login`). This is a placeholder dashboard until Phase 4.
- Every string comes from `messages/{uk,en}.json`; the catalog key-parity test still passes.

- [ ] **Step 1: Failing tests.**
  - `apiRequest` maps a problem body to `ApiError` and a non-JSON 502 to `UPSTREAM_UNAVAILABLE` (unit; stub `fetch`).
  - `error-message` covers every `ErrorCode` (unit: iterate `ERROR_CODES`, each has a key in both catalogs).
  - Input stories: default, invalid (`aria-invalid`), disabled; axe passes; height ≥ 44 px.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** run `pnpm turbo run lint typecheck test build --filter @stepler/web... --filter @stepler/ui` → PASS.
- [ ] **Step 5:** Commit `feat(web): add login, magic link verify and protected app shell`.

### Task 16: End-to-end auth journeys

**Files:**
- Create: `e2e/tests/auth.spec.ts`, `e2e/support/mailpit.ts`
- Modify:
  - `e2e/playwright.config.ts` (api env: test DB URL, Mailpit SMTP, Cloudflare Turnstile **test** keys `1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`, `APP_ORIGIN=http://127.0.0.1:3100`, `COOKIE_SECURE=false`; global setup runs migrations and truncates)
  - `turbo.json` (`e2e` `passThroughEnv`)

**Interfaces — consumes:** Tasks 12–15. `latestMagicLink(to: string): Promise<string>` polls `GET http://127.0.0.1:8025/api/v1/search?query=to:<addr>` and extracts the link.

- [ ] **Step 1: Tests** (all projects: iPhone 15, Pixel 7, desktop Chrome):
  - **Magic link:** `/login` → email → Turnstile auto-passes (test key) → "check your email" → open the link **twice** (page loads only, Review Focus 1) → the page shows "Sign in as <that email>" → click Sign in → `/app` shows the email.
  - **Logout:** → `/login`; `/app` then redirects to `/login`.
  - **Invalid link:** `/auth/verify?token=<random 43>` → invalid message with a link to `/login`, shown straight after the preview call (no Sign in button).
  - **No horizontal scroll** on `/login` and `/app`.
  - **Keyboard only:** Tab to the email field, type, Tab to submit, Enter → success state.
- [ ] **Step 2:** Run `docker compose … up -d --wait && pnpm e2e` → all pass.

  Turnstile's test key still loads Cloudflare's script, so e2e needs network. This is documented in the development README.
- [ ] **Step 3:** Commit `test(e2e): cover magic link sign-in, logout and invalid links`.

### Task 17: CI, documentation, ADR and spec updates

**Files:**
- Modify:
  - `.github/workflows/ci.yml`
  - `docs/development/README.md`
  - `docs/architecture/mvp-architecture-spec.md` (§4 client, §7.1 without `LegalAcceptance` until slice 10, §9 verify POST, §19 emulator)
  - ADR 0005 (no OpenAPI codegen), ADR 0006 (final auth design), ADR 0008 (emulator)
  - `BOOTSTRAP.md` (Phase 2 done; Jobs port → slice 5, legal acceptance → slice 10, AuditEvent → slice 1)
  - `docs/api/README.md` (error codes table, auth endpoints)

**Interfaces — produces:**
- CI `quality` job:
  - `docker compose -f docker/compose.yaml --env-file docker/.env.example up -d --wait` before tests, then `pnpm --filter @stepler/api storage:bootstrap`;
  - `SHADOW_DATABASE_URL` set to `stepler_shadow`;
  - `pnpm --filter @stepler/api db:check` and `openapi:check` steps.
- CI `e2e` job: the same compose and `storage:bootstrap` steps.
- `images` job: unchanged.
- The README env table gains every Task 5 variable, with purpose and whether it is required in production.

- [ ] **Step 1:** Update the workflow; run `actionlint` → clean.
- [ ] **Step 2:** In a fresh clone (Phase 1 Task 11 procedure, plus `docker compose up` and `storage:bootstrap`): `pnpm install --frozen-lockfile && pnpm format:check && pnpm turbo run lint typecheck test build build-storybook && pnpm --filter @stepler/api db:check openapi:check && pnpm e2e && bash docker/scripts/verify-images.sh` → all pass.
- [ ] **Step 3:** Update the docs listed above. Every deviation in "Deliberate deviations" is reflected, and implemented vs proposed is marked honestly (rule 16).
- [ ] **Step 4:** Commit `ci: run integration services, migration and OpenAPI checks; document Phase 2`.

---

## Checkpoints

- **After Tasks 1–3 (spikes):** independent review of the spike conclusions, then an owner go/no-go. If S1 picks Better Auth, re-plan Tasks 12–15 here.
- **After Task 11 (foundation without auth):** independent review of config, logging, errors, database, the ports and health.
- **After Task 17:** whole-branch review, then fixes, then a fresh-clone verification.

### Deferred from the Task 11 review (2026-09-29)

- Task 16: the e2e job must run `db:deploy` against `stepler_test` before Playwright.
- Task 17: document how deployed environments run migrations (the production image has no Prisma CLI or migrations; spec §19 says a separate deploy step).
- Task 13: throttle `/health/ready` or cache its result for a few seconds; each call costs an R2 `HeadBucket`, and it is public through the web proxy.
- Phase 4 (guest links): if a capability token is ever carried in a URL path, redact it in request logs (`req.url` and `params` are logged today).

## Out of scope for Phase 2

Collections, guest links, uploads (multipart, Jobs/pg-boss, worker), legal pages and acceptance, audit events, error-monitoring provider (Sentry etc.), hosting/CD, real R2 and a real email provider, and design system polish (Phase 3).
