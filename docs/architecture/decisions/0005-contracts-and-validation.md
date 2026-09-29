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
