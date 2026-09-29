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
| `API_VALIDATION` | in-house `ZodValidationPipe` (a few lines) + Zod 4 native `z.toJSONSchema(schema, { target: 'openapi-3.0' })` fed to `@nestjs/swagger` decorators. `nestjs-zod` rejected (no NestJS 12 support) |
| `API_TEST_RUNNER` | Vitest 5 + `unplugin-swc` (decorator metadata) |
| `PRISMA_CLIENT_FORMAT` | `prisma-client` generator, `moduleFormat = "esm"`, output inside `src/generated/prisma` (generated, not committed), `@prisma/adapter-pg` driver adapter, `prisma.config.ts` |

Versions used: Node 24.21, pnpm 11.28.2, TypeScript 6.0.3, NestJS 12.1.1, @nestjs/swagger 12.0.2, Zod 4.6.5, Prisma 7.10.0, Vitest 5.0.2, unplugin-swc 2.0.0, @swc/core 1.16.12.

Caveats:
- pnpm 11 blocks dependency build scripts by default; `allowBuilds` in `pnpm-workspace.yaml` must list `@prisma/engines`, `prisma`, `@swc/core`. `@scarf/scarf` (install telemetry pulled in via `swagger-ui-dist`) is explicitly denied.
- Wiring pipe + OpenAPI per endpoint is manual. Phase 2 adds a small decorator pair (for example `@ZodBody(schema)` / `@ZodResponse(schema)`) so the schema is declared once per endpoint.
- Fallback B (NestJS 11 legacy + nestjs-zod) was not needed and was not tested.
