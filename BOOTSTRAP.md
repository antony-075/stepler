# Bootstrap Plan for Claude Code

This file describes only the technical bootstrap and the order of MVP work.
Product scope is defined by `docs/product/PRODUCT.md`. Architecture is defined by
`docs/architecture/mvp-architecture-spec.md` and ADRs in `docs/architecture/decisions/`.

## Phase 0 — Discovery (done 2026-09-29)

- Architecture discovery, contradictions and missing decisions: see `docs/architecture/discovery-questions.md`.
- Proposed architecture: `docs/architecture/mvp-architecture-spec.md`, ADR 0004–0013.

## Phase 1 — Scaffold

Before scaffolding, run spikes S2 (contracts / CJS-ESM interop), S3 (Vitest + NestJS) and S8 (i18n without locale prefix) from the spec §20.

Create:
- git repository with `.gitignore` (IDE files, `.DS_Store`, env files, build output);
- pnpm workspace, Turborepo, Node 24 LTS;
- apps/web (Next.js);
- apps/api (NestJS);
- packages/contracts;
- packages/ui (+ Storybook);
- packages/config;
- TypeScript strict;
- ESLint/Prettier (incl. rule against literal user-facing strings);
- Vitest;
- Playwright;
- Docker Compose (PostgreSQL 18, Mailpit); the S3-compatible emulator is added in Phase 2 with spike S4, when the storage adapter first needs it;
- env validation;
- i18n foundation (uk default, en);
- GitHub Actions CI: lint, typecheck, test, build.

Do not implement product features. CD is out of scope until hosting is chosen.

## Phase 2 — Foundation

Implement:
- NestJS health (live/ready);
- Swagger/OpenAPI from contracts;
- Prisma, DB connection, first migration (spike S6);
- problem+json error handling;
- request IDs, structured logging with redaction;
- provider ports: ObjectStorage (spike S4, adds the S3-compatible emulator to Docker Compose), Mailer, Jobs, Turnstile verifier, error monitoring;
- config-driven limits (`LimitsService`);
- auth boundary: admin sessions, magic link, Google OAuth (spike S1), principal resolution, operator resolution.

## Phase 3 — Design system

Build Storybook primitives and responsive foundations (mobile-first guest, responsive admin).

## Phase 4 — Product vertical slices (MVP)

1. Collection (CRUD, archive, dashboard, account limits)
2. Guest Link (permissions, deactivate/revoke/rotate, QR)
3. Guest experience (session exchange, guest landing, visibility modes)
4. Text submission
5. Storage/upload (upload sessions, direct R2 upload, completion, cleanup)
6. Processing (worker: thumbnails, previews, posters, purge)
7. Admin content management (gallery, filters, delete/hide)
8. Guest own-content deletion
9. Content reports + operator flow
10. Legal pages and acceptance recording

Each slice should be fully tested before moving on.

Not in MVP (post-MVP per `PRODUCT.md`): folders, billing, retention policies, analytics, downloads/ZIP, custom form builder.

## Important

Claude should challenge the draft architecture where evidence suggests a better solution. It should not silently deviate.
