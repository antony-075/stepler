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

**Status: implemented on branch `phase-2/foundation` (2026-09-30).** Plan: `docs/superpowers/plans/2026-09-29-phase-2-foundation.md`. Moved by owner decision: the Jobs port (pg-boss) to slice 5, legal acceptance to slice 10, `AuditEvent` to slice 1. The error-monitoring port exists with a logging adapter only; the provider is still open.

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

**Status: implemented on branch `feat/phase-3-design-system` (2026-09-30), PR to `dev` pending.** Plan: `docs/superpowers/plans/2026-09-30-phase-3-design-system.md`. Inventory, rules, tokens and known issues: `docs/ux/design-system.md`. Also in this phase: the theme preference (`st_theme` cookie, no flash), the language switch synced with the admin profile, and the admin shell with navigation and account menu.

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

**Slice 1 status: implemented on branch `feat/phase-4-collections-c` (2026-10-02, web in direction C), PR to `dev` pending.** Plan: `docs/superpowers/plans/2026-10-01-phase-4-slice-1-collections.md` (owner decisions D1–D9). Open acceptance criterion: "A default guest link is created" with a new collection (D3) is delivered by slice 2, which adds the link to the create transaction and backfills existing collections.

**Slices 3–4 status (PR A, branch `feat/phase-4-guest-session`, 2026-10-03): implemented, PR to `dev` pending.** Plan: `docs/superpowers/plans/2026-10-03-phase-4-guest-content.md` (owner decisions O1–O4, C1–C20). Guest session exchange and per-collection cookie, the guest page (name prompt, wishes, own frames, the shared gallery for texts), frame numbers, the admin «Вміст» tab for texts (viewer, delete) and content counts on the dashboard. Uploads, the worker and processing follow in PRs B–D; guest own-delete and bulk delete in PR E.

**Slice 6 status (partial; PR B, branch `feat/phase-4-worker`, 2026-10-03): worker and purges implemented, PR to `dev` pending.** pg-boss job queue with transactional enqueue (spike S7), the worker entrypoint and image, a Render background worker for staging (owner actions in `docs/deployment/staging.md` step 8), purge of deleted content and of `DELETING` collections, and an hourly sweep that also removes long-idle guest sessions. Thumbnails, previews and posters follow in PR D.

**Production gate [C20]:** guest contribution must not reach production before the guest Terms/Privacy notice (F8, slice 10). Staging only until then.

Each slice should be fully tested before moving on.

Not in MVP (post-MVP per `PRODUCT.md`): folders, billing, retention policies, analytics, downloads/ZIP, custom form builder.

## Important

Claude should challenge the draft architecture where evidence suggests a better solution. It should not silently deviate.
