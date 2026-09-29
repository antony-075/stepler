# EventDrop Bootstrap Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clean, tested monorepo skeleton (web, api, contracts, ui, config, e2e, Docker, CI) on which Phase 2 foundation work can start. No product features.

**Architecture:** pnpm + Turborepo monorepo following spec §3. Toolchain choices were settled by throwaway spikes (Tasks 2–3, done) and recorded in ADR 0005 and ADR 0011: everything is ESM, NestJS 12 built-in Standard Schema validation, Vitest + SWC, next-intl without i18n routing. The only runtime behavior shipped is `GET /api/v1/health/live`, served through the web origin. It exists to prove prefix, versioning, contracts consumption, the same-origin proxy and container health.

**Tech Stack:** Node 24 LTS, pnpm (corepack), Turborepo, TypeScript (strict), NestJS, Next.js App Router, next-intl, Tailwind CSS v4, shadcn/ui + Radix, Storybook, Zod, Vitest, Playwright, Docker / Docker Compose, GitHub Actions.

**Spec:** `docs/architecture/mvp-architecture-spec.md` (accepted), `BOOTSTRAP.md` Phase 1, ADR 0004–0013.

## Global Constraints

- Node `>=24` LTS, pinned in `.nvmrc` and root `engines`. The local machine currently has Node 23.11, so the developer must install Node 24 before Task 1.
- pnpm **11.28.2** through corepack (`packageManager: "pnpm@11.28.2"`); corepack cannot run pnpm 12's native binary. Upgrade to 12 is a separate decision.
- Every dependency: latest stable release that is at least 1 day old (pnpm 11 `minimumReleaseAge` default), locked by `pnpm-lock.yaml`. Never add `minimumReleaseAgeExclude` entries. TypeScript stays on 6.0.x (typescript-eslint does not support 7). Prisma stays on the latest stable 7.x (npm `latest` is an 8.0 RC). NestJS is 12 (ESM-only). ESLint stays on **9.x** (`eslint-plugin-react` and `jsx-a11y` do not support ESLint 10). Vitest is **4.1.x repo-wide** (Storybook's Vitest addon supports `^3 || ^4`). Pin `prisma` and `@prisma/client` to the same exact 7.10.x. Record the resolved major versions in `docs/development/README.md`. Add no dependency outside this plan without justification (rule 14).
- Package scope `@eventdrop/*`: `@eventdrop/config`, `@eventdrop/contracts`, `@eventdrop/ui`, `@eventdrop/api`, `@eventdrop/web`, `@eventdrop/e2e`.
- TypeScript: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. `any` only with a justification comment.
- API: global prefix `api`, URI versioning, default version `1`, so routes are `/api/v1/...` (ADR 0004).
- Locales: `uk` (default) and `en`. No locale segment in URLs. Locale cookie name `ed_locale` (ADR 0011).
- No hardcoded user-facing strings in `apps/web` or `packages/ui` components, including `aria-label`, `title`, `alt` and `placeholder`.
- Env: each app validates env with Zod at startup; `.env.example` holds names only; `.env*` files are never committed. Validation errors name the variables but never print their values.
- Local dev: apps run natively; Docker Compose runs infrastructure only (rule 17).
- Ports: web `3000`, api `4000`, Postgres `5432` (overridable via `POSTGRES_PORT`), Mailpit SMTP `1025` / UI `8025`.
- Commits: small and focused. Messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Spike code is throwaway: it lives in `$TMPDIR/eventdrop-spikes/` and never enters the repo.
- pnpm 11 blocks dependency build scripts: every dependency that needs one is listed explicitly in `allowBuilds` in `pnpm-workspace.yaml` (true or false). Install telemetry (`@scarf/scarf`) is denied.

## Review Focus

1. **`Accept-Language` headers from real devices.** Values like `ru-RU,ru;q=0.9`, `en-GB,en;q=0.8`, a malformed header or an unknown cookie value must resolve deterministically, with `uk` as the fallback. Tested in Task 7.
2. **Accessibility attributes are user-facing text.** A literal `aria-label="Close"` must fail lint just like literal JSX text. Tested in Task 4.
3. **Env validation must not leak secrets.** A failing value (for example a malformed URL containing credentials) must not appear in the error message or logs. Tested in Task 6.
4. **Fresh clone builds in the right order.** In a fresh clone, `pnpm install && pnpm turbo run typecheck` must succeed without manual pre-builds. `contracts` and `config` are built through `^build`. Verified in Task 11.
5. **Production images.** Containers must run as a non-root user and must not contain `.env` files or dev dependencies. Tested in Task 10.

---

### Task 1: Repository initialization

**Files:**
- Create: `.gitignore`, `.editorconfig`, `.nvmrc`, `.npmrc`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `README.md`

**Interfaces:**
- Produces:
  - root scripts `build`, `lint`, `typecheck`, `test`, `e2e`, `dev`, `format`, `format:check`, all delegating to `turbo run <task>`, except the two format scripts, which call Prettier;
  - workspaces `apps/*`, `packages/*`, `e2e`.

- [ ] **Step 1: Initialize git and commit the existing docs on `main`**

`git init -b main`. Write `.gitignore` covering: `node_modules/`, `dist/`, `.next/`, `out/`, `storybook-static/`, `coverage/`, `playwright-report/`, `test-results/`, `.turbo/`, `.env`, `.env.*` (except `!.env.example`), `.idea/`, `.DS_Store`, `*.log`.

Commit `CLAUDE.md`, `BOOTSTRAP.md`, `docs/`, `.claude/`, `skills-lock.json` and `.gitignore` as `docs: add product, architecture and agent rules baseline`.

Before committing, run `git status` and confirm that no `.idea/`, `.DS_Store` or env files are staged.

- [ ] **Step 2: Create branch `bootstrap/phase-1`**

Run: `git switch -c bootstrap/phase-1`

- [ ] **Step 3: Add the workspace root**

Root `package.json` contents:
- `"private": true`;
- `"packageManager": "pnpm@11.28.2"`;
- `"engines": { "node": ">=24" }`;
- the scripts listed under Interfaces.

`pnpm-workspace.yaml` lists the workspaces. `.npmrc` sets `engine-strict=true`.

`turbo.json` tasks:
- `build`: `dependsOn ["^build"]`, outputs `dist/**`, `.next/**`, `!.next/cache/**`, `storybook-static/**`;
- `typecheck`, `lint`, `test`: `dependsOn ["^build"]`;
- `e2e`: `dependsOn ["^build"]`, `cache false`;
- `dev`: `persistent true`, `cache false`.

`README.md`: a short pointer to `docs/` and `docs/development/README.md`.

- [ ] **Step 4: Verify**

Run: `corepack enable && pnpm install && pnpm turbo run build`
Expected: install succeeds; turbo reports no tasks to run, exit 0.

- [ ] **Step 5: Commit** — `chore: initialize pnpm + turborepo workspace`

---

### Task 2: Spike S2 + S3 — backend toolchain (throwaway) — DONE, see ADR 0005

**Files:** none in the repo, except the result sections in `docs/architecture/decisions/0005-contracts-and-validation.md` and `docs/architecture/mvp-architecture-spec.md` §3 and §18.

**Interfaces:**
- Produces a recorded decision that Tasks 5, 6 and 10 follow:
  - `API_MODULE_FORMAT`: `cjs` or `esm`;
  - `CONTRACTS_BUILD`: tsup dual (ESM + CJS) or ESM-only;
  - `API_VALIDATION`: `nestjs-zod` or `class-validator`;
  - `API_TEST_RUNNER`: `vitest+swc` or `jest`;
  - `PRISMA_CLIENT_FORMAT`: the generator and module format that import cleanly.

- [ ] **Step 1: Build the preferred configuration A in `$TMPDIR/eventdrop-spikes/s2-backend`**

A pnpm workspace with two packages:
- **`contracts`:** Zod latest; built with tsup to ESM and CJS; `exports` has `import` / `require` / `types` conditions. Exports `echoRequestSchema = z.object({ name: z.string().min(1) })`.
- **`api`:** NestJS latest, CommonJS (Nest default). `POST /api/v1/echo` validates the body with the nestjs-zod pipe using `echoRequestSchema`. Swagger document generated from the Zod schema. Prisma latest with the `prisma-client` generator in CJS module format and the `@prisma/adapter-pg` driver adapter, with one model `Probe { id String @id }`. `PrismaClient` is instantiated in a provider without connecting.

Check nestjs-zod before using it:
- last release within the last 6 months;
- supports the installed Zod major version;
- permissive license.

- [ ] **Step 2: Check the S2 pass criteria**

1. `nest build && node dist/main.js` boots.
2. `curl -X POST localhost:4000/api/v1/echo -H 'content-type: application/json' -d '{"name":""}'` returns `400` with Zod issue paths.
3. The OpenAPI JSON at `/api/docs-json` contains the `name` property with `minLength: 1`.
4. `tsc --noEmit` is clean.
5. The Prisma client import compiles and instantiates at runtime.

If any criterion fails, try in order:
- **B:** api as ESM (`"type": "module"`, `module`/`moduleResolution` `nodenext`), same criteria;
- **C:** class-validator DTOs + `@nestjs/swagger`, with `contracts` used only by the web app.

- [ ] **Step 3: Spike S3 — test runner, in the same spike app**

Vitest + `unplugin-swc` with decorator metadata enabled. Write two tests:
- `Test.createTestingModule` resolves a service that depends on a second service through constructor injection, and the injected instance is defined;
- Supertest `POST /api/v1/echo` with `{"name":"a"}` returns `201`.

Pass criteria: both pass under `vitest run`, and `vitest run --coverage` works.

Fallback: Jest (with `@swc/jest`) for `apps/api` only.

- [ ] **Step 4: Record the results**

- ADR 0005: append a section `## Spike S2/S3 result (date)` with the chosen values for every Interfaces item, the resolved major versions and any caveats.
- Spec §3 and §18: replace the `[verify]` lines with the outcome.
- Delete the spike directory.

- [ ] **Step 5: Commit** — `docs: record backend toolchain spike results`

---

### Task 3: Spike S8 — i18n without a locale prefix (throwaway) — DONE, see ADR 0011

**Files:** none in the repo, except a result section in `docs/architecture/decisions/0011-internationalization.md`.

**Interfaces:**
- Produces a recorded decision that Task 7 follows: the i18n library (`next-intl` or the fallback) and the exact setup files it needs.

- [ ] **Step 1: Build in `$TMPDIR/eventdrop-spikes/s8-web`**

Next.js latest (App Router) + next-intl latest, using its "without i18n routing" setup:
- no `[locale]` segment and no locale-routing middleware;
- `i18n/request.ts` picks the locale from the `ed_locale` cookie, then `Accept-Language`, then `uk`;
- a server component page and a client component both render one message from `messages/{uk,en}.json`;
- a dynamic route `/g/[token]` renders a translated string.

- [ ] **Step 2: Check the pass criteria**

1. `next build` succeeds.
2. With no cookie, `/g/abc` renders Ukrainian and the URL stays `/g/abc`.
3. With `Accept-Language: en-US`, it renders English.
4. With `ed_locale=uk` and `Accept-Language: en`, it renders Ukrainian (the cookie wins).
5. The client component is translated as well.

Record which routes become dynamic because of cookie reads.

Fallback: a minimal in-house provider over JSON catalogs using `Intl.MessageFormat`-compatible messages. Record why next-intl was rejected.

- [ ] **Step 3: Record the results**

ADR 0011: add `## Spike S8 result (date)` with the chosen setup and caveats. Delete the spike directory.

- [ ] **Step 4: Commit** — `docs: record i18n spike result`

---

### Task 4: `packages/config` — TypeScript, ESLint, Prettier presets

**Files:**
- Create:
  - `packages/config/package.json`
  - `packages/config/tsconfig/base.json`, `packages/config/tsconfig/nest.json`, `packages/config/tsconfig/next.json`, `packages/config/tsconfig/library.json`
  - `packages/config/eslint/base.js`, `packages/config/eslint/react.js`, `packages/config/eslint/next.js`, `packages/config/eslint/nest.js`
  - `packages/config/prettier/index.js`
  - `.prettierrc.cjs`, `.prettierignore` (at the repo root)
- Test:
  - `packages/config/test/no-literal-strings.test.ts`
  - fixtures `packages/config/test/fixtures/literal-text.tsx`, `packages/config/test/fixtures/literal-aria.tsx`, `packages/config/test/fixtures/translated.tsx`

**Interfaces:**
- Produces:
  - `@eventdrop/config/tsconfig/{base,nest,next,library}.json`;
  - ESLint flat-config arrays `@eventdrop/config/eslint/{base,react,next,nest}`;
  - Prettier config `@eventdrop/config/prettier`.

- [ ] **Step 1: Write the failing test**

```ts
// Runs ESLint programmatically with the react preset on the fixtures.
test('literal JSX text is an error', async () => {
  expect(await errorsFor('literal-text.tsx')).toContainEqual(expect.objectContaining({ ruleId: 'react/jsx-no-literals' }));
});
test('literal aria-label/title/alt/placeholder is an error', async () => {
  expect(await errorsFor('literal-aria.tsx')).toContainEqual(expect.objectContaining({ ruleId: 'no-restricted-syntax' }));
});
test('translated strings and className literals pass', async () => {
  expect(await errorsFor('translated.tsx')).toEqual([]);
});
```

Fixtures:
- `literal-text.tsx` renders `<p>Hello</p>`;
- `literal-aria.tsx` renders `<button aria-label="Close" />`;
- `translated.tsx` renders `<p className="text-sm">{t('title')}</p>`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @eventdrop/config test`
Expected: FAIL (presets do not exist).

- [ ] **Step 3: Implement the presets**

- `base.js`: typescript-eslint recommended-type-checked + eslint-config-prettier.
- `react.js`: base + react + react-hooks + jsx-a11y, plus:
  - `react/jsx-no-literals` with `{ noStrings: true, ignoreProps: true }`;
  - `no-restricted-syntax` with selector `JSXAttribute[name.name=/^(aria-label|title|alt|placeholder)$/] > Literal`, message `"User-facing attribute must use a translation"`.
- `next.js`: react + `@next/eslint-plugin-next`.
- `nest.js`: base + Node globals + `import-x/no-cycle` (error) + `@typescript-eslint/consistent-type-imports` with type information, so injected classes are never type-only imports (ADR 0005).
- Story and test files (`*.stories.tsx`, `*.test.tsx`) are exempt from the literal rules.
- The tsconfig files hold the Global Constraints compiler options. `nest.json` and `library.json`: `module`/`moduleResolution` `nodenext`; `nest.json` adds `experimentalDecorators` and `emitDecoratorMetadata`, and must not enable `verbatimModuleSyntax`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @eventdrop/config test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** — `chore(config): add shared tsconfig, eslint and prettier presets`

---

### Task 5: `packages/contracts`

**Files:**
- Create:
  - `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/eslint.config.js`
  - `packages/contracts/src/index.ts`, `packages/contracts/src/health.ts`
- Test: `packages/contracts/src/health.test.ts`

**Interfaces:**
- Consumes: Task 4 presets.
- Produces:
  - `healthLiveResponseSchema: z.ZodObject<{ status: z.ZodLiteral<'ok'> }>`;
  - `type HealthLiveResponse = z.infer<typeof healthLiveResponseSchema>`, exported from `@eventdrop/contracts`;
  - ESM-only package (`"type": "module"`) built with `tsc`; `exports` has `types` and `import` conditions only.

- [ ] **Step 1: Write the failing test**

```ts
test('accepts { status: "ok" }', () => {
  expect(healthLiveResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
});
test('rejects other statuses and extra keys', () => {
  expect(healthLiveResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
  expect(healthLiveResponseSchema.safeParse({ status: 'ok', db: 'x' }).success).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @eventdrop/contracts test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `health.ts`**

A strict object schema. Re-export it from `index.ts`. Add `build`, `typecheck`, `lint` and `test` scripts.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @eventdrop/contracts test && pnpm --filter @eventdrop/contracts build`
Expected: tests PASS; `dist/` contains ESM `.js` and `.d.ts` files.

- [ ] **Step 5: Commit** — `feat(contracts): add package with health response schema`

---

### Task 6: `apps/api` skeleton — env validation and live health

**Files:**
- Create:
  - `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/nest-cli.json`, `apps/api/eslint.config.js`
  - `apps/api/vitest.config.ts` (`unplugin-swc`, `module: { type: 'es6' }`)
  - `apps/api/.env.example`
  - `apps/api/src/main.ts`, `apps/api/src/create-app.ts`, `apps/api/src/app.module.ts`
  - `apps/api/src/config/env.ts`
  - `apps/api/src/health/health.module.ts`, `apps/api/src/health/health.controller.ts`
- Test:
  - `apps/api/src/config/env.spec.ts`
  - `apps/api/test/health.e2e.spec.ts`

**Interfaces:**
- Consumes: `healthLiveResponseSchema` (Task 5); ADR 0005 configuration (ESM, `.js` import specifiers, `allowBuilds` for `@swc/core`).
- Produces:
  - `loadApiEnv(source: Record<string, string | undefined>): ApiEnv` where `ApiEnv = { NODE_ENV: 'development' | 'test' | 'production'; API_PORT: number; LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' }` (defaults: `API_PORT` 4000, `LOG_LEVEL` `info`). Throws `EnvValidationError` whose message lists the invalid variable names.
  - `createApp(env: ApiEnv): Promise<INestApplication>`, which applies the `api` prefix, URI versioning with default `'1'`, and `enableShutdownHooks()`.
  - Route `GET /api/v1/health/live` → `200 { "status": "ok" }`.

Readiness (DB/storage) is Phase 2.

- [ ] **Step 1: Write the failing tests**

```ts
// env.spec.ts
test('applies defaults', () => {
  expect(loadApiEnv({ NODE_ENV: 'test' })).toEqual({ NODE_ENV: 'test', API_PORT: 4000, LOG_LEVEL: 'info' });
});
test('lists invalid variable names', () => {
  expect(() => loadApiEnv({ NODE_ENV: 'staging', API_PORT: 'abc' })).toThrow(/NODE_ENV.*API_PORT|API_PORT.*NODE_ENV/s);
});
test('never includes values in the error message', () => {
  const secret = 'postgres://user:s3cr3t@host/db';
  expect(() => loadApiEnv({ NODE_ENV: secret })).toThrow(/NODE_ENV/);
  expect(() => loadApiEnv({ NODE_ENV: secret })).not.toThrow(/s3cr3t/);
});

// health.e2e.spec.ts
test('GET /api/v1/health/live returns contract-valid body', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
  expect(healthLiveResponseSchema.parse(res.body)).toEqual({ status: 'ok' });
});
test('unversioned path is not served', async () => {
  await request(app.getHttpServer()).get('/api/health/live').expect(404);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @eventdrop/api test`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

- `env.ts`: a Zod schema with coercion. The error message is built from `issue.path` values only.
- `main.ts`: `loadApiEnv(process.env)`. On `EnvValidationError`, write the message to stderr and exit with code 1. Otherwise `createApp`, then `listen(API_PORT)`.
- The health controller returns the contract type and documents it with `@ApiResponse({ status: 200, standardSchema: healthLiveResponseSchema })`; request validation via the global `StandardSchemaValidationPipe` is wired in Phase 2 together with problem+json.
- Swagger/OpenAPI wiring is Phase 2.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @eventdrop/api test && pnpm --filter @eventdrop/api build && NODE_ENV=production node apps/api/dist/main.js`, then in another shell `curl -s localhost:4000/api/v1/health/live`.
Expected: tests PASS; curl prints `{"status":"ok"}`. Starting with `NODE_ENV=bad` exits 1 and prints the variable name only.

- [ ] **Step 5: Commit** — `feat(api): add NestJS skeleton with env validation and live health`

---

### Task 7: `apps/web` skeleton — i18n, env, same-origin API proxy

**Files:**
- Create:
  - `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/eslint.config.js`, `apps/web/postcss.config.mjs`, `apps/web/.env.example`
  - `apps/web/src/env.ts`
  - `apps/web/src/i18n/locales.ts`, `apps/web/src/i18n/resolve-locale.ts`, `apps/web/src/i18n/request.ts` (setup files per Task 3)
  - `apps/web/messages/uk.json`, `apps/web/messages/en.json`
  - `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`
- Test:
  - `apps/web/src/i18n/resolve-locale.test.ts`
  - `apps/web/src/env.test.ts`

**Interfaces:**
- Consumes: Task 3 decision; Task 4 presets.
- Produces:
  - `LOCALES = ['uk', 'en'] as const`; `type Locale = (typeof LOCALES)[number]`; `DEFAULT_LOCALE: Locale = 'uk'`; `LOCALE_COOKIE = 'ed_locale'`.
  - `resolveLocale(input: { cookieLocale?: string; acceptLanguage?: string }): Locale`. Order: valid cookie, then the first supported language in `Accept-Language` by q-weight (region stripped), then `uk`. The profile locale is added with auth in Phase 2.
  - `loadWebEnv(source): WebEnv = { API_INTERNAL_URL: string }` (a URL). Same no-values error rule as in Task 6.
  - Rewrites: `/api/:path*` → `${API_INTERNAL_URL}/api/:path*`.
  - The home page renders translated `home.title` (`"EventDrop"`) and `home.tagline` (uk: `"Збирайте фото, відео та історії з події в одному місці"`, en: `"Collect photos, videos and stories from your event in one place"`). This placeholder copy is replaced in Phase 3/4.

- [ ] **Step 1: Write the failing tests**

```ts
test.each([
  [{}, 'uk'],
  [{ acceptLanguage: 'en-US,en;q=0.9' }, 'en'],
  [{ acceptLanguage: 'ru-RU,ru;q=0.9' }, 'uk'],
  [{ acceptLanguage: 'de;q=0.9,en;q=0.8,uk;q=0.7' }, 'en'],
  [{ acceptLanguage: 'fr,uk;q=0.9,en;q=0.95' }, 'en'],
  [{ acceptLanguage: ';;;garbage' }, 'uk'],
  [{ cookieLocale: 'en', acceptLanguage: 'uk' }, 'en'],
  [{ cookieLocale: 'de', acceptLanguage: 'en' }, 'en'],
])('resolveLocale(%j) → %s', (input, expected) => {
  expect(resolveLocale(input)).toBe(expected);
});
test('loadWebEnv rejects a non-URL without echoing it', () => {
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'not a url s3cr3t' })).toThrow(/API_INTERNAL_URL/);
  expect(() => loadWebEnv({ API_INTERNAL_URL: 'not a url s3cr3t' })).not.toThrow(/s3cr3t/);
});
test('message catalogs have identical keys', () => {
  expect(flattenKeys(uk)).toEqual(flattenKeys(en));
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @eventdrop/web test`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Follow the setup recorded in Task 3; `request.ts` calls `resolveLocale` with the cookie and header values.
- `layout.tsx` sets `<html lang={locale}>`.
- Tailwind v4 in `globals.css`.
- `next.config.ts` calls `loadWebEnv(process.env)` and uses `output: 'standalone'`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @eventdrop/web test && pnpm --filter @eventdrop/web lint && pnpm --filter @eventdrop/web build`
Expected: PASS; lint clean (no literal strings); build succeeds.

- [ ] **Step 5: Commit** — `feat(web): add Next.js skeleton with uk/en i18n and API proxy`

---

### Task 8: `packages/ui` + Storybook

**Files:**
- Create:
  - `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/eslint.config.js`, `packages/ui/components.json`
  - `packages/ui/src/styles/globals.css`
  - `packages/ui/src/lib/cn.ts`
  - `packages/ui/src/components/button.tsx`, `packages/ui/src/components/button.stories.tsx`
  - `packages/ui/.storybook/main.ts`, `packages/ui/.storybook/preview.ts`
  - the Storybook Vitest config per the installed Storybook version
- Modify: `apps/web/src/app/globals.css` (import ui styles, add a Tailwind `@source` for `packages/ui/src`), `apps/web/package.json` (dependency `@eventdrop/ui`)

**Interfaces:**
- Consumes: Task 4 presets.
- Produces:
  - `cn(...inputs: ClassValue[]): string`;
  - `Button`: the shadcn Button (variants `default | secondary | outline | ghost | destructive`, sizes `default | sm | lg | icon`, `asChild`), exported from `@eventdrop/ui/components/button`;
  - `@eventdrop/ui/styles.css`: design tokens as CSS variables (light theme; dark tokens deferred to Phase 3).

- [ ] **Step 1: Write the failing story tests**

Stories `Default`, `Disabled`, `IconOnly` (with `aria-label` from args).

Play functions:
- `Default`: clicking calls the `onClick` spy once;
- `Disabled`: clicking does not call the spy, and the button has the `disabled` attribute.

Storybook a11y addon configured with `test: 'error'`, so axe violations fail the run.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @eventdrop/ui test`
Expected: FAIL (component missing).

- [ ] **Step 3: Implement**

Initialize shadcn for a monorepo library (`components.json` aliases pointing to `@eventdrop/ui`), add `button`, and add the `cn` helper. Touch targets: `size="default"` and `size="icon"` are at least 44 px tall (rule 05). This deviates from shadcn's stock size and is noted in a code comment.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @eventdrop/ui test && pnpm --filter @eventdrop/ui build-storybook && pnpm --filter @eventdrop/web build`
Expected: story tests PASS with no a11y violations; Storybook builds; web still builds with the ui styles imported.

- [ ] **Step 5: Commit** — `feat(ui): add shared ui package with Button and Storybook`

---

### Task 9: `e2e` — Playwright smoke through the web origin

**Files:**
- Create: `e2e/package.json`, `e2e/tsconfig.json`, `e2e/playwright.config.ts`, `e2e/tests/smoke.spec.ts`

**Interfaces:**
- Consumes: built `@eventdrop/api` (Task 6) and `@eventdrop/web` (Task 7).
- Produces: the `e2e` task.
  - Playwright projects: `mobile-safari` (iPhone 15), `mobile-chrome` (Pixel 7), `desktop-chrome`.
  - `webServer` starts the api (`node apps/api/dist/main.js`, port 4000) and the web app (`next start`, port 3000, `API_INTERNAL_URL=http://localhost:4000`).

- [ ] **Step 1: Write the tests**

```ts
test('home renders Ukrainian by default', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.getByText('Збирайте фото, відео та історії з події в одному місці')).toBeVisible();
});
test('home renders English for Accept-Language en', async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' } });
  const page = await ctx.newPage(); await page.goto('/');
  await expect(page.getByText('Collect photos, videos and stories from your event in one place')).toBeVisible();
});
test('API is reachable same-origin through the web app', async ({ request }) => {
  const res = await request.get('/api/v1/health/live');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm turbo run build && pnpm --filter @eventdrop/e2e e2e`
Expected: 3 tests × 3 projects PASS. If a test fails, fix the owning app, not the test.

- [ ] **Step 3: Commit** — `test(e2e): add Playwright smoke tests for web, i18n and API proxy`

---

### Task 10: Docker — local infrastructure and production images

**Files:**
- Create:
  - `docker/compose.yaml`
  - `.dockerignore`
  - `apps/api/Dockerfile`, `apps/web/Dockerfile`
  - `docker/scripts/verify-images.sh`
- Modify: `BOOTSTRAP.md` Phase 1 (the S3 emulator moves to Phase 2 with spike S4, because nothing uses it before the storage adapter), `docs/architecture/mvp-architecture-spec.md` §19 (the same note)

**Interfaces:**
- Produces:
  - compose services `postgres` (image `postgres:18`, healthcheck `pg_isready`, named volume `eventdrop-pg`, credentials from `docker/.env.example` names `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`);
  - compose service `mailpit` (ports 1025/8025, healthcheck);
  - images `eventdrop-api` and `eventdrop-web`.

- [ ] **Step 1: Write `verify-images.sh`**

The script builds both images and asserts:
1. `docker run --rm --entrypoint id <image> -u` prints a non-zero uid.
2. `docker run --rm --entrypoint sh <image> -c 'ls -a /app | grep -c "^\.env"'` prints `0`.
3. The api container started with `NODE_ENV=production` answers `GET /api/v1/health/live` with `200` within 20 s.
4. The web container answers `GET /` with `200`.
5. The api image has no dev-only packages: `! ls /app/node_modules/.pnpm | grep -q '^vitest@'` (the runtime stage is produced with `pnpm deploy --prod`).

The script exits non-zero on the first failed assertion.

- [ ] **Step 2: Run the script and verify it fails**

Run: `bash docker/scripts/verify-images.sh`
Expected: FAIL (no Dockerfiles).

- [ ] **Step 3: Implement**

- Multi-stage Dockerfiles: `turbo prune <app> --docker`, then install from the pruned lockfile, build, and produce a runtime stage on `node:24-slim` running as the `node` user.
- The api runtime contains `dist` + production `node_modules` only. The web runtime contains Next `standalone` + `static` + `public`.
- `HEALTHCHECK` for the api hits `/api/v1/health/live`.
- `.dockerignore` excludes `.git`, `node_modules`, `.env*`, build outputs, `docs`, `.claude`, `.idea`.

- [ ] **Step 4: Verify**

Run:
- `bash docker/scripts/verify-images.sh`
- `docker compose -f docker/compose.yaml --env-file docker/.env.example up -d --wait && docker compose -f docker/compose.yaml down`

Expected: all 5 assertions pass; both compose services report healthy.

- [ ] **Step 5: Commit** — `chore(docker): add local infrastructure compose and production images`

---

### Task 11: CI and developer documentation

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `docs/development/README.md` (commands, prerequisites incl. Node 24, env variable names per app, ports, resolved major versions)

**Interfaces:**
- Consumes: all root scripts.
- Produces: GitHub Actions workflow `ci` on `pull_request` and on `push` to `main`, with jobs:
  - `quality`: `pnpm install --frozen-lockfile`, then `format:check`, `lint`, `typecheck`, `test`, `build`;
  - `e2e`: needs `quality`; `playwright install --with-deps`, then `pnpm e2e`; uploads the report on failure;
  - `images`: needs `quality`; runs `docker/scripts/verify-images.sh`.

  Node from `.nvmrc`; pnpm store and `.turbo` cache.

- [ ] **Step 1: Write the workflow and the docs**

- [ ] **Step 2: Verify the clean-clone build order locally**

Commit the work first, then run: `rm -rf "$TMPDIR/ed-clean" && git clone . "$TMPDIR/ed-clean" && cd "$TMPDIR/ed-clean" && pnpm install --frozen-lockfile && pnpm format:check && pnpm turbo run lint typecheck test build && pnpm e2e`
Expected: every step succeeds in a fresh clone, with no manual pre-builds. This covers Review Focus #4.

- [ ] **Step 3: Validate the workflow syntax**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest`
Expected: no findings.

Actually running the workflow on GitHub requires a remote, which does not exist yet. State this explicitly in the task report.

- [ ] **Step 4: Commit** — `ci: add GitHub Actions quality, e2e and image checks`

---

## After Phase 1

- Open a PR from `bootstrap/phase-1` once a GitHub remote exists. `gh` is not installed locally; the developer creates the remote.
- Phase 2 (foundation) gets its own plan: Swagger, Prisma + first migration (S6), problem+json, logging, request IDs, provider ports (S4 incl. the S3 emulator in compose), `LimitsService`, auth boundary (S1).
