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

**Slice 6 status (PR B + PR D, branches `feat/phase-4-worker` and `feat/phase-4-media-processing`, 2026-10-04): worker, purges and media processing implemented, PRs to `dev` pending.** pg-boss job queue with transactional enqueue (spike S7), the worker entrypoint and image, a Render background worker for staging (owner actions in `docs/deployment/staging.md` step 8), purge of deleted content and of `DELETING` collections, and an hourly sweep that also removes long-idle guest sessions. PR D adds photo thumbnails and previews (HEIC included) and video posters with durations (spike S5 tools in the worker image), shown in the admin grid and viewer and in the guest's own frames; staging promotion waits for owner actions R1, R2 and W4, then the smoke checklist S1 (`docs/development/README.md`).

**Slice 5 status (PR C, branch `feat/phase-4-uploads`, 2026-10-04): uploads implemented, PR to `dev` pending; not promoted to staging before PR D [C13].** Upload sessions with quota reservations, direct multipart upload to storage for every file, verified completion (parts, size, content signature) with a claim instead of a long transaction, cancel, expiry and discard jobs, rate limits, the guest uploader with every state, file frames and the viewer for the admin, downloads as attachments. Photo and video previews follow in PR D (until then «Готується прев’ю»).

**Slices 7–8 status (PR E, branch `feat/phase-4-content-management`, 2026-10-04): implemented, PR to `dev` pending.** Admin multi-select and bulk delete, guest own-content deletion with the «Гості можуть видаляти своє» link switch, the guest's shared gallery («Усі кадри») with the viewer and «Оновити» (never polled), and borderless photo-grid tiles for admin and guest (owner remark 62). Hide stays with slice 9 (operator) per [O3].

**Slice 8a status (PR F, branch `feat/phase-4-appearance-api`, 2026-10-04): the collection cover and welcome message API implemented, PR to `dev` pending; PR G (web) follows.** Plan: `docs/superpowers/plans/2026-10-04-collection-appearance.md` (owner decisions A1–A10). `Collection.welcomeMessage` through `PATCH`; `CollectionCover` (one per collection, replaced whole) set by an admin multipart upload (`purpose = COVER` on `UploadSession`, the guest completion's inspector reused, the original copied server-side) or from any live guest photo frame (copied, so deleting the frame never touches the cover), removed whole; cover URLs on the admin DTO and, once `READY`, on the guest context; cover bytes in usage; `media.cover-derivatives` and `cover.purge` in the worker; per-IP and per-user rate limits on the cover routes. The «Вигляд» tab, the shared `CollectionCover` component, the dashboard card, share dialog and guest hero, and the Playwright journeys are PR G.

**Slice 8a status (PR G, branch `feat/phase-4-appearance-web`, 2026-10-04): the web side implemented, PR to `dev` pending the owner's design review.** `CollectionCover` in `packages/ui` (the cover picture or the initials `TintTile`, sizes `sm`/`cover`/`hero`, stories with axe); the cover on the dashboard card, as a 44px mark in the share dialog and as the guest page hero (only when ready: 16:10 phones, 2:1 tablets, 4:3 side panel), the welcome message on the guest page; the fourth tab «Вигляд» (`?tab=appearance`: cover card with every state, upload through the generalised `UploadTransport`, polling while `PENDING`, removal; the welcome form; read-only when archived); the frame picker and «Зробити обкладинкою» in the admin viewer; Playwright journeys in `e2e/tests/appearance.spec.ts`; PRODUCT/mvp/post-mvp and the design docs updated (cover and welcome message moved into MVP).

**Slice 10 status (PR F1, branch `feat/phase-4-legal-pages`, 2026-10-04): legal pages implemented, PR to `dev` pending; acceptance recording follows in PR F2.** Plan: `docs/superpowers/plans/2026-10-04-legal-and-acceptance.md` (owner decisions L1–L4). A registry of document versions in `@stepler/contracts`, placeholder Markdown texts (uk/en) marked as drafts, `/legal/terms` and `/legal/privacy` with the draft banner, version/date and the contact block from `LEGAL_CONTACT_EMAIL`, a start-up readiness check (`LEGAL_ALLOW_DRAFT`), footer and admin sidebar links, the guest notice, and the publishing runbook `docs/legal/README.md`. Owner action E1 (the contact e-mail on staging) before promoting.

**Slice 10 status (PR F2, branch `feat/phase-4-legal-acceptance`, 2026-10-04): acceptance recording implemented, PR to `dev` pending.** ADR 0016. The sign-in card's required checkbox (magic link and Google) carries the current versions to the API, which records `LegalAcceptance` rows (no IP) in the sign-in transaction; `AuthGuard` answers `403 LEGAL_ACCEPTANCE_REQUIRED` until both documents are accepted; `/accept-terms` is the fallback (staging accounts from before F2 see it once); the account page shows «Правові документи». [C20] stays until owner action E2 (real texts).

**Guest page templates status (PR H merged 2026-10-05; PR I, branch `feat/templates-api`, 2026-10-05: implemented, PR to `dev` pending).** Plan: `docs/superpowers/plans/2026-10-05-guest-page-templates.md` (owner decisions D1–D5), ADR 0017. PR H: `apps/templates` (definitions, contrast, tokens, twelve self-hosted fonts, `classic` as the previous guest page, the `templates:dev` gallery), the guest page rendered through the template. PR I: `CollectionImage` (cover, background, collection image), `GuestPageVersion` (published + draft with a per-collection revision), the backfill, the editor API (draft, publish, reset, draft images), the admin-only collection image API, renditions per slot and image purge in the worker; the slice 8a cover routes and `PATCH welcomeMessage` keep working as a "publish now" adapter until PR J. The redesigned templates are PR K, the collection image UI and the contraction PR L.

**Guest page editor status (PR J, branch `feat/templates-editor`, 2026-10-05): implemented, PR to `dev` pending the owner's design review.** The «Гостьова сторінка» tab is the editor: the inert same-origin preview route `/preview/collections/{id}` in an iframe fed by `postMessage`; the working copy autosaved into the draft (one request at a time, revisions, a 409 never resent); «Зберегти» and «Скинути зміни»; the desktop panel and the phone bottom sheet; visible lock reasons; «Скоро» for the five templates of PR K; the `Slider` primitive and a toast action in `packages/ui`. «Зробити обкладинкою» now fills the draft. The slice 8a paths are gone: the `/cover` routes, the `BOTH` image target and `welcomeMessage` on `PATCH /collections/:id` (the `LEGACY_COVER` enum value stays, unwritten). Journeys in `e2e/tests/guest-page-editor.spec.ts`.

**Guest page templates status (PR K, branch `feat/templates-t2-t6`, 2026-10-05): implemented, PR to `dev` pending the owner's design review.** The six templates to their artboards: `classic` redesigned, `fullscreen`, `journal`, `postcard`, `party`, `minimal`; fixed schemes [D5] with a token bridge so the app's slots follow the template; a `storybook-reduced-motion` project for the templates; the template matrix journeys in `e2e/tests/guest-templates.spec.ts` (360px on every project, 1440px on desktop, reduced motion, contrast at 320px); DESIGN-SYSTEM §13, ADR 0015 amended for T4's rotation, ADR 0017 (the template list and the page weight). Locks of T3, T4 and T6 await the owner's confirmation.

**Collection image and contraction status (PR L, branch `feat/collection-image`, 2026-10-05): implemented, PR to `dev` pending the owner's design review.** «Параметри колекції» opens with «Картинка колекції»: upload, «Вибрати з кадрів» (the shared picker) or «Прибрати», shown only to the owner on the dashboard card and in the share dialog (initials otherwise, never the guest cover). The migration `20261005130030_drop_slice_8a_cover` drops `CollectionCover`, `CoverStatus`, `CoverSource` and `Collection.welcomeMessage` behind guards (ADR 0017 "Contraction done"); the slice 8a job names and `Collection.cover` are gone, and `LEGACY_COVER` stays. Journeys in `e2e/tests/collection-image.spec.ts`; migration test `apps/api/test/migration-contract-cover.e2e.spec.ts`.

**Slice 9 status (content reports and the operator console, 2026-10-06): implemented on branch `fix/polish-batch-2` in three checkpoints M1–M3, PR to `dev` pending.** Plan: `docs/superpowers/plans/2026-10-06-content-reports-and-operator.md` (owner decisions R1–R8, defaults Q1–Q7), ADR 0013 (and the ADR 0009 addendum: the worker sends mail). M1: `ContentReport`, hidden frames and blocked collections closed on every guest path, guest reports, admin hide/unhide/dismiss, the operator API (`/api/v1/operator/*`, reported scope only), report mail through the worker with e-mail retention. M2: the `/ops` console (queue, detail, reasoned actions) behind the operator check with an import boundary. M3: `ReportDialog` and frame marks, «Поскаржитися» in the guest viewer, moderation in «Вміст», the blocked banner, dashboard badge and blocked sign-in message, Terms/Privacy v2 (re-acceptance), journeys in `e2e/tests/{ops-access,reports,blocking}.spec.ts`, and one styled not-found page. Owner actions: O1 the service mailbox, O2 `OPERATOR_EMAILS` (API and worker) and the worker's SMTP settings on Render before promoting, O3 the `/operator/session` smoke test, O4 re-accepting v2 once (`docs/deployment/staging.md` §10).

**Slice 9b status (appeals, the moderation quarantine and the ops split, 2026-10-07): implemented on `fix/polish-batch-2`, PR to `dev` pending.** Plan: `docs/superpowers/plans/2026-10-06-appeals-and-quarantine.md`, ADR 0013 addendum. S1/S2: one collection display status everywhere and a multi-select dashboard «Стан» filter. The operator's deletion is a 90-day quarantine (restorable, outside the owner's quota, purged by the hourly sweep); the collection admin appeals operator hides, quarantines and collection blocks in the app (the frame's moderation panel, the blocked banner) and sees the outcome there; the console splits «Скарги гостей» and «Апеляції адміністраторів» (`/ops/appeals`, uphold reverses the measure, reject needs a note). Legal v2 drafts mention both (still unreleased). Journeys in `e2e/tests/appeals.spec.ts`.

**Production gate [C20]:** guest contribution must not reach production before the guest Terms/Privacy notice (F8, slice 10) with the **real texts published** (`draft: false` in the registry) and `LEGAL_CONTACT_EMAIL` set; the web server refuses to start otherwise, and `LEGAL_ALLOW_DRAFT` is never set in production. Staging only until then.

Each slice should be fully tested before moving on.

Not in MVP (post-MVP per `PRODUCT.md`): folders, billing, retention policies, analytics, downloads/ZIP, custom form builder.

## Important

Claude should challenge the draft architecture where evidence suggests a better solution. It should not silently deviate.
