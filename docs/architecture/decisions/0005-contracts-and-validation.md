# ADR 0005 — Shared Contracts and Validation

Status: Accepted (pending spike S2)
Date: 2026-09-29

## Context

Frontend forms use React Hook Form + Zod (rules). The API needs authoritative server-side validation and Swagger. Maintaining class-validator DTOs on the server and Zod schemas on the client would duplicate validation rules.

## Decision

- `packages/contracts` holds Zod schemas for request/response bodies, error codes and shared enums.
- NestJS validates with those schemas (nestjs-zod or an equivalent pipe) and generates OpenAPI from them.
- The web app uses generated OpenAPI types (openapi-typescript + openapi-fetch) for calls and the same Zod schemas for forms.
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

Versions used: Node 24.21, pnpm 11.28.2, TypeScript 6.0.3, NestJS 12.1.1, @nestjs/swagger 12.0.2, Zod 4.6.5, Prisma 7.10.0 (pin `prisma` and `@prisma/client` exactly — npm `latest` for `prisma` is an 8.0 RC), Vitest 4.1.11 / 5.0.2, unplugin-swc 2.0.0, @swc/core 1.16.12.

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
- `import type` of an injected class yields `Object` metadata and DI fails at runtime → `@typescript-eslint/consistent-type-imports` must run with type information (projectService) so it respects decorator metadata.
