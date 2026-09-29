# ADR 0005 — Shared Contracts and Validation

Status: Accepted (pending spike S2)
Date: 2026-09-29

## Context

Frontend forms use React Hook Form + Zod (rules). The API needs authoritative server-side validation and Swagger. Maintaining class-validator DTOs on the server and Zod schemas on the client would duplicate validation rules.

## Decision

- `packages/contracts` holds Zod schemas for request/response bodies, error codes and shared enums.
- NestJS validates with those schemas (nestjs-zod or an equivalent pipe) and generates OpenAPI from them.
- ~~The web app uses generated OpenAPI types (openapi-typescript + openapi-fetch) for calls~~ **Superseded 2026-09-29 (owner decision):** the web app imports request/response types and schemas directly from `@stepler/contracts` and validates responses with them; it uses the same Zod schemas for forms. `openapi-typescript` 7.13 declares `typescript ^5` while the repo uses 6.0. OpenAPI remains the documented public contract, snapshot-checked in CI (`apps/api/openapi.json`, `openapi:check`). Code generation can return once the tool supports TypeScript 6.
- Server validation is always authoritative; business rules (permissions, quotas) are never in contracts.

## Alternatives considered

- class-validator DTOs (NestJS-native, best Swagger support) + separate Zod on the web — duplicated rules.
- ts-rest / tRPC-style end-to-end typing — stronger coupling, weaker fit with REST + OpenAPI requirement.

## Consequences

- Requires verifying nestjs-zod maintenance and Zod-version compatibility, and CJS/ESM interop between Nest and the contracts package (S2). Fallback: class-validator DTOs with OpenAPI-generated client types.

## Spike S2/S3 result (2026-09-29)

Context found during the spike:
- NestJS 12 (released 2026-08-27) is **ESM-only**; NestJS 11 is tagged `legacy`.
- `nestjs-zod` 5.5.0 declares peers `@nestjs/common ^10 || ^11` and `@nestjs/swagger ≤ ^11`, so it does not support NestJS 12.
- npm `latest` for `prisma` points to a release candidate (8.0.0-rc); the latest stable release is 7.10.0.
- TypeScript 7 is the npm `latest`, but `typescript-eslint` supports `<6.1`, so TypeScript 6.0 is used.

Configuration verified (all pass criteria met: build + boot, 400 with Zod issue paths, OpenAPI contains the Zod-derived schema with `minLength`, clean `tsc --noEmit`, Prisma client instantiates at runtime, DI via `Test.createTestingModule`, Supertest, coverage):

| Decision | Result |
|---|---|
| `API_MODULE_FORMAT` | `esm` (`"type": "module"`, `module`/`moduleResolution` `nodenext`, `.js` import specifiers) |
| `CONTRACTS_BUILD` | plain `tsc` to ESM with `.d.ts`; no bundler needed |
| `API_VALIDATION` | **built-in NestJS 12 Standard Schema support** (see re-spike below). `nestjs-zod` rejected (no NestJS 12 support) |
| `API_TEST_RUNNER` | Vitest + `unplugin-swc` (decorator metadata). Repo-wide Vitest **4.1.x**, because `@storybook/addon-vitest` 10.6 supports Vitest `^3 \|\| ^4` only; verified with both 4.1 and 5.0 for the API |
| `PRISMA_CLIENT_FORMAT` | `prisma-client` generator, `moduleFormat = "esm"`, output inside `src/generated/prisma` (generated, not committed), `@prisma/adapter-pg` driver adapter, `prisma.config.ts` |

Versions used: Node 24.21, pnpm 11.28.2, TypeScript 6.0.3, NestJS 12.1.1, @nestjs/swagger 12.0.2, Zod 4.6.5, Prisma 7.10.0 (pin `prisma` and `@prisma/client` exactly — npm `latest` for `prisma` is an 8.0 RC), Vitest 4.1.11 / 5.0.2, unplugin-swc 2.0.0, @swc/core 1.16.12 in the spike. The repository pins @swc/core 1.16.2, because 1.16.12 was published less than 1 day before bootstrap (release-age policy).

Caveats:
- pnpm 11 blocks dependency build scripts by default; `allowBuilds` in `pnpm-workspace.yaml` must list `@prisma/engines`, `prisma`, `@swc/core`. `@scarf/scarf` (install telemetry pulled in via `swagger-ui-dist`) is explicitly denied.
- Fallback B (NestJS 11 legacy + nestjs-zod) was not needed and was not tested.

## Re-spike after independent review (2026-09-29)

The review found that NestJS 12 already supports Standard Schema (Zod 4 implements it), which the first spike missed. Verified:
- global `new StandardSchemaValidationPipe({ transform: true, exceptionFactory })` + `@Body({ schema })`, `@Query({ schema })`, `@Param({ schema })`;
- `exceptionFactory` receives Standard Schema issues → mapped to our error body (Phase 2 maps it to RFC 9457 problem+json, code `VALIDATION_FAILED`);
- query strings coerced with `z.coerce.*`, defaults applied, out-of-range → 400;
- `@nestjs/swagger` 12 derives OpenAPI 3.0 request bodies and query parameters from the schemas automatically, and `@ApiResponse({ standardSchema })` documents responses. The Swagger default document version is OpenAPI 3.0, matching the converter target.

Decision: use the built-in support. No in-house pipe or custom decorators.

Rules for schemas used at the HTTP boundary:
- request schemas describe the **input** form; response schemas the **output** form;
- no `z.date()` or `.transform()` in boundary schemas (not representable in JSON Schema) — dates travel as ISO strings (`z.iso.datetime()`);
- query and path values arrive as strings → `z.coerce.*`.

Test configuration (not preserved elsewhere since the spike is deleted):
- `vitest.config.ts`: `plugins: [swc.vite({ module: { type: 'es6' } })]` from `unplugin-swc`; the plugin reads `experimentalDecorators` / `emitDecoratorMetadata` from `tsconfig.json`.
- `tsconfig` for Nest: `module`/`moduleResolution` `nodenext`, `experimentalDecorators`, `emitDecoratorMetadata`; **no** `verbatimModuleSyntax`; `useDefineForClassFields` left at the same value for `tsc` and SWC.

ESM + decorators pitfalls to guard with lint (Task 4 of the bootstrap plan):
- circular imports fail with a TDZ `ReferenceError` at class definition → `import-x/no-cycle`;
- `import type` of an injected class yields `Object` metadata and DI fails at runtime. Lint does **not** catch a hand-written `import type` (verified in checkpoint 2 review): `consistent-type-imports` with type information only prevents its auto-fix from creating such imports. The guard is a boot test per app — `createApp()` + `init()` resolves every module's providers — which `apps/api/test/health.e2e.spec.ts` performs for the whole `AppModule`; every new module is imported there and therefore covered.

## Spike S6 result (2026-09-29)

Question: can database-enforced constraints that the Prisma schema cannot express (CHECK, partial unique indexes, extensions) live in Prisma migrations without drift? Which side generates ids, and how do integration tests reset the database?

Setup: Prisma 7.10.0 (`prisma-client` generator, ESM, `@prisma/adapter-pg` 7.10.0, `pg` 8.23.0, `prisma.config.ts`) against compose PostgreSQL 18.6. The spike ran Prisma alone: Nest + Prisma ESM interop was already verified in S2.

Results (all pass criteria met):

| # | Criterion | Result |
|---|---|---|
| 1 | No drift after hand-edited migration | pass: a second `prisma migrate dev` reports "Already in sync"; `--create-only` produces an empty migration; a later real schema change (`ADD COLUMN`) does not drop the partial index or the CHECK |
| 2 | `migrate diff` against the schema | pass: `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` exits 0 when in sync and 2 after a real schema change |
| 3 | Partial unique index enforced | pass: a second live default fails with `P2002`; a revoked default and a non-default row are allowed alongside it; 3 concurrent inserts → 1 fulfilled, 2 rejected |
| 4 | `uuidv7()` | pass: `SELECT uuidv7()` works; ids have version nibble 7 and sort in creation order |
| 5 | Test reset | pass: one `TRUNCATE "User", "Thing" RESTART IDENTITY CASCADE` takes 3–8 ms |

Decisions:

- **Raw SQL constraints.** Create a migration with `prisma migrate dev --create-only`, then edit it before applying: prepend `CREATE EXTENSION` (it must run before the first column that uses the type), and append the `CHECK` and partial `UNIQUE INDEX` statements. Every raw constraint gets an explicit name (for example `Thing_one_live_default`), because error mapping keys on it. Prisma does not track these objects, so they cause no drift. It also does not recreate them, so a table rewrite must restate them by hand.
- **Prisma's native partial indexes are not used.** `@@unique([...], where: raw("..."))` exists in 7.10 only behind the `partialIndexes` preview feature. Preview features can change without a major release; raw SQL is stable. Revisit when the feature is GA. If the `partialIndexes` or `postgresqlExtensions` preview is ever enabled, Prisma starts tracking these objects, so rerun the drift check.
- **`citext`.** `CREATE EXTENSION IF NOT EXISTS citext` goes at the top of the first migration (Prisma does not create it). Columns use `@db.Citext`. Verified: `U0@example.COM` conflicts with `u0@Example.com` (`P2002`), and `findUnique` finds `U1@EXAMPLE.com` as `u1@Example.com`. Trimming stays in the request schema; citext handles case only.
- **Ids.** DB-side `@id @default(dbgenerated("uuidv7()")) @db.Uuid`, so rows inserted by raw SQL or other tools also get time-ordered ids.
- **Test reset.** One `TRUNCATE <all model tables> RESTART IDENTITY CASCADE`, excluding `_prisma_migrations`, between test files.
- **CI drift check.** The command from criterion 2. It requires `datasource.shadowDatabaseUrl` in `prisma.config.ts` (without it: "You must set `datasource.shadowDatabaseUrl` … to diff a migrations directory"); there is no `--shadow-database-url` flag in 7.10. CI uses a separate, disposable database for the shadow.

Error mapping (input for the error filter in Task 6):
- A unique violation is `PrismaClientKnownRequestError` `P2002`. With the driver adapter, the constraint name is in `meta.driverAdapterError.cause.constraint.index`, **not** in `meta.target`.
- A CHECK violation is `P2039` ("Database error") with `meta.driverAdapterError.cause.originalCode === '23514'`; the constraint name appears only in the message.
- **`meta` and the message contain the failing row** (`detail: "Failing row contains (…, email, …)"`). The error filter must never log or return `meta` or the raw message, only the mapped code and the constraint name (rule 09).

## Phase 2 implementation notes (2026-09-30)

- `openapi:check` runs as a Vitest test (`apps/api/test/openapi.spec.ts`) inside the API suite, so the snapshot is checked wherever tests run; `openapi:write` regenerates it.
- Every operation documents `ProblemDetails` (RFC 9457) as its `default` response; the problem schema is loose because RFC 9457 allows extension members.
- Constraint violations are mapped by constraint name (`constraintViolation()`); `error.meta` is never logged or returned because it contains row data (Spike S6).
