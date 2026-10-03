# Stepler Phase 4, Slices 3–8: Guest Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest who opens a live link gets a session, can leave an optional name, write a wish and upload photos, videos and documents straight to object storage; the admin sees every contribution in the collection's «Вміст» tab (grid, type filter, full-screen viewer, metadata, download, delete one or many); a guest sees what the link allows (everyone's frames or only their own) and can delete their own; a worker makes thumbnails, previews and posters and purges deleted content, deleted collections and expired uploads.

**Architecture:**
- **API** (NestJS modular monolith) gains three modules and extends one:
  - `guest-access` (extended): guest sessions, the per-collection `st_gs` cookie, `GuestSessionGuard` and the guest principal;
  - `content` (new): content items, frame numbers, admin and guest gallery queries, deletion, signed media URLs, text submission;
  - `uploads` (new): upload sessions, presigning (single PUT and multipart), completion verification, cancellation;
  - `jobs` (new): the job-queue port with a pg-boss adapter, enqueued **in the same transaction** as the state change (spike S7).
- **Worker**: a second entrypoint of the same codebase (`apps/api/src/worker/main.ts`, spec §3: "a second entrypoint of the same modular monolith"), its own image with ffmpeg and HEIC support, its own Render background-worker service on staging. Jobs: discard upload, purge content, purge collection, expire uploads, sweep, image derivatives, video poster.
- **Browser → storage** directly with short-lived presigned URLs (ADR 0003/0008); the API never carries file bytes. The API stays authoritative for authorization, quotas, completion and metadata.
- **Web**: `/g/[token]` becomes the real guest page (mobile-first, Direction C, PrintStack success moment); the collection page's «Вміст» tab becomes the admin gallery. Upload queue state is local to the guest page (`useReducer`), server state in TanStack Query.
- **Shared UI**: frame, grid, viewer, upload and selection components in `packages/ui` with stories and axe tests (DESIGN-SYSTEM §5.9–§5.13, §5.18).

**Tech Stack:** As slices 1–2 (NestJS 12 ESM, Prisma 7 on PostgreSQL 18, Zod 4 contracts, Next.js 16 + next-intl, TanStack Query 5, React Hook Form, Tailwind 4 + shadcn/Radix, Storybook 10 + Vitest browser + axe, Playwright 1.63). New, each justified in its task under rule 14: **pg-boss** (queue, ADR 0009), **sharp** (images, worker), **ffmpeg/ffprobe** and a **HEIC decoder** (worker image, chosen by S5), optionally **@uppy/core + @uppy/aws-s3** (only if S9 chooses them). No other dependency.

**Spec:**
- `docs/product/PRODUCT.md` §3.2, §6 (guest experience, upload states, text), §7 (visibility), §9 (ownership), §12 (content management), §13–§14, §27 Journeys 2–5, §28 (edge cases);
- `docs/product/user-stories.md` A5, G1–G7; `docs/product/acceptance-criteria.md` (Guest access, Upload, Visibility, Ownership, Responsive, API, Reliability); `docs/product/mvp.md`;
- `docs/architecture/mvp-architecture-spec.md` §3, §5, §7.2 `GuestSession`, §7.3, §8, §9 + §9.1, §10, §11, §12, §13, §17, §18, §20 (S5, S7, S9);
- ADR 0003, 0007, 0008, 0009, 0010, 0013 (no reports in this work), 0014, 0015 (frame numbers, time, retry);
- `docs/architecture/discovery-questions.md` D1–D12, F1, F5, F7, F8;
- `docs/design/DESIGN-SYSTEM.md` §5.7–§5.13, §5.16–§5.18, §6.1–§6.4, §6.6, §6.10, §7, §8, §9, §11, §12; `docs/ux/design-system.md` (what is implemented);
- the slice 1 and slice 2 plans (conventions, `[G#]` decisions still in force).

## Prerequisites

- `dev` contains slices 1–2 and the links polish (PR #26) and the CI timeout fix (`fix/ci-e2e-timeout`).
- The owner has confirmed (or overridden) the decisions marked **[confirmed by owner 2026-10-03]** below. Tasks are written against the recommendations; a different answer changes only the steps tagged with that decision id.
- Each PR is cut from the then-current `dev` and opened against `dev`; promotion to `stage` happens only at the points in "PR split" and after the owner actions listed there.

## Owner decisions already made (2026-10-03)

- **[O1] Background processing is a separate worker service** with pg-boss in PostgreSQL (ADR 0009), including a new Render service for **staging** in `render.yaml`. Production services are not added.
- **[O2] Text wishes are included:** `canSubmitText`, plain text, at most 5000 characters (D5).
- **[O3] Admin content management** = browse (grid, filter by type), full-screen viewer, metadata (contributor name, time, size, frame number), download original, delete one, multi-select and delete several. **No hide/unhide.**
- **[O4] Guest name:** optional «Як вас звати?» asked **once before the first contribution** (upload or text), with «Пропустити»; remembered for that guest session and editable; the admin sees it per item; never shown to other guests (D6).

## Decisions (recommendations; **[confirmed by owner 2026-10-03]** = the owner should answer before the PR it affects)

1. **[C1] PR split — five PRs, in order** (details in "PR split" below): A guest session + guest page + names + texts + admin content tab (texts); B worker + jobs + purges; C uploads + admin gallery for files + uploader; D media processing; E guest gallery + own delete + admin multi-delete. Spikes S5/S7/S9 (Tasks 1–3) run first, in parallel with PR A.
   - Why this order: A ships the whole loop "guest contributes → admin sees → admin deletes" with no storage risk; B must exist before C because rejected, cancelled and expired uploads need cleanup jobs from day one (D8), and B alone already pays off (slice 1's `DELETING` collections are finally purged); D after C because previews need originals; E last because it only adds views and deletes on top of existing data.
   - Alternative: the four PRs from the brief (uploads and the worker together). One PR would then carry the upload protocol, the queue, a new service and a new image at once, which is hard to review and to roll back.
2. **[C2] [confirmed by owner 2026-10-03] Where the worker lives.** **Recommended:** code in `apps/api/src/worker/` (second entrypoint, shares `PrismaService`, `ObjectStorage`, the job names and the purge logic by plain imports), image `apps/api/worker.Dockerfile` (adds ffmpeg + HEIC decoder), root script `pnpm worker:dev`. Spec §3 says the worker is "a second entrypoint of the same modular monolith, not a microservice", and the Prisma client is generated inside `apps/api`.
   - Alternative: a separate `apps/worker` package as the brief literally says. It needs the Prisma schema, client and storage adapter moved into a new `packages/db` (and `packages/storage`) first, which touches migrations, Dockerfiles and Render's pre-deploy command; and Nest DI across two packages depends on pnpm resolving one `@nestjs/common` instance. Worth it only if the worker will be developed by a different team.
3. **[C3] [confirmed by owner 2026-10-03] Guest session exchange is two calls, not one** (amends spec §9.1). The `st_gs` cookie is path-scoped to `/api/v1/guest/collections/{collectionId}` (ADR 0007), so the browser never sends it to `POST /guest/sessions`; with the spec's single call the API could never re-bind, and every reload would create a new session and lose "my frames".
   - **Recommended flow:** `POST /guest/links/resolve {linkToken}` (exists; its response gains `collectionId`) → `POST /guest/collections/{collectionId}/session {linkToken}`, which **is** under the cookie path, re-binds or creates the session and sets the cookie. The API checks that the token's collection equals the path's `collectionId` (otherwise `404`), so nobody can plant a session cookie for another collection.
   - The collection id is not a secret (CLAUDE.md §8), and a guest needs it for every later call anyway.
   - Alternative: cookie `Path=/api/v1/guest` with a per-collection name `st_gs_{collectionId}`. One call, but every guest request then carries the cookies of every collection the device visited, which ADR 0007 rejected (linkable across collections).
4. **[C4] [confirmed by owner 2026-10-03] Guest name storage and editing.** `GuestSession.contributorName` (≤ 80, nullable) plus `GuestSession.nameAnsweredAt` (set on save **or** skip, so the prompt appears once per session); each new `ContentItem.contributorName` is a snapshot of it (spec §7.3, D6). This amends spec §7.2/§15 ("the guest name is not stored on the session") per [O4].
   - **Recommended:** editing the name also updates `contributorName` on this session's **non-deleted** items in the same transaction, so the admin never sees two names for one guest after a typo fix.
   - Alternative: new name applies only to future contributions (pure snapshot; simpler, but a typo stays on everything already sent).
5. **[C5] [confirmed by owner 2026-10-03] Gallery order: newest first** for admin and guest (DESIGN-SYSTEM §12.19 default was "by number, ascending"). During an event the admin wants what just arrived, and polling for new items only touches the first page. The admin «Вміст» tab gets a sort select «Спочатку нові» / «За номером кадру» (newest first by default, kept in the URL as `?sort=frame`; the owner was promised this toggle); guests always see newest first.
6. **[C6] [confirmed by owner 2026-10-03] Admin refresh while guests upload:** poll `GET /collections/{id}/content/counts` every 15 s while the «Вміст» tab is visible (`refetchIntervalInBackground: false`); when the total grows, a quiet line «Нових кадрів: 3 · Показати» resets the list to the first page. The grid never shifts under the admin's hand. Alternative: refetch the list itself every 15 s (TanStack refetches every loaded page, and frames jump).
7. **[C7] Bulk delete is one endpoint:** `POST /collections/{id}/content/bulk-delete {ids}` (1–100 ids), one transaction, one audit event per item, response `{deletedIds, notFoundIds}`; already-deleted ids count as deleted (idempotent retry). 100 separate `DELETE`s would be 100 round trips and partial failures the UI has to explain.
8. **[C8] Frame numbers (ADR 0015):** `Collection.nextFrameNo` + `ContentItem.frameNo` with `UNIQUE (collectionId, frameNo)`, assigned by `UPDATE "Collection" SET "nextFrameNo" = "nextFrameNo" + 1 WHERE id = $1 AND status = 'ACTIVE' RETURNING "nextFrameNo" - 1` inside the transaction that creates the item; that same statement is the "collection still active" re-check under a row lock. **Texts get numbers from the same sequence** (ADR 0015, DESIGN-SYSTEM §11.1). Gaps are never filled.
9. **[C9] Lock order rule:** any transaction that locks both takes `User` (owner) first, then `Collection`. Initiation locks the owner (quota); completion and text creation lock only the collection (frame number). Written as a comment on `UsageService.lockOwner` and `FrameNumbers.next`.
10. **[C10] [confirmed by owner 2026-10-03] Rate limits and lifetimes** (all env-backed through `LimitsService`):

    | Key | Value | Source |
    |---|---|---|
    | `LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE` | **120** | spec says 30; raised like [G10] for venue NAT/CGNAT |
    | `LIMIT_TEXTS_PER_GUEST_SESSION_PER_HOUR` | 60 | [assumption] |
    | `LIMIT_UPLOAD_INITIATIONS_PER_GUEST_SESSION_PER_HOUR` | 300 | F1 |
    | `LIMIT_CONCURRENT_UPLOADS_PER_GUEST_SESSION` | 10 | spec §13.1 |
    | `LIMIT_FILE_BYTES_PHOTO` / `_VIDEO` / `_DOCUMENT` | 50 MB / 2 GB / 50 MB (decimal: 50 000 000, 2 000 000 000) | D2 |
    | `LIMIT_FILES_PER_BATCH` | 100 | D2 (UI-enforced) |
    | `UPLOAD_SINGLE_PUT_MAX_BYTES` | 100 000 000 | spec §10.2 |
    | `UPLOAD_PART_SIZE_BYTES` | 10 485 760 (min 5 242 880) | spec §10.2 |
    | `UPLOAD_SESSION_TTL_HOURS` | 24 | spec §10.2 |
    | `UPLOAD_URL_TTL_SECONDS` | 900 | spec §10.2 |
    | `MEDIA_URL_WINDOW_SECONDS` | 3600 | spec §10.6 |
    | guest cookie `Max-Age` | 400 days (the browser cap), renewed on every exchange; no server-side expiry (D12 "without time limit") | |

    Text length 5000 and name length 80 are contract constants mirrored by SQL CHECKs (product rules, not quotas).
11. **[C11] Uploader library — decided by spike S9** (Task 2) on measured criteria; if the result is a tie, **in-house** (no dependency; our state machine drives the UI states anyway).
12. **[C12] HEIC — decided by spike S5** (Task 3). Preferred: Debian's libheif CLI (`heif-dec`/`heif-convert` with the libde265 plugin) in the worker image, decoding to a temporary PNG that sharp reads. Fallback: a WASM decoder (`heic-decode`/`libheif-js`) to raw RGBA in memory. Last resort: HEIC originals are kept, `processingStatus = FAILED`, the frame shows the type tile and «Завантажити».
13. **[C13] [confirmed by owner 2026-10-03] Previews arrive in PR D, not C.** Between C and D, photo and video frames show the «Готується прев’ю» tile; the viewer shows the original (images the browser can decode, native `<video>`), documents a type tile + «Завантажити». No original is ever used as a grid thumbnail (50 MB per tile). **Staging is promoted only after D** (owner confirmed; PR A may be promoted earlier), so staging guests never see the in-between state.
14. **[C14] [confirmed by owner 2026-10-03] CI e2e time:** the `e2e` job becomes a **2-shard matrix** (`--shard=1/2`, `2/2`) in PR A (Task 4), before any new test is added, with no change to existing coverage. New admin-only management journeys carry the tag `@desktop` and run on `desktop-chrome` only (mobile projects get `grepInvert: /@desktop/`); every guest journey runs on all three projects. If a shard passes 25 min, add a third shard (one-line change). Alternative: tag-only scoping, which would cut mobile coverage of existing tests.
15. **[C15] `canDeleteOwn` becomes visible** in the link permission editor in PR E («Гості можуть видаляти свої кадри», under «Що гості можуть додавати», only enabled when a contribution type is on). Existing links keep `true`. Until PR E, guests cannot delete anyway.
16. **[C16] Guest visibility and DTOs** (spec §8, ADR 0015):
    - `canViewGallery` → `scope=all` lists every non-deleted item; without it `scope=all` → `403 FORBIDDEN` and the page asks only for `scope=own`;
    - a guest item carries `frameNo` **only when `isOwn`**, never `contributorName`, `contributorGuestSessionId`, `mimeType` from the client, or any admin field; `canDelete = isOwn && canDeleteOwn`;
    - a guest's single-item read (`GET …/content/{id}`) follows the list rule: not visible → `404`.
17. **[C17] File-type detection is in-house** (`uploads/file-signature.ts`, about fifteen signatures for the D3 list): no `file-type` dependency (rule 14). OOXML: a ZIP whose first local-file header names `[Content_Types].xml`, `_rels/.rels` or `docProps/…`; docx/xlsx/pptx is then taken from the declared extension (all are `DOCUMENT`). Any other ZIP, SVG, HTML or executable is `FILE_TYPE_NOT_ALLOWED`. TXT: first 4 KB valid UTF-8 (a truncated trailing sequence allowed) and no NUL.
18. **[C18] Completion holds the upload-session row lock across the storage checks** (`SELECT … FOR UPDATE`, interactive transaction timeout 30 s): a duplicate or concurrent completion waits and then returns the same item. Storage calls inside the transaction are bounded (HEAD, one 4 KB range GET, ListParts + CompleteMultipartUpload ≤ 205 parts). Rejections are written in that transaction and the `AppError` is thrown **after** commit.
19. **[C19] No `capturedAt`, no `hiddenAt`, no `contributorUserId` in this work.** ADR 0015 allows `capturedAt` "if cheap"; reading EXIF needs a parser dependency, so it is deferred. Hide belongs to slice 9 (operator) per [O3]. Admin uploads are post-MVP; the column is additive later.
20. **[C20] Production gate (not built here):** the guest Terms/Privacy notice (F8) arrives with slice 10. Guest contribution must not reach production before it. Recorded in BOOTSTRAP.md by Task 13.

## Deliberate choices (low risk; override if you disagree)

- **Upload strategy:** `sizeBytes ≤ UPLOAD_SINGLE_PUT_MAX_BYTES` → one presigned PUT signing `Content-Type` and `Content-Length`; larger → multipart, part URLs on demand in batches of ≤ 100, **each part URL signs its `Content-Length`** (full part size, the remainder for the last part), which also enforces R2's equal-part rule (closes the open item in ADR 0008 S4).
- **Initiation is just-in-time:** the client initiates a file only when a transfer slot (3) frees up, so `INITIATED` rows per session stay ≤ 3 plus retries, far below the server's 10.
- **Idempotency:** upload initiation by `(guestSessionId, clientUploadId)` (same metadata → same session with a fresh URL; different metadata → `409 IDEMPOTENCY_CONFLICT`); texts by `Idempotency-Key` header (UUID) stored as `ContentItem.idempotencyKey` with `UNIQUE (contributorGuestSessionId, idempotencyKey)`; completion by upload session; deletes are idempotent (`204` for an already-deleted own item).
- **A paused link or a removed permission rejects completion like a revoke** (D8: completion re-authorizes "now"); the bytes are discarded. The guest sees the paused page and can re-upload after the admin resumes.
- **Quota exceeded** is one code for collection and account (`409 QUOTA_EXCEEDED`), so a guest learns nothing about the owner's other collections. The guest sees «Колекція заповнена — нові кадри не додаються» (DESIGN-SYSTEM §6.10).
- **No guest session without a live link:** every guest route re-resolves session → current link → collection → owner on each request (ADR 0007); `lastSeenAt` is written at most once an hour.
- **Missing or foreign cookie** on a guest collection route → `401 GUEST_SESSION_REQUIRED`; the web re-runs the exchange once (it has the token in the address bar), then retries the call.
- **Media URLs:** presigned GET, signing date aligned to `MEDIA_URL_WINDOW_SECONDS` and `expiresIn = 2 × window`, so a URL is identical within the window (browser-cacheable) and valid ≥ 1 h after issue. `response-content-type` = verified MIME. Disposition: images and video `inline`; documents always `attachment`; the explicit "download" URL is `attachment` for every kind with `filename*=UTF-8''…` from a sanitized original name, fallback `stepler-087.<ext>`.
- **Audit:** `content.delete` (admin actor or guest actor, `actorId = guestSessionId`), `targetType: 'content'`, metadata `{ kind, frameNo, bulk }`; never text bodies, names or filenames. Content creation and upload rejection are logged (reason codes), not audited (spec §7.4 list).
- **Logs:** never the text body, guest name, original filename, cookie, token or any presigned URL (extend `redact.spec.ts`).
- **`processingStatus`:** TEXT and DOCUMENT → `NOT_REQUIRED`; PHOTO and VIDEO → `PENDING` until the worker finishes (`READY`) or gives up (`FAILED`, content stays available).
- **Derived keys** are deterministic: `collections/{collectionId}/derived/{contentItemId}/{thumbnail|preview|poster}.webp`; EXIF (incl. GPS) is never copied into derived media (sharp strips metadata by default; asserted in a test). Originals are untouched (rule 08).

## PR split

| PR | Branch | Tasks | Ships | Promote to `stage`? |
|---|---|---|---|---|
| — | `spike/*` (throwaway) | 1–3 | ADR addenda only (committed in PR A, Task 13) | — |
| A | `feat/phase-4-guest-session` | 4–13 | guest session, guest page, name, texts, guest "own/all" lists (texts), admin «Вміст» with text frames, viewer, single delete, counts on dashboard | optional (no owner action needed) |
| B | `feat/phase-4-worker` | 14–17 | jobs port (pg-boss), worker entrypoint + image + Render service, purge of deleted texts and of `DELETING` collections, sweeps | yes, after owner actions W1–W3 |
| C | `feat/phase-4-uploads` | 18–25 | upload sessions, direct upload, completion, cancel, expiry, quotas + usage line, uploader with all states, admin gallery for files, download | no — wait for D [C13] |
| D | `feat/phase-4-media-processing` | 26–28 | thumbnails, previews (incl. HEIC), video posters + duration; worker image with ffmpeg/HEIC | yes, after owner actions R1–R2 and W4 |
| E | `feat/phase-4-content-management` | 29–32 | guest shared gallery + viewer, guest own delete, `canDeleteOwn` toggle, admin multi-select + bulk delete | yes |

Each PR ends with its own "docs, batched minors, full verification, PR" task, merged with a merge commit.

## Owner-only actions (agents never see or write secrets)

| Id | When | Action |
|---|---|---|
| W1 | before promoting B | Approve the Blueprint change in Render: the new **background worker** `stepler-staging-worker` (Frankfurt, branch `stage`, `autoDeployTrigger: checksPass`). Choose the plan: recommended the same size as the API (0.5 CPU / 512 MB) with media concurrency 1; background workers have no free tier — confirm the monthly cost. |
| W2 | before promoting B | Enter the worker's `sync: false` env vars in the Render dashboard: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (same staging bucket; either the API's R2 token or a new token scoped to that bucket with object read/write). `DATABASE_URL` comes from the Blueprint. |
| W3 | after B is live | Check in Render logs that the worker logs `worker started` and a `maintenance.sweep` run, and that a staging collection deleted earlier disappears from the database within an hour. |
| R1 | before promoting D (uploads) | R2 bucket CORS for the staging origin: `AllowedOrigins: ["https://stepler-staging.onrender.com"]`, `AllowedMethods: ["PUT","GET","HEAD"]`, `AllowedHeaders: ["content-type"]`, `ExposeHeaders: ["ETag"]`, `MaxAgeSeconds: 3600`. |
| R2 | before promoting D | R2 lifecycle rule on the staging bucket: abort incomplete multipart uploads after **2 days** (spec §10.5 safety net). |
| W4 | before promoting D | If S5/D raises the worker's memory need, resize the worker plan. |
| S1 | after promoting D | Run the staging smoke checklist from Task 28 (agents can drive the browser; no secrets needed): a > 100 MB video (multipart, equal parts on real R2), an iPhone HEIC, a PDF, a cancelled upload, a revoked link mid-upload. |

No new application secret is introduced (the guest cookie token is random, hashed in the DB; no new key).

## Pre-implementation gate (rule 19)

- **Similar code:** `GuestLinkResolver` (state precedence [G5]), `auth/tokens.ts` (`generateToken`, `hashToken`), `session-cookie.ts` (`serializeCookie`, `readCookie`), `RateLimitGuard`, `UsageService.lockOwner`, `CollectionsService` (owner scoping, conditional transitions, audit in the transaction), `S3ObjectStorage` (signed headers, checksum settings), `common/cursor.ts`, web `guestLinkState`, `apiRequest`, `Tabs`/`TabsCount`, `ConfirmDialog`, `EmptyState`, `Progress`, `Sheet`, `ToggleGroup`.
- **Data:** new `GuestSession`, `ContentItem`, `UploadSession`, `MediaObject`; `Collection.nextFrameNo`; enums `ContentKind`, `ProcessingStatus`, `UploadStatus`, `UploadStrategy`, `MediaRole`; pg-boss's own schema `pgboss`.
- **API:** guest: resolve (+`collectionId`), session exchange, session name, context, texts, content list/get/delete, uploads initiate/parts/complete/cancel; admin: content list/counts/get/delete/bulk-delete; `GET /me/usage` and `Collection` gain additive fields.
- **Permissions:** guest principal from the cookie on every request; uploads by type; text by `canSubmitText`; list `all` by `canViewGallery`; delete by `canDeleteOwn` + ownership. Admin by ownership. Operator: none in this work.
- **Third parties:** R2/S3 (presigned PUT/GET, multipart) — direct browser transfer is the documented exception (ADR 0003, rule 08). No provider SDK in the browser (Uppy, if chosen, talks only to our API and to presigned URLs).
- **Retry / partial failure / deletion / expiry / mobile:** covered by decisions above and the Review Focus.
- **Tests:** contracts unit; API integration with an authorization matrix (owner, other admin, operator, guest per permission set, guest of another collection, no cookie, revoked/paused link, archived/deleting collection); storage integration on SeaweedFS; worker handler integration; web unit (queue reducer, file rules, state mapping); Storybook play + axe; Playwright on three projects.
- **Scope:** MVP slices 3–8 except hide (slice 9 scope) and reports.

## Global Constraints

- **Branches:** one per PR as in "PR split", cut from `dev`, PR to `dev`, merge commit; never push to `dev`/`stage`/`main` directly (rule 15). One commit per task.
- **Pace over polish:** per-task review raises only important findings (correctness, security, data integrity, accessibility blockers); minors are batched into each PR's last task. One full verification per PR.
- **Authorization:**
  - guest routes live under `/api/v1/guest/collections/:collectionId/…`, are `@Public()` for the admin guard and protected by `GuestSessionGuard`; every query filters by `principal.collectionId` (path ids are lookups inside that scope);
  - admin content routes reach rows only through `collection.ownerId = principal.userId AND collection.status <> 'DELETING'`;
  - out of scope → `404 NOT_FOUND` (no existence disclosure); the link/collection state codes from [G5] keep their precedence;
  - every unsafe method keeps the CSRF origin check.
- **Contracts:** schemas in `@stepler/contracts` (strict objects, no `.transform()`, no `z.date()`); new error codes appended to `ERROR_CODES` with uk/en messages; DTOs map explicitly — never a Prisma row.
- **Database:** additive migrations created with `--create-only`, named raw-SQL CHECKs and partial indexes appended (ADR 0005); `pnpm db:check` passes; ids `uuidv7()`; `bigint` for byte sizes in the DB, `number` (safe integer) in JSON.
- **Limits:** only through `LimitsService`. Each new env var goes into `env.ts` (or `worker-env.ts`), `apps/api/.env.example`, `turbo.json` `passThroughEnv` (`dev`, `e2e`, and the new `worker:dev`), the e2e `webServer` env where tests override it, and the README env table.
- **Storage:** no file bytes through Node except the worker's derivative inputs (≤ 50 MB images, streamed to a temp file) and the 4 KB signature read; video is read by ffmpeg from a presigned URL (rule 08).
- **Secrets & privacy:** cookies, tokens, presigned URLs, text bodies, guest names and filenames are never logged, audited or put in error bodies; `/g/*` keeps `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and no third-party script.
- **OpenAPI:** `@ApiTags('Guest')` / `@ApiTags('Content')` / `@ApiTags('Uploads')`, `@ApiCookieAuth` where relevant, `@ApiResponse({ standardSchema })` + documented error codes per route; `pnpm openapi:write` in the same commit.
- **Web:** TanStack Query for server state, `useReducer` for the upload queue (no Zustand: the queue never leaves `/g/[token]`); React Hook Form + contract schemas for the name and text forms; no literal UI strings (uk default, en parity); every destructive action through `ConfirmDialog`; touch targets ≥ 44 px; nothing hover-only; no horizontal scroll at 320/360/390.
- **Direction C (ADR 0015):** pencil only for the guest's main action, selection, «нове», active tab and upload progress; violet `--link` focus ring; admin primary buttons ink; rotation/overlap/shadow only in `PrintStack` on the guest success screen; frame numbers in Geist Mono; admin sees all numbers, guest only own.
- **Design pass (every UI task):** before writing the screen apply the frontend-design skill, `.claude/skills/ui-ux-pro-max`, `web-design-guidelines`, `responsive-design`; write the decisions as a 5–10 line header comment in the screen's main file; after implementing, screenshots at 360×780, 390×844 and 1440×900, light and dark, saved to `$TMPDIR/stepler-content-screens/<pr>/` (not committed) for the owner's design review before the PR.
- **Never** start/stop the owner's dev servers (web 3000, API 4010) or touch `apps/*/.env`; `pnpm e2e` is safe alongside them (it builds `dist-e2e` and uses ports 3100/4100).
- **Dependencies:** only those named in this plan, each checked under rule 14 in its task (version, maintenance, licence, size).

## Review Focus

1. **Another guest's content by changing an id** (IDOR/BOLA). Guest A and guest B in the same collection, guest C in another: A calls complete/cancel/parts on B's upload id, deletes or reads B's item without `canViewGallery`, and C calls collection X's routes with C's own cookie. Expected: always `404` (or `401 GUEST_SESSION_REQUIRED` for C), no row changed, no presigned URL in any body. Owned by Task 7 (`guest-session.guard`), Task 9, Task 21 and Task 30 matrices.
2. **The link changes while files are in flight.** A batch of 6 is uploading; the admin pauses or revokes the link (or turns off `canUploadVideos`) after file 2. Expected: files already completed stay; every later completion is rejected (`LINK_INACTIVE` / `LINK_REVOKED` / `FORBIDDEN`), their bytes are discarded by the worker, queued files never start, and the page switches to the link-state template while keeping «Додано 2». Tests in Task 21 (API) and Task 25 (e2e).
3. **Retries and doubles.** A completion retried after a timeout, two completions in parallel, an initiation retried with the same `clientUploadId`, a text submitted twice with one `Idempotency-Key`, a bulk delete retried. Expected: exactly one `ContentItem` and one frame number each time, the same response body, one audit row per deleted item. Tests in Tasks 9, 21, 31.
4. **Quota under concurrency.** Two guests (or two collections of one owner) initiate uploads that each fit alone but not together. Expected: exactly one succeeds, the other gets `409 QUOTA_EXCEEDED`; deleted items stop counting immediately; reservations of expired/rejected sessions are released. Test in Task 20.
5. **Phone reality.** 360 px, iOS Safari: the name prompt then the file picker opens (the picker must be triggered inside the «Продовжити»/«Пропустити» tap), 100+ files picked, the tab goes offline mid-batch and comes back, the dock respects the safe area, nothing scrolls horizontally with a 100-char title and a 5000-char text. Expected: queued frames stay «У черзі» while offline, resume online, failed ones offer «Повторити», `beforeunload` warns while uploading. Tests in Tasks 11, 24, 25.

---

## Stage 0 — Spikes (run first, in parallel; throwaway branches `spike/s7-pgboss`, `spike/s9-uploader`, `spike/s5-heic`)

Each spike ends with a dated "Spike S# result" addendum written into the ADR named below (committed in PR A's Task 13 or, for S5, PR D's Task 28 if it finishes later). Spike code is not merged.

### Task 1: Spike S7 — pg-boss transactional enqueue with Prisma

**Question:** can the API enqueue a pg-boss job inside a Prisma interactive transaction, so the job exists if and only if the transaction commits?

- [ ] **Step 1:** Check pg-boss's current major on npm (licence MIT, release activity, Node 24 / PostgreSQL 18 support, ESM). Record version and date.
- [ ] **Step 2:** In a scratch script against the local `stepler_test` database: start `PgBoss` (`schema: 'pgboss'`), `createQueue('spike')`; inside `prisma.$transaction(async (tx) => …)` call `boss.send('spike', data, { db: { executeSql: (text, values) => tx.$queryRawUnsafe(text, ...values).then((rows) => ({ rows })) } })`.
- [ ] **Step 3: Pass criteria (all must hold):**
  - commit → the job is fetched by a worker within 2 s;
  - throw after `send` → rollback → no job row in `pgboss.job`;
  - two API processes starting `PgBoss` at once (schema migration) do not fail (advisory lock);
  - `send` to a queue created by another process works without `createQueue` in the sender (or record that the sender must `createQueue` idempotently at boot);
  - `singletonKey` dedupes two sends of `content.purge` for the same id.
- [ ] **Step 4: Fallback if any fails:** an outbox table `JobOutbox (id, name, data jsonb, singletonKey?, createdAt)` written in the transaction; the worker polls it every 2 s (`FOR UPDATE SKIP LOCKED`), sends to pg-boss and deletes the row. Record the chosen path; Task 14 implements whichever won.
- [ ] **Step 5:** Write "Spike S7 result (2026-10-..)" into `docs/architecture/decisions/0009-background-processing.md`: version, criteria results, chosen path, pool sizes (API sender `max: 2`, worker `max: 5`) and the staging DB connection budget.

### Task 2: Spike S9 — headless Uppy vs in-house uploader

**Question:** which client implements single PUT + multipart with on-demand part URLs, 3 concurrent files, per-file/part retry and cancel at the lowest cost?

- [ ] **Step 1:** Prototype both in a scratch Next page against the local API stub (presigned URLs from the S3 emulator):
  - (a) `@uppy/core` + `@uppy/aws-s3` (current major) with `shouldUseMultipart: (f) => f.size > threshold`, `getUploadParameters`, `createMultipartUpload`, `signPart` (calls our parts endpoint, batching), `completeMultipartUpload` (calls our complete, ignores client ETags), `abortMultipartUpload`;
  - (b) in-house: `XMLHttpRequest` PUT (upload progress events), a part scheduler (≤ 3 parts in flight per file), exponential backoff, `AbortController`/`xhr.abort()`.
- [ ] **Step 2: Measure:** gzip size added to the `/g/[token]` route (`next build` output), progress granularity on a 300 MB file with Chrome throttling "Fast 4G", recovery when the network drops for 10 s mid-part, cancel releasing all requests, behaviour on iOS Safari (Playwright `mobile-safari`) for a 120 MB file.
- [ ] **Step 3: Pass criteria for Uppy:** ≤ 30 KB gzip added; part URLs requested on demand (not all up front); our completion endpoint is the only completion; no Uppy UI/Companion package; licence MIT; a release in the last 6 months. Otherwise in-house.
- [ ] **Step 4:** Record "Spike S9 result" in `docs/architecture/decisions/0008-upload-and-storage-lifecycle.md` with the numbers and the choice [C11]. Task 23 implements `UploadTransport` with the winner.

### Task 3: Spike S5 — HEIC decoding and video posters in the worker image

**Question:** can a `node:24-slim`-based image decode iPhone HEIC (HEVC) to a WebP preview and extract a poster from a 2 GB MOV through a presigned URL, within 512 MB RAM?

- [ ] **Step 1:** Collect fixtures we may commit: generate a small HEIC with `heif-enc` from a generated PNG (and, for the local test only, one real iPhone HEIC from the owner — not committed), a 1-s MP4 and MOV from `ffmpeg -f lavfi -i testsrc`.
- [ ] **Step 2:** Try, in order: (a) `apt-get install libheif-examples libheif-plugin-libde265` → `heif-dec in.heic out.png` (or `heif-convert`), then sharp; (b) `heic-decode` (WASM) → raw RGBA → `sharp(raw, { raw: { width, height, channels: 4 } })`; (c) sharp's prebuilt libvips directly (expected to fail for HEVC).
- [ ] **Step 3:** Video: `ffmpeg -ss 1 -i "<presigned URL>" -frames:v 1 -vf scale=1600:-2 -f image2pipe -c:v png -` and `ffprobe -show_entries format=duration` on a 2 GB file in SeaweedFS (generated with `testsrc`, not committed), measuring peak RSS and bytes read (range requests only).
- [ ] **Step 4: Pass criteria:** HEIC 12 MP → 1600 px WebP in < 5 s and peak RSS < 400 MB; poster from a 2 GB MOV with `moov` at the end in < 15 s and < 200 MB RSS; image size increase recorded; licences recorded (libheif LGPL-3.0, libde265 LGPL-3.0, ffmpeg LGPL/GPL build flags of Debian's package). Flag to the owner: HEVC decoding has patent-licensing questions for commercial use — legal review, not engineering.
- [ ] **Step 5:** Record "Spike S5 result" in `docs/architecture/decisions/0009-background-processing.md` with the chosen decoder [C12] and the Dockerfile lines Task 27 uses.

---

## PR A — Guest session, guest page, names, texts, admin content (texts)

### Task 4: CI e2e sharding and test tags [C14]

**Files:**
- Modify: `.github/workflows/ci.yml` (`e2e` job: `strategy: { fail-fast: false, matrix: { shard: [1, 2] } }`, `run: pnpm e2e -- --shard=${{ matrix.shard }}/2`, artifact name `playwright-report-${{ matrix.shard }}`, cache key includes the shard);
- Modify: `e2e/playwright.config.ts` (mobile projects: `grepInvert: /@desktop/`);
- Modify: `docs/development/README.md` (`pnpm e2e -- --shard=1/2` row; the `@desktop` tag rule).

- [ ] **Step 1:** Verify `turbo run e2e -- --shard=1/2` forwards the flag to `playwright test` (dry run `--list` shows half the tests).
- [ ] **Step 2:** Apply the changes; push the branch; both shards green; record each shard's duration in the PR body (target ≤ 15 min each, the 35-min timeout unchanged).
- [ ] **Step 3:** Commit `ci(e2e): run Playwright in two shards; @desktop tag for admin-only journeys`.

### Task 5: Contracts — guest session, content, texts, errors

**Files:**
- Create: `packages/contracts/src/content.ts`, `content.test.ts`, `packages/contracts/src/guest.ts`, `guest.test.ts`
- Modify: `guest-links.ts` (resolve response gains `collectionId: z.uuid()`), `collections.ts` (`contentCount: z.number().int().min(0)`, `lastContentAt: z.iso.datetime().nullable()`), `errors.ts`, `index.ts`, `apps/web/messages/{uk,en}.json` (`errors.*`)

**Interfaces — produces:**
- `contentKindSchema = z.enum(['PHOTO','VIDEO','DOCUMENT','TEXT'])`, `processingStatusSchema = z.enum(['NOT_REQUIRED','PENDING','READY','FAILED'])`.
- `TEXT_MAX_CHARS = 5000`, `GUEST_NAME_MAX_CHARS = 80`; `codePointLength(s: string): number` (`[...s].length`, matches PostgreSQL `char_length`).
- `textBodySchema`: string, trimmed of leading/trailing whitespace, 1…5000 code points, `NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS`.
- `guestNameSchema`: trimmed, 1…80 code points, `NO_CONTROL_CHARACTERS`.
- `adminContentItemSchema` (strict): `id`, `frameNo: int ≥ 1`, `kind`, `createdAt`, `contributorName: string|null`, `originalFilename: string|null`, `mimeType: string|null`, `sizeBytes: int|null`, `width|height|durationMs: int|null`, `processingStatus`, `text: string|null`, `thumbnailUrl|previewUrl|posterUrl: z.url()|null`.
- `adminContentDetailSchema = adminContentItemSchema.extend({ originalUrl: z.url().nullable(), downloadUrl: z.url().nullable() })`.
- `guestContentItemSchema` (strict): `id`, `kind`, `createdAt`, `isOwn: boolean`, `frameNo: int|null` (refine: `null` unless `isOwn`), `canDelete: boolean`, `originalFilename`, `sizeBytes`, `width`, `height`, `durationMs`, `processingStatus`, `text`, `thumbnailUrl`, `previewUrl`, `posterUrl`; `guestContentDetailSchema` adds `originalUrl`, `downloadUrl`.
- `contentPageSchema<T>(item: T)` → `{ items: T[], nextCursor: string|null }`; `adminContentListQuerySchema = { kind?: contentKind, cursor?: string, limit?: 1…100 (default 48) }`; `guestContentListQuerySchema = { scope: 'own'|'all', cursor?, limit? }`.
- `contentCountsSchema = { total, photo, video, document, text: int ≥ 0, lastAddedAt: iso|null }`.
- `bulkDeleteContentRequestSchema = { ids: z.array(z.uuid()).min(1).max(100) }` refined unique; `bulkDeleteContentResponseSchema = { deletedIds: uuid[], notFoundIds: uuid[] }`.
- `guestSessionRequestSchema = { linkToken: string 1…200 }`; `guestContextSchema` (strict): `collection: { id, title, description }`, `permissions: guestLinkPermissionsSchema`, `guest: { name: string|null, nameAnswered: boolean }`, `limits: { maxFileBytes: { photo, video, document }, filesPerBatch, textMaxChars }`, `counts: { total, lastAddedAt } | null` (null without `canViewGallery`, DESIGN-SYSTEM §11.3).
- `updateGuestSessionRequestSchema = { name: guestNameSchema.nullable() }` (null = skip / clear).
- `createTextRequestSchema = { body: textBodySchema }`; `idempotencyKeyHeaderSchema = z.uuid()`.
- `ERROR_CODES` appended: `GUEST_SESSION_REQUIRED`, `QUOTA_EXCEEDED`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `UPLOAD_SIZE_MISMATCH`, `UPLOAD_INCOMPLETE`, `UPLOAD_EXPIRED`, `UPLOAD_CLOSED`, `IDEMPOTENCY_CONFLICT` (all used by PR C too; added once here).

- [ ] **Step 1: Failing tests:**
  - `textBodySchema`: `'  привіт \n'` → `'привіт'`; 5000 emoji (`'😀'.repeat(5000)`, 10 000 UTF-16 units) passes, 5001 fails; `'a\u0000b'` fails; `'a\nb\tc'` passes; `''` and `'   '` fail.
  - `guestNameSchema`: 80 code points pass, 81 fail, `'Ірина\n'` → `'Ірина'`, `'Ір\u0007ина'` fails.
  - `guestContentItemSchema`: `{ isOwn: false, frameNo: 12 }` fails; an extra `contributorName` key fails.
  - `bulkDeleteContentRequestSchema`: duplicate ids fail; 101 ids fail.
  - `guestContextSchema` rejects an extra `guestSessionId`.
  - `resolveGuestLinkResponseSchema` now requires `collectionId`.
- [ ] **Step 2:** `pnpm --filter @stepler/contracts test` → FAIL.
- [ ] **Step 3:** Implement; uk/en messages for the nine codes (uk: `GUEST_SESSION_REQUIRED` «Сесію гостя втрачено. Відкрийте посилання ще раз.», `QUOTA_EXCEEDED` «Колекція заповнена — нові кадри не додаються.», `FILE_TYPE_NOT_ALLOWED` «Такий тип файлу не підтримується.», `FILE_TOO_LARGE` «Файл завеликий.», `UPLOAD_SIZE_MISMATCH` «Файл завантажився не повністю.», `UPLOAD_INCOMPLETE` «Завантаження не завершилося. Спробуйте ще раз.», `UPLOAD_EXPIRED` «Час на завантаження минув. Додайте файл ще раз.», `UPLOAD_CLOSED` «Це завантаження вже завершене або скасоване.», `IDEMPOTENCY_CONFLICT` «Повторний запит не збігається з першим.»; en equivalents).
- [ ] **Step 4:** `pnpm --filter @stepler/contracts test && pnpm --filter @stepler/web test` → PASS (catalog parity).
- [ ] **Step 5:** Commit `feat(contracts): guest session, content and text schemas`.

### Task 6: Data model — GuestSession, ContentItem, frame numbers

**Files:**
- Modify: `apps/api/prisma/schema.prisma`; Create: `apps/api/prisma/migrations/<ts>_guest_sessions_content/migration.sql` (`--create-only --name guest_sessions_content` + raw SQL)
- Modify: `apps/api/test/database.e2e.spec.ts`, `apps/api/test/support/database.ts` (`MODEL_TABLES` gains the new tables)

**Schema (Prisma-level):**
- `enum ContentKind { PHOTO VIDEO DOCUMENT TEXT }`, `enum ProcessingStatus { NOT_REQUIRED PENDING READY FAILED }`.
- `Collection.nextFrameNo Int @default(1)`; back-relations `guestSessions`, `contentItems`.
- `GuestSession { id uuidv7, collectionId → Collection (Cascade), currentLinkId → GuestLink (Restrict), tokenHash @unique, contributorName String?, nameAnsweredAt Timestamptz?, createdAt, lastSeenAt; @@index([collectionId]) }`.
- `ContentItem { id uuidv7, collectionId → Collection (Cascade), frameNo Int, kind ContentKind, contributorGuestSessionId? → GuestSession (SetNull), contributorName String?, originalFilename String?, textBody String?, idempotencyKey String? @db.Uuid, processingStatus ProcessingStatus, deletedAt Timestamptz?, createdAt; @@unique([collectionId, frameNo]); @@unique([contributorGuestSessionId, idempotencyKey]) }`.

**Raw SQL (named):**
- `ContentItem_text_consistent` CHECK `((kind = 'TEXT') = ("textBody" IS NOT NULL))`;
- `ContentItem_text_length` CHECK `("textBody" IS NULL OR char_length("textBody") BETWEEN 1 AND 5000)`;
- `ContentItem_name_length` CHECK `("contributorName" IS NULL OR char_length("contributorName") BETWEEN 1 AND 80)`; same for `GuestSession_name_length`;
- `ContentItem_frame_positive` CHECK `("frameNo" > 0)`; `Collection_next_frame_positive` CHECK `("nextFrameNo" > 0)`;
- `ContentItem_processing_by_kind` CHECK `(kind IN ('TEXT','DOCUMENT')) = ("processingStatus" = 'NOT_REQUIRED')`;
- `ContentItem_feed_idx` ON (`"collectionId"`, `"createdAt" DESC`, `id DESC`) WHERE `"deletedAt" IS NULL`;
- `ContentItem_feed_kind_idx` ON (`"collectionId"`, kind, `"createdAt" DESC`, `id DESC`) WHERE `"deletedAt" IS NULL`;
- `ContentItem_own_idx` ON (`"contributorGuestSessionId"`, `"createdAt" DESC`, `id DESC`) WHERE `"deletedAt" IS NULL`;
- `ContentItem_deleted_idx` ON (`"deletedAt"`) WHERE `"deletedAt" IS NOT NULL` (purge sweep).

- [ ] **Step 1: Failing tests** (`database.e2e.spec.ts`): each named CHECK violated by one insert and reported by `constraintViolation()`; two items with the same `(collectionId, frameNo)` → unique violation; a TEXT with `"textBody"` of 5001 code points → `ContentItem_text_length`; deleting a GuestSession row sets `contributorGuestSessionId` to NULL and keeps the item; deleting a Collection cascades to sessions and items; deleting a GuestLink referenced by a session is refused (Restrict).
- [ ] **Step 2:** FAIL → edit schema, `prisma migrate dev --create-only --name guest_sessions_content`, append SQL, `pnpm db:migrate`.
- [ ] **Step 3:** PASS; `pnpm db:check` exits 0.
- [ ] **Step 4:** Commit `feat(api): guest session and content item schema with frame numbers`.

### Task 7: Guest session exchange, cookie and guard [C3]

**Files:**
- Create: `apps/api/src/guest-access/guest-sessions.service.ts`, `guest-session-cookie.ts`, `guest-session.guard.ts`, `current-guest.decorator.ts`, `guest-sessions.controller.ts`, `guest-policy.ts`, `guest-policy.spec.ts`
- Modify: `auth/principal.ts` (add `GuestPrincipal`), `auth/rate-limit.ts` (`'guest-session-create'`), `guest-link-resolver.ts` (export `assertLinkUsable(link, collection)` so the guard reuses the [G5] precedence), `guest.controller.ts` (resolve returns `collectionId`), `guest-access.module.ts`, `limits/limits.service.ts` (`guestSessionCreatePerIpPerMinute()`), `config/env.ts`, `audit/audit.service.ts` (`ACTOR_TYPES.guest = 'GUEST'`, `actorId = guestSessionId`), `logging/redact.spec.ts`, `openapi.json`
- Create: `apps/api/test/guest-sessions.e2e.spec.ts`

**Interfaces — produces:**
- `GuestPrincipal = { kind: 'guest'; guestSessionId: string; collectionId: string; link: { id: string; permissions: GuestLinkPermissions } }`; `Principal` becomes `AdminPrincipal | OperatorPrincipal | GuestPrincipal` — admin services keep taking the narrowed `AdminPrincipal | OperatorPrincipal` type (`AccountPrincipal`), so a guest principal cannot reach them by type.
- `GUEST_SESSION_COOKIE = 'st_gs'`; `guestCookiePath(collectionId) = '/api/v1/guest/collections/' + collectionId`; `setGuestSessionCookie(res, token, collectionId, env)` (`Max-Age` 400 days, `HttpOnly; SameSite=Lax; Path=…; Secure` per `COOKIE_SECURE`).
- `GuestSessionsService.exchange(collectionId: string, linkToken: string, cookieToken: string | undefined): Promise<{ context: GuestContext; newToken: string | null }>`:
  1. `resolver.resolveActive(linkToken)`; its collection id ≠ `collectionId` → `404 NOT_FOUND`;
  2. a valid cookie for a session of this collection → `UPDATE … SET currentLinkId, lastSeenAt` (re-bind, F5), `newToken: null` (the cookie is re-set with the same value to renew `Max-Age` — the controller re-sets it from the request);
  3. otherwise insert a session (`generateToken`/`hashToken`), `newToken` = raw token.
- `GuestSessionsService.authenticate(collectionId: string, cookieToken: string | undefined): Promise<GuestPrincipal>`: no/unknown cookie or a session of another collection → `401 GUEST_SESSION_REQUIRED`; then `assertLinkUsable` on the session's current link (state codes [G5]); touches `lastSeenAt` only if older than 1 h.
- `GuestSessionGuard` reads `:collectionId` from the route params and the cookie, sets `req.principal`; `@CurrentGuest()` returns `GuestPrincipal`.
- `guest-policy.ts` (pure): `canUploadKind(p: GuestPrincipal, kind: 'PHOTO'|'VIDEO'|'DOCUMENT'): boolean`, `canSubmitText(p)`, `canListAll(p)`, `canSeeItem(p, item: { contributorGuestSessionId: string|null })`, `canDeleteItem(p, item)`.
- Routes: `POST /api/v1/guest/collections/:collectionId/session` (`@Public`, rate limit `guest-session-create`) → `200 GuestContext` + `Set-Cookie`; `GET /api/v1/guest/collections/:collectionId/context` (guard) → `200 GuestContext`.

- [ ] **Step 1: Failing tests:**
  - `guest-policy.spec.ts`: table over the six permissions × own/foreign item for each function (e.g. `canDeleteItem` true only for own item with `canDeleteOwn`; `canSeeItem` true for a foreign item only with `canViewGallery`).
  - `guest-sessions.e2e.spec.ts`:
    - exchange without cookie → `200`, `Set-Cookie` contains `st_gs=`, `Path=/api/v1/guest/collections/{cid}`, `HttpOnly`, `SameSite=Lax`, `Max-Age=34560000`; one `GuestSession` row whose `tokenHash` is the hash of the cookie value;
    - exchange again **with** that cookie through link B of the same collection → same session id, `currentLinkId` = B, response permissions = B's (F5: permissions narrow with the new link);
    - exchange with a link of collection Y on path X → `404`, no row, no cookie;
    - `GET …/context` without cookie → `401 GUEST_SESSION_REQUIRED`; with collection Y's cookie on X's path → `401`;
    - pause the link → `GET …/context` → `403 LINK_INACTIVE`; revoke → `410 LINK_REVOKED`; archive → `403 COLLECTION_ARCHIVED`; delete collection → `410 COLLECTION_UNAVAILABLE`; owner `BLOCKED` → `410`; each on the very next request (no caching);
    - rate limit: `LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE=2` → third exchange `429 RATE_LIMITED` with `Retry-After`;
    - the resolve response includes `collectionId`;
    - redaction: captured logs of an exchange contain neither the link token nor the cookie value.
- [ ] **Step 2:** FAIL → implement; register; `pnpm openapi:write`.
- [ ] **Step 3:** `pnpm --filter @stepler/api test && pnpm --filter @stepler/api lint typecheck` → PASS.
- [ ] **Step 4:** Commit `feat(api): guest sessions with per-collection cookie and guard`.

### Task 8: Guest name and text submission

**Files:**
- Create: `apps/api/src/content/content.module.ts`, `frame-numbers.ts`, `texts.service.ts`, `guest-content.controller.ts` (texts route here; lists in Task 9), `content-dto.ts`
- Modify: `guest-access/guest-sessions.service.ts` (`updateName`), `guest-sessions.controller.ts` (`PATCH …/session`), `limits/limits.service.ts` (`forGuestSession()`), `config/env.ts`, `app.module.ts`, `openapi.json`
- Create: `apps/api/test/guest-texts.e2e.spec.ts`

**Interfaces — produces:**
- `FrameNumbers.next(tx: Prisma.TransactionClient, collectionId: string): Promise<number>` — the [C8] statement; zero rows → `COLLECTION_UNAVAILABLE`/`COLLECTION_ARCHIVED` via a follow-up status read. Lock order comment [C9].
- `GuestSessionsService.updateName(p: GuestPrincipal, name: string | null): Promise<GuestContext>` — sets `contributorName` and `nameAnsweredAt = now()`; **[C4]** in the same transaction `UPDATE "ContentItem" SET "contributorName" = $name WHERE "contributorGuestSessionId" = $sid AND "deletedAt" IS NULL`. Route `PATCH /guest/collections/:cid/session` → `200 GuestContext`. Requires `canContribute`, else `403 FORBIDDEN`.
- `LimitsService.forGuestSession(): { textsPerHour: number; uploadInitiationsPerHour: number; concurrentUploads: number }`.
- `TextsService.create(p: GuestPrincipal, body: string, idempotencyKey: string): Promise<GuestContentItem>`:
  - `canSubmitText` else `403 FORBIDDEN`;
  - existing `(sessionId, idempotencyKey)` → return it (`200`, same body); same key with a different body → `409 IDEMPOTENCY_CONFLICT`;
  - count of this session's TEXT items in the last hour ≥ limit → `429 RATE_LIMITED`;
  - transaction: `FrameNumbers.next`, insert TEXT with `processingStatus NOT_REQUIRED`, `contributorName` from the session;
  - route `POST /guest/collections/:cid/texts` (header `Idempotency-Key` required, else `400 VALIDATION_FAILED`) → `201 GuestContentItem` (`isOwn: true`, `frameNo` set).
- `toGuestContentItem(row, p, urls?)` and `toAdminContentItem(row, urls?)` in `content-dto.ts` (URLs null until PR C).

- [ ] **Step 1: Failing tests** (`guest-texts.e2e.spec.ts`):
  - first text in a new collection → `201` with `frameNo: 1`; second → `2`; an admin delete of #2 then a third text → `3` (gaps kept);
  - **Review Focus 3:** `Promise.all` of two posts with the same `Idempotency-Key` → both `2xx` with the same `id`, one row; same key + different body → `409 IDEMPOTENCY_CONFLICT`;
  - `Promise.all` of 20 texts from two sessions → frame numbers exactly `1…20`, no duplicate, no gap;
  - `canSubmitText: false` → `403 FORBIDDEN`; 5001 code points → `400 VALIDATION_FAILED`; limit 2 per hour → third `429`;
  - name: `PATCH {name:'Ірина'}` → context `guest.name = 'Ірина'`, `nameAnswered: true`; then a text → its row has `contributorName = 'Ірина'`; `PATCH {name:'Ірина К.'}` → that earlier row now reads `'Ірина К.'` [C4]; `PATCH {name:null}` → `nameAnswered: true`, `name: null`;
  - the guest response for the text contains no `contributorName` key;
  - logs of the whole test contain neither the text body nor the name.
- [ ] **Step 2:** FAIL → implement → PASS; `pnpm openapi:write`.
- [ ] **Step 3:** Commit `feat(api): guest names and text submission with frame numbers`.

### Task 9: Content read and delete APIs (admin and guest)

**Files:**
- Create: `apps/api/src/content/content-queries.ts`, `admin-content.service.ts`, `admin-content.controller.ts`, `guest-content.service.ts`
- Modify: `guest-content.controller.ts`, `collections/collections.service.ts` + `collection-dto.ts` (`contentCount`, `lastContentAt` with one grouped query per page — no N+1), `audit/audit.service.ts` (`'content.delete'`, `targetType: 'content'`), `openapi.json`
- Create: `apps/api/test/content-admin.e2e.spec.ts`, `apps/api/test/content-guest.e2e.spec.ts`

**Interfaces — produces:**
- `ContentQueries.page(where: Prisma.ContentItemWhereInput, cursor: string|undefined, limit: number): Promise<{ rows: ContentRow[]; nextCursor: string|null }>` — order `createdAt DESC, id DESC` [C5], `encodeCursor`/`decodeCursor` from `common/cursor.ts`; always adds `deletedAt: null`.
- `ContentQueries.counts(collectionId: string): Promise<ContentCounts>` — one `GROUP BY kind` + `max(createdAt)`.
- `AdminContentService`: `list(a: AccountPrincipal, collectionId, query)`, `counts(a, collectionId)`, `get(a, id): Promise<AdminContentDetail>`, `delete(a, id, requestId)`, `bulkDelete(a, collectionId, ids, requestId)` (bulk lands in Task 31; its route is added there). `delete` sets `deletedAt` + audit in one transaction (enqueue of `content.purge` is added in Task 15), already deleted → `204`.
- `GuestContentService`: `list(p, query)` — `scope=own` → `contributorGuestSessionId = p.guestSessionId`; `scope=all` → `canListAll(p)` else `403 FORBIDDEN`; `get(p, id)` → `canSeeItem` else `404`; (`delete` arrives in Task 30).
- Routes: `GET /collections/:id/content`, `GET /collections/:id/content/counts`, `GET /content/:id`, `DELETE /content/:id` (admin); `GET /guest/collections/:cid/content`, `GET /guest/collections/:cid/content/:id` (guest). Admin list/detail send `Cache-Control: no-store` (URLs later).

- [ ] **Step 1: Failing tests:**
  - admin: list paginates 60 texts as 48 + 12 with a stable cursor; `?kind=TEXT` filters; counts `{ total: 60, text: 60, … }`; delete → `204`, item gone from list and counts at once, audit `content.delete` with `{ kind: 'TEXT', frameNo }` and no body; delete again → `204`, one audit row;
  - **Review Focus 1 (admin part):** admin B and a non-owner operator on A's collection list/counts/get/delete → `404`, A's item untouched; A on a `DELETING` collection → `404`;
  - guest: `scope=own` returns only this session's items with `frameNo`; `scope=all` without `canViewGallery` → `403`; with it → all items, foreign ones with `frameNo: null`, `isOwn: false`, and no response body anywhere contains another guest's name;
  - **Review Focus 1 (guest part):** guest without `canViewGallery` `GET`s a foreign item id → `404`; guest of collection Y with Y's cookie on X's item path → `401`;
  - collections: `GET /collections` shows `contentCount: 3`, `lastContentAt` = newest item; deleted items excluded; query count for a page of 20 collections is constant (assert with a Prisma query counter).
- [ ] **Step 2:** FAIL → implement → PASS; `pnpm openapi:write`.
- [ ] **Step 3:** Commit `feat(api): admin and guest content lists, counts and admin delete`.

**Checkpoint (API review, after Task 9):** one independent review of Tasks 6–9 focused on Review Focus 1 and 3, the cookie path, and the lock order.

### Task 10: Frame components (packages/ui)

**Files:**
- Create: `packages/ui/src/components/frame.tsx` (+ `FrameLabel`), `frame.stories.tsx`, `frame-grid.tsx`, `frame-grid.stories.tsx`, `frame-viewer.tsx`, `frame-viewer.stories.tsx`, `pencil-mark.tsx`, `pencil-mark.stories.tsx`
- Modify: `packages/ui/src/components/toggle-group.tsx` (FilterChips restyle per DESIGN-SYSTEM §5.7, with a mono count slot), its stories; `docs/ux/design-system.md` rows

**Interfaces — produces (props):**
- `Frame`: `kind: 'photo'|'video'|'document'|'text'|'pending-preview'|'empty'`, `media?: ReactNode` (an `<img>` the caller renders), `number?: number` (renders `#086`, absent for foreign guest frames), `time: string`, `meta?: string` (duration/size/type), `text?: string` (text kind, 5 lines clamp), `name?: string`, `docType?: string`, `docTitle?: string`, `isNew?: boolean`, `selected?: boolean`, `selectable?: boolean`, `accessibleName: string`, `onOpen?: () => void`, `onToggleSelect?: () => void`, `actions?: ReactNode`. Renders a `button` (`aria-pressed` when `selectable`) or a link-like button opening the viewer.
- `FrameGrid`: `children`, `ariaLabel`, `density?: 'default'|'dense'`; columns per DESIGN-SYSTEM §7.2 via container query (`--cols = clamp(3, floor((W+1)/(minFrame+1)), 12)`), 1px gap on `--border`.
- `FrameViewer`: `open`, `onOpenChange`, `title` (`#086 · 21:10 · Ірина`), `children` (media), `onPrev?`, `onNext?`, `actions?: ReactNode`, `details?: ReactNode`; Radix Dialog on `--viewer`, `←/→` call `onPrev/onNext`, `Esc` closes, swipe on touch (pointer events, 48 px threshold), 44 px buttons.
- `PencilMark`: `variant: 'circle'|'underline'|'cross'`, `seed: number` (shape variant), always `aria-hidden`.

- [ ] **Step 1: Design pass** (four skills) for frame, grid and viewer; header comments.
- [ ] **Step 2: Failing stories with play functions:** Frame — every kind, `selected`, `isNew`, a 5000-char text clamped, a 100-char unbroken filename; FrameGrid — 3 columns at 288 px, 8 at 944, 12 at 1680 (assert computed `--cols`); FrameViewer — opens, `ArrowRight` calls `onNext`, focus is trapped and returns to the opener on close, `Escape` closes; FilterChips — 44 px height under `pointer: coarse`. axe passes on all; reduced-motion story for `PencilMark` (drawn whole).
- [ ] **Step 3:** `pnpm --filter @stepler/ui test` → FAIL → implement → PASS.
- [ ] **Step 4:** Commit `feat(ui): Frame, FrameGrid, FrameViewer, PencilMark and FilterChips`.

### Task 11: Guest page — session, landing, name prompt, text composer (web)

**Files:**
- Create: `apps/web/src/guest/api.ts`, `use-guest-session.ts`, `guest-state.ts` (+ `guest-state.test.ts`), `guest-page.tsx`, `name-prompt.tsx`, `text-composer.tsx`, `own-frames.tsx`, `contribute-actions.ts` (+ test)
- Modify: `apps/web/src/app/g/[token]/page.tsx` (renders `GuestPage`), remove `guest-link-landing.tsx` (its state mapping moves into `guest-state.ts`), `apps/web/src/api/guest.ts`, `apps/web/messages/{uk,en}.json` (`guest.*`)

**Interfaces — produces:**
- `guest/api.ts`: `resolveLink(token)`, `exchangeSession(collectionId, token): Promise<GuestContext>` (`POST /guest/collections/{cid}/session`), `getContext(cid)`, `updateName(cid, name|null)`, `submitText(cid, body, idempotencyKey)`, `listGuestContent(cid, { scope, cursor })`. All via `apiRequest`, so paths stay under the cookie path.
- `useGuestSession(token): { status: 'loading' } | { status: 'ready'; context: GuestContext; collectionId: string } | { status: GuestPageState }` — resolve → exchange; any later call failing with `GUEST_SESSION_REQUIRED` re-runs the exchange once and retries; a [G5] code from any call switches the page to that state.
- `guestPageState(error: unknown): 'not-found'|'unavailable'|'revoked'|'archived'|'paused'|'quota-full'|'rate-limited'|'failed'` (extends slice 2's mapping with `QUOTA_EXCEEDED → quota-full`).
- `primaryContribution(p: GuestLinkPermissions): 'files'|'text'|null` and `acceptFor(p): string` (e.g. `image/*,.heic,.heif,video/mp4,video/quicktime,video/webm,.pdf,.docx,.xlsx,.pptx,.txt` filtered by permission) in `contribute-actions.ts`.
- `NamePrompt`: `open`, `defaultName`, `onDone(name: string|null)`; «Як вас звати?» (`Input`, max 80), «Продовжити», «Пропустити»; on phones a bottom `Sheet`, from 640 a `Dialog`. **The caller opens the file picker synchronously inside `onDone`'s click handler** (iOS requires a user gesture).
- `TextComposer`: bottom `Sheet` (max 560 centred), `Textarea` with a code-point counter shown from 4500, «Надіслати» pencil, `Idempotency-Key` generated once per draft (`crypto.randomUUID()`) and kept across retries.

**Behaviour** (DESIGN-SYSTEM §6.1, §6.3, §7.3; [O4]; [C16]):
- Header: wordmark, language switch. Title display 28/32, description.
- `canViewGallery`: «86 кадрів · останній о 21:10» (`counts`) and the shared grid (texts until PR C), times only, numbers only on own frames. Contribution-only: «Ваші кадри побачить лише організатор» and own frames. View-only: grid, no dock.
- Dock (< 640 fixed with safe area, 640–1023 sticky in the column, ≥ 1024 actions in the sticky left column): main pencil button «Додати фото» (disabled with the line «Скоро» until PR C — rule 18: no fake upload; hidden if no upload permission) and ghost «Написати побажання» (`canSubmitText`); text-only links make «Написати побажання» the pencil main action.
- First contribution with `nameAnswered: false` → `NamePrompt` first; «Ви: Ірина · Змінити» above own frames afterwards (opens the same prompt).
- Own frames section title «Ваші кадри, додані з цього пристрою» (DESIGN-SYSTEM §11.3: ownership is per browser).
- A text sent → toast «Побажання додано», the frame appears first in own frames with its `#00N`.

- [ ] **Step 1: Design pass**; header comment in `guest-page.tsx`.
- [ ] **Step 2: Failing unit tests:** `guestPageState` for every code; `primaryContribution` (text-only → `'text'`, view-only → `null`); `acceptFor` with only videos → no `image/*`; `useGuestSession` with a mocked fetch: a `401 GUEST_SESSION_REQUIRED` on `listGuestContent` triggers exactly one re-exchange then succeeds; a second `401` surfaces `failed`.
- [ ] **Step 3:** FAIL → implement → PASS; screenshots: live shared, contribution-only, view-only, text-only, name prompt, composer with 5000 chars, each at 360/390/1440, light and dark.
- [ ] **Step 4:** Commit `feat(web): guest page with session, name prompt and text wishes`.

### Task 12: Admin «Вміст» tab with text frames, viewer and delete (web)

**Files:**
- Create: `apps/web/src/api/content.ts`, `apps/web/src/app/app/collections/[id]/content/content-tab.tsx`, `content-viewer.tsx`, `content-filters.ts` (+ test), `use-new-content.ts`
- Modify: `collection-overview.tsx` (tab renders `ContentTab`; `TabsCount` = `counts.total`), `collection-card.tsx` (dashboard: «N кадрів · останній о 21:10» from `contentCount`/`lastContentAt`, replacing «Поки нічого не додано» when > 0), `apps/web/messages/{uk,en}.json` (`content.*`)

**Interfaces — produces:**
- `api/content.ts`: `listContent(collectionId, { kind?, cursor? })`, `contentCounts(collectionId)`, `getContent(id)`, `deleteContent(id)`; keys `contentKey(collectionId, kind)`, `contentCountsKey(collectionId)` under `collectionKey(id)`.
- `kindFromParam(value: string|null): ContentKind|undefined` (`?kind=text` etc.), `frameFromParam` (`?frame=86` opens the viewer on that frame number).
- `useNewContent(collectionId, shownTotal): { newCount: number; showNew: () => void }` — the [C6] counts poll (15 s, only while the tab is visible).

**Behaviour** (DESIGN-SYSTEM §6.6, [C5], [O3]):
- FilterChips «Усе · Фото · Відео · Документи · Тексти» with counts; empty filter → `EmptyState` «Тексти поки відсутні» style copy without frame number; empty collection keeps the existing tinted empty panel.
- Grid of `Frame`s (newest first), infinite «Показати ще» button (not scroll-triggered: accessible and testable), skeleton grid while loading, inline `Alert` + «Спробувати ще» on error.
- Viewer: `#086 · 21:10 · Ірина` (or «Без імені»), text 20 px, details (time with date, kind), «Видалити» → `ConfirmDialog` «Видалити кадр #086? Гості більше його не побачать. Номер не використовуватиметься знову.» → toast `info` «Кадр видалено»; keyboard `←/→` across the loaded list; URL `?frame=86`, Back closes.
- Archived collections: content visible, no change.

- [ ] **Step 1: Design pass**; header comment in `content-tab.tsx`.
- [ ] **Step 2: Failing unit tests** for `kindFromParam`, `frameFromParam`, and `useNewContent` (counts 10 → 13 gives `newCount: 3`; `showNew` resets the list query).
- [ ] **Step 3:** FAIL → implement → PASS; screenshots (grid, filter empty, viewer, delete confirm) at 360/1440, light/dark.
- [ ] **Step 4:** Commit `feat(web): collection content tab with frames, viewer and delete`.

### Task 13: Journeys, docs and PR A

**Files:**
- Create: `e2e/support/guest.ts` (`openGuestLink(browser, url): Promise<Page>` in a fresh context; `submitTextViaApi(page, cid, body)`), `e2e/tests/guest-text.spec.ts`, `e2e/tests/content-admin.spec.ts`
- Modify: `e2e/tests/guest-link-page.spec.ts` (states still pass through the new page)
- Docs: `docs/architecture/mvp-architecture-spec.md` (§7.2 `GuestSession` with name fields [C4]; §7.3 `ContentItem` as built + frame numbers; §9 resource map: resolve + session exchange [C3], counts, bulk-delete; §9.1 rewritten; §13.1 new limits; §15 data minimization amended), ADR 0007 "Implementation notes (slice 3)" (two-step exchange, cookie Max-Age, name on session), ADR 0009/0008 spike addenda from Tasks 1–2, `BOOTSTRAP.md` (slices 3–4 status, the production gate [C20]), `docs/product/mvp.md` (guest text, visibility setting), `docs/ux/design-system.md`, `DESIGN-SYSTEM.md` §12.1 (closed by [O4]) and §12.19 ([C5]), `README.md`/`docs/development/README.md` (new env vars).

- [ ] **Step 1: Failing journeys (all three projects unless tagged):**
  - Journey: guest opens the default link → «Написати побажання» → name prompt → «Пропустити» → sends «Вітаємо!» → own frame `#001`; admin's «Вміст» shows the text with «Без імені»; admin deletes it; guest reloads → own frames empty.
  - Name: a second guest enters «Ірина», sends text; admin viewer shows «Ірина»; a third guest with a shared-gallery link sees the text **without** «Ірина» and without `#002` (assert page text).
  - View-only link: no dock, sees texts. Contribution-only link: «Ваші кадри побачить лише організатор», does not see others' texts.
  - **Review Focus 2 (text variant):** guest page open, admin pauses the link, guest sends a text → page shows «Посилання призупинене», no frame created.
  - Cookie survives reload: after reload the guest still sees own frames (same session).
  - **Review Focus 5:** 360 and 390 widths with a 100-char title and a 5000-char text in the viewer: `horizontalOverflow(page) === 0`.
  - `@desktop`: admin keyboard path: `Tab` to a frame → `Enter` opens viewer → `ArrowRight` → `Escape` returns focus.
- [ ] **Step 2:** `pnpm e2e` → FAIL where missing → fix in the owning task's files → PASS on all projects.
- [ ] **Step 3:** Batched minors (one commit); docs above.
- [ ] **Step 4: Full verification:** `pnpm format:check && pnpm turbo run lint typecheck test build build-storybook && pnpm db:check && pnpm e2e`. Report results as they are.
- [ ] **Step 5:** Owner design review (screenshots from Tasks 11–12); feedback in one `fix(web): …after design review` commit.
- [ ] **Step 6:** Commit docs `docs: guest sessions, texts and content tab; spec §9.1 exchange`; open PR A → `dev` with decisions as answered, spike results, test evidence, shard timings.

---

## PR B — Worker, jobs and purges

### Task 14: Jobs port and pg-boss adapter (per S7)

**Files:**
- Create: `apps/api/src/jobs/job-names.ts`, `job-queue.ts`, `pg-boss-queue.ts`, `jobs.module.ts`, `apps/api/test/jobs.e2e.spec.ts`
- Modify: `apps/api/package.json` (pg-boss pinned to the S7 version), `app.module.ts`, `test/support/database.ts` (also clears `pgboss.job` when the schema exists), `config/env.ts` (nothing new unless S7 chose the outbox)

**Interfaces — produces:**
- `JobData` map: `'storage.discard-upload': { uploadSessionId: string }`, `'content.purge': { contentItemId: string }`, `'collection.purge': { collectionId: string }`, `'uploads.expire': Record<string, never>`, `'maintenance.sweep': Record<string, never>`, `'media.image-derivatives': { contentItemId: string }`, `'media.video-poster': { contentItemId: string }`; `JobName = keyof JobData`; every payload may carry `requestId?: string`.
- `JOB_QUEUE` token; `interface JobQueue { enqueue<N extends JobName>(tx: Prisma.TransactionClient, name: N, data: JobData[N], options?: { singletonKey?: string; startAfterSeconds?: number }): Promise<void> }`.
- `JOB_OPTIONS: Record<JobName, { retryLimit: number; retryDelay: number; retryBackoff: true; expireInSeconds: number }>` (media: 5 retries; purges: 10; expire/sweep: 2).
- `PgBossQueue` implements it with the S7 `db` adapter (or `OutboxQueue` inserting `JobOutbox` rows if S7 failed). The API process starts pg-boss with `supervise: false, schedule: false` (sender only) and creates queues idempotently at boot.

- [ ] **Step 1: Failing tests:** enqueue inside a transaction that then throws → no job; inside a committed one → one job with the payload; two enqueues of `content.purge` with the same `singletonKey` → one job; `JOB_OPTIONS` covers every `JobName` (type-level `satisfies` plus a runtime keys check).
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Commit `feat(api): job queue port with transactional pg-boss enqueue`.

### Task 15: Worker entrypoint, handlers for discard, purge, sweep

**Files:**
- Create: `apps/api/src/worker/main.ts`, `worker.module.ts`, `worker-env.ts` (+ `worker-env.spec.ts`), `job-runner.ts`, `handlers/purge-content.handler.ts`, `handlers/purge-collection.handler.ts`, `handlers/maintenance-sweep.handler.ts`, `apps/api/tsconfig.build-worker.json` (`outDir: dist-worker`)
- Modify: `database/prisma.service.ts` and `storage/s3-object-storage.ts` (constructor types narrowed to `Pick<ApiEnv, …>` so the worker can provide `API_ENV` from `WorkerEnv`), `storage/object-storage.ts` (`listKeys(prefix, token?)`, `deleteMany(keys)` ≤ 1000, `abortMultipart(key, uploadId)` idempotent), `collections/collections.service.ts` (`delete` enqueues `collection.purge`), `content/admin-content.service.ts` (`delete` enqueues `content.purge`), `apps/api/package.json` (`worker:dev`, `build:worker` scripts), root `package.json` (`"worker:dev": "pnpm --filter @stepler/api worker:dev"`), `turbo.json`
- Create: `apps/api/test/worker-handlers.e2e.spec.ts`

**Interfaces — produces:**
- `loadWorkerEnv(source): WorkerEnv` — `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`, `S3_*`, `WORKER_MEDIA_CONCURRENCY` (default 1), `WORKER_PURGE_BATCH_SIZE` (default 500); no SMTP/Turnstile/APP_SECRET.
- `JobRunner` (on module init): `boss.start()`, `createQueue` for every `JobName`, `work(name, { batchSize: 1, localConcurrency }, handler)`, `schedule('uploads.expire', '*/15 * * * *')`, `schedule('maintenance.sweep', '7 * * * *')`; logs `worker started`; on `SIGTERM` → `boss.stop({ graceful: true, timeout: 30_000 })`. Each run logs `{ jobId, name, requestId }`, never payload text.
- Handlers, each `handle(data): Promise<void>`, idempotent (missing rows/objects = success):
  - (`DiscardUploadHandler` and `ExpireUploadsHandler` need the `UploadSession` table and arrive in Task 21; the `JobRunner` registers only handlers that exist.)
  - `PurgeContentHandler` — item must have `deletedAt`; deletes keys of its `MediaObject`s and the prefix `collections/{cid}/derived/{id}/`, then deletes the row (cascade). A not-deleted item → no-op (never purge visible content).
  - `PurgeCollectionHandler` — collection must be `DELETING`: (from Task 21: mark its `INITIATED` uploads `ABORTED` and abort their multipart uploads), delete `collections/{id}/` in batches of `WORKER_PURGE_BATCH_SIZE` (resumable: each run continues from what is left), then `DELETE FROM "Collection"` (cascades). Audit rows remain (no FK).
  - `MaintenanceSweepHandler` — re-enqueues `content.purge` for items deleted > 1 h ago and `collection.purge` for collections `DELETING` > 1 h ago (with `singletonKey`), covering lost jobs and slice-1 rows.
- `pnpm worker:dev` = `nest start --watch -p tsconfig.build-worker.json --entryFile worker/main --exec "node --env-file-if-exists=.env"` (own `dist-worker`, so it never touches the API's `dist`).

- [ ] **Step 1: Failing tests:** `worker-env.spec.ts` (missing `S3_BUCKET` named; SMTP not required); handlers against PostgreSQL + SeaweedFS:
  - purge content twice → second run succeeds, row gone after the first; with its objects already missing → success;
  - purge content on a non-deleted item → item and objects untouched;
  - purge collection with 7 objects and batch size 3 → after one interrupted run (throw after the first batch) a rerun finishes; collection, sessions, items gone; `AuditEvent` rows kept;
  - sweep enqueues one `collection.purge` for a slice-1 `DELETING` collection and none for an `ACTIVE` one;
  - admin `DELETE /content/:id` and `DELETE /collections/:id` each leave exactly one queued job.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Commit `feat(worker): worker entrypoint with purge, discard and sweep jobs`.

### Task 16: Worker image, Render service, e2e wiring

**Files:**
- Create: `apps/api/worker.Dockerfile` [C2] (same pruner/builder as `apps/api/Dockerfile`, `CMD ["node","dist/worker/main.js"]`, non-root; ffmpeg/HEIC arrive in Task 27), `docker/scripts/verify-images.sh` (builds and starts the worker image against compose services: it logs `worker started` within 30 s, runs as non-root, has no `.env`)
- Modify: `render.yaml` (new `type: worker`, `name: stepler-staging-worker`, `region: frankfurt`, `plan: 0.5c-512mb` (owner confirms, W1), `branch: stage`, `autoDeployTrigger: checksPass`, `dockerfilePath: ./apps/api/worker.Dockerfile`, `preDeployCommand: node_modules/.bin/prisma migrate deploy` (verify Render allows it on workers; otherwise rely on the API's), envVars `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL` fromDatabase, `S3_REGION: auto`, `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` `sync: false`), `e2e/playwright.config.ts` (third `webServer`: `node ../apps/api/dist-e2e/worker/main.js`, `wait: { stdout: /worker started/ }`, compose env), `.github/workflows/ci.yml` (`images` job builds the worker image)
- Docs: `docs/development/README.md` (worker row in Commands and in "Local links" notes: «`pnpm worker:dev` — without it deleted content is not purged and previews stay pending»), README env table (`WORKER_*`), ADR 0014 "Addendum: staging worker", ADR 0009 status → implemented (B).

- [ ] **Step 1:** `bash docker/scripts/verify-images.sh` → FAIL (no worker image) → implement → PASS.
- [ ] **Step 2:** `pnpm e2e` starts three servers; existing suites pass.
- [ ] **Step 3:** Commit `build(worker): worker image, staging Render service and e2e wiring`.

### Task 17: Verification and PR B

- [ ] **Step 1:** Batched minors; docs (spec §11 implemented items, §12 "purge job implemented"; BOOTSTRAP slice 6 partial).
- [ ] **Step 2: Full verification** (as Task 13 Step 4) plus `verify-images.sh`.
- [ ] **Step 3:** PR B → `dev`; body lists owner actions W1–W3 and the Render cost note. After merge, promote `dev → stage` once the owner has done W1–W2.

---

## PR C — Uploads, admin gallery for files, uploader

### Task 18: File rules and signature detection

**Files:**
- Create: `packages/contracts/src/uploads.ts`, `uploads.test.ts`; `apps/api/src/uploads/file-signature.ts`, `file-signature.spec.ts`; fixtures `apps/api/test/fixtures/media/` (generated by `apps/api/test/fixtures/media/generate.sh`, committed with the outputs: `photo.jpg`, `photo.png`, `photo.webp`, `anim.gif`, `photo.heic` (from S5), `clip.mp4`, `clip.mov`, `clip.webm`, `doc.pdf`, `doc.docx`, `sheet.xlsx`, `deck.pptx`, `notes.txt`, `fake.jpg` (PE `MZ` header), `archive.zip`, `image.svg`, `page.html`, `latin1.txt`)

**Interfaces — produces:**
- `FILE_TYPES: readonly { ext: string; mimes: readonly string[]; kind: 'PHOTO'|'VIDEO'|'DOCUMENT'; canonicalMime: string }[]` (D3 list; e.g. `.heic` → `image/heic` and `image/heif`; `.mov` → `video/quicktime`; `.txt` → `text/plain`).
- `fileTypeFor(filename: string, declaredMime: string): { kind; canonicalMime; ext } | null` — by lower-cased extension; declared MIME must be one of its `mimes` or empty/`application/octet-stream` (browsers often send nothing for HEIC).
- `createUploadRequestSchema = { clientUploadId: uuid, filename: 1…255 no control chars, mimeType: string ≤ 100, sizeBytes: int ≥ 1 }`; `uploadSessionResponseSchema` = discriminated union on `strategy`: `SINGLE { uploadId, strategy, url, headers: { 'content-type': string }, expiresAt }` | `MULTIPART { uploadId, strategy, partSizeBytes, partCount, expiresAt }`; `uploadPartsRequestSchema = { partNumbers: int 1…10000 [1…100] }`; `uploadPartsResponseSchema = { parts: { partNumber, url }[], expiresAt }`.
- `detectFileType(head: Uint8Array): { kind; mime } | null` — [C17] signatures; HEIC/HEIF `ftyp` brands `heic heix hevc hevx heim heis mif1 msf1`; MP4/MOV `ftyp` (`isom iso2 mp41 mp42 avc1 M4V qt  ` …); WebM `1A45DFA3`; GIF `GIF87a/89a`; WebP `RIFF….WEBP`; PDF `%PDF-`; OOXML rule; TXT rule.
- `matchesDeclared(detected, declared: { kind; canonicalMime }): boolean` — same kind, and for photos/videos a compatible MIME family (a `.mov` detected as MP4-family `ftyp` passes).

- [ ] **Step 1: Failing tests:** every fixture detected as expected; `fake.jpg` → `null`; `archive.zip`, `image.svg`, `page.html` → `null`; `latin1.txt` (invalid UTF-8) → `null`; a TXT whose 4 KB slice ends mid-character → TXT; `fileTypeFor('IMG_1.HEIC', '')` → PHOTO; `fileTypeFor('a.exe', 'image/jpeg')` → `null`; `fileTypeFor('a.jpg', 'video/mp4')` → `null`.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Commit `feat(uploads): allowed file types and content signature detection`.

### Task 19: Data model — UploadSession, MediaObject; storage port additions

**Files:**
- Modify: `schema.prisma`; Create migration `<ts>_uploads_media` (create-only + SQL); Modify: `storage/object-storage.ts`, `s3-object-storage.ts`; `test/database.e2e.spec.ts`; Create: `test/storage-multipart.e2e.spec.ts`

**Schema:**
- `enum UploadStatus { INITIATED COMPLETED ABORTED EXPIRED REJECTED }`, `enum UploadStrategy { SINGLE MULTIPART }`, `enum MediaRole { ORIGINAL THUMBNAIL PREVIEW POSTER }`.
- `UploadSession` as spec §7.3 (`guestLinkId → GuestLink Restrict`, `guestSessionId → GuestSession Cascade`, `contentItemId? @unique → ContentItem SetNull`, `declaredSizeBytes BigInt`, `partSizeBytes BigInt?`, `partCount Int?`, `kind ContentKind`, `rejectReason String?`), `@@unique([guestSessionId, clientUploadId])`, `@@index([status, expiresAt])`, `@@index([collectionId, status])`.
- `MediaObject` as spec §7.3, `sizeBytes BigInt`, `@@unique([contentItemId, role])`.
- SQL: `UploadSession_kind_is_file` CHECK (`kind <> 'TEXT'`); `UploadSession_multipart_consistent` CHECK (`(strategy = 'MULTIPART') = ("multipartUploadId" IS NOT NULL AND "partSizeBytes" IS NOT NULL AND "partCount" IS NOT NULL)`); `UploadSession_completed_consistent` CHECK (`(status = 'COMPLETED') = ("completedAt" IS NOT NULL)`; `contentItemId` is not part of it because a purge later sets it to NULL); `UploadSession_reject_reason` CHECK (`(status = 'REJECTED') = ("rejectReason" IS NOT NULL)`); `MediaObject_size_positive` CHECK; `UploadSession_active_idx` ON (`"guestSessionId"`) WHERE `status = 'INITIATED'`.

**Storage port additions** (`ObjectStorage`): `createMultipart(key, contentType): Promise<string>`, `presignPart(key, uploadId, partNumber, contentLength, expiresInSeconds): Promise<string>` (signs `content-length`), `listParts(key, uploadId): Promise<{ partNumber: number; etag: string; size: number }[]>` (pages through), `completeMultipart(key, uploadId, parts)`, `abortMultipart` (from Task 15), `readRange(key, start, endInclusive): Promise<Uint8Array>`, `putObject(key, body: Buffer | Readable, contentType, contentLength?)`; `PresignGetOptions.signingDate?: Date`.

- [ ] **Step 1: Failing tests:** CHECKs as in Task 6; storage on SeaweedFS: multipart with presigned parts 5 MiB + 5 MiB + 1 234 B → `listParts` returns 3 with sizes, complete → `head` size 10 487 994; a part PUT with a different body length than signed → 403; `readRange(key, 0, 3)` of `doc.pdf` → `%PDF`; `abortMultipart` twice → no throw; two `presignGet` with the same aligned `signingDate` → identical URLs.
- [ ] **Step 2:** FAIL → implement → PASS; `pnpm db:check`.
- [ ] **Step 3:** Commit `feat(api): upload session and media object schema; multipart storage port`.

### Task 20: Storage usage and quotas

**Files:**
- Modify: `limits/usage.service.ts`, `limits/limits.service.ts` (`forCollection` gains `fileBytes: Record<'PHOTO'|'VIDEO'|'DOCUMENT', bigint>`, `filesPerBatch`), `config/env.ts`, `users/me.controller.ts`, `packages/contracts/src/usage.ts` (`storage: { usedBytes, limitBytes }`), `collections` single `GET` (`storage: { usedBytes, limitBytes }` on the detail DTO only)
- Create: `apps/api/test/quotas.e2e.spec.ts`

**Interfaces — produces:**
- `UsageService.collectionStorageBytes(tx, collectionId): Promise<bigint>` and `accountStorageBytes(tx, userId): Promise<bigint>` — sum of `MediaObject.sizeBytes` of items with `deletedAt IS NULL` (account: collections not `DELETING`) **plus** `declaredSizeBytes` of `INITIATED` upload sessions (spec §13.2, ADR 0010).
- `UsageService.assertCanReserve(tx, { userId, collectionId, bytes }): Promise<void>` — must run after `lockOwner`; throws `409 QUOTA_EXCEEDED`.

- [ ] **Step 1: Failing tests** (service level, rows inserted directly; the HTTP race test is in Task 21):
  - `collectionStorageBytes` = originals + derivatives of non-deleted items + `INITIATED` reservations; `EXPIRED`/`REJECTED`/`ABORTED` sessions and deleted items do not count; account usage excludes `DELETING` collections;
  - **Review Focus 4 (service part):** two transactions each `lockOwner` → `assertCanReserve(6 MB)` → insert a reservation, run with `Promise.all` against a 10 MB limit → exactly one throws `QUOTA_EXCEEDED`;
  - `/me/usage` returns `storage.usedBytes` including a THUMBNAIL row and excluding a deleted item.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Commit `feat(api): storage usage with reservations and quota checks`.

### Task 21: Upload API — initiate, parts, complete, cancel, expire

**Files:**
- Create: `apps/api/src/uploads/uploads.module.ts`, `uploads.controller.ts`, `uploads.service.ts`, `upload-completion.ts`, `upload-plan.ts` (+ `upload-plan.spec.ts`), `apps/api/src/worker/handlers/discard-upload.handler.ts`, `expire-uploads.handler.ts`, `apps/api/src/content/media-urls.ts` (+ spec)
- Modify: `worker/job-runner.ts` (register discard and expire), `worker/handlers/purge-collection.handler.ts` (abort the collection's `INITIATED` uploads first), `content/content-dto.ts`, `guest-content.service.ts`, `admin-content.service.ts` (URLs), `config/env.ts`, `limits/limits.service.ts`, `app.module.ts`, `logging/redact.spec.ts`, `openapi.json`
- Create: `apps/api/test/uploads.e2e.spec.ts`, `apps/api/test/uploads-authz.e2e.spec.ts`

**Interfaces — produces:**
- `planUpload(sizeBytes: bigint, cfg: { singlePutMax: bigint; partSize: bigint }): { strategy: 'SINGLE' } | { strategy: 'MULTIPART'; partSizeBytes: bigint; partCount: number }` and `partLength(sizeBytes, partSize, partNumber): bigint`.
- `uploadKey(collectionId, uploadSessionId) = 'collections/{cid}/uploads/{uid}/original'`.
- `UploadsService.initiate(p: GuestPrincipal, body: CreateUploadRequest): Promise<UploadSessionResponse>` — `fileTypeFor` else `422 FILE_TYPE_NOT_ALLOWED`; `canUploadKind` else `403 FORBIDDEN`; size > per-kind limit → `422 FILE_TOO_LARGE`; existing `(session, clientUploadId)`: same metadata + `INITIATED` → fresh URL(s), else `409 IDEMPOTENCY_CONFLICT` / `409 UPLOAD_CLOSED`; hourly initiations and concurrent `INITIATED` from rows → `429 RATE_LIMITED`; transaction: `lockOwner` → `assertCanReserve` → insert; storage `createMultipart` for MULTIPART **before** insert (an orphaned multipart is aborted by the R2 lifecycle rule); storage outage → `503 DEPENDENCY_UNAVAILABLE` (`retryable: true`). `201`.
- `UploadsService.presignParts(p, uploadId, partNumbers)` — own `INITIATED` MULTIPART session (else `404` / `409 UPLOAD_CLOSED` / `410 UPLOAD_EXPIRED`), part numbers ≤ `partCount`.
- `UploadCompletion.complete(p, uploadId): Promise<GuestContentItem>` — [C18]: lock row; `COMPLETED` → return its item; not own → `404`; `ABORTED|REJECTED` → `409 UPLOAD_CLOSED`; `EXPIRED` or `expiresAt < now` → mark `EXPIRED` + enqueue discard → `410 UPLOAD_EXPIRED`; re-authorize now (link state + `canUploadKind` + collection `ACTIVE`) else `REJECTED` + discard + the state code; MULTIPART: `listParts` → missing/wrong-size parts → `409 UPLOAD_INCOMPLETE` with problem extension `missingPartNumbers` (session stays `INITIATED`) → `completeMultipart`; `head` → missing → `409 UPLOAD_INCOMPLETE`; size ≠ declared → `REJECTED` `422 UPLOAD_SIZE_MISMATCH`; `readRange(0, 4095)` → `detectFileType` + `matchesDeclared` else `REJECTED` `422 FILE_TYPE_NOT_ALLOWED`; then `FrameNumbers.next`, insert `ContentItem` (`PENDING` for PHOTO/VIDEO, `NOT_REQUIRED` for DOCUMENT; `contributorName` from session; `originalFilename`) + `MediaObject(ORIGINAL, verified MIME, size)`, session `COMPLETED`, enqueue `media.image-derivatives`/`media.video-poster` (handlers arrive in PR D; until then the jobs wait in the queue — deliberate). Rejections commit, then throw.
- `UploadsService.cancel(p, uploadId)` — own `INITIATED` → `ABORTED` + discard job → `204`; `ABORTED` → `204`; `COMPLETED` → `409 UPLOAD_CLOSED`.
- `DiscardUploadHandler.handle({ uploadSessionId })` — session in `REJECTED|ABORTED|EXPIRED`: abort its multipart upload if any, delete the original key; any other status or a missing row → no-op (never discards a completed upload).
- `ExpireUploadsHandler` — up to 200 `INITIATED` rows with `expiresAt < now()` `FOR UPDATE SKIP LOCKED` → `EXPIRED` + discard job each.
- `MediaUrls`: `thumbnail(item)`, `preview(item)`, `poster(item)`, `original(item)` (inline for PHOTO/VIDEO, `null` for DOCUMENT/TEXT), `download(item)` (attachment, `contentDispositionFor(filename, fallback)`), all window-aligned; `contentDispositionFor` strips control chars, `/`, `\`, `"`, limits to 150 code points, RFC 5987 `filename*`, ASCII fallback `stepler-{frameNo:03}.{ext}`.
- Routes (guest guard): `POST …/uploads` (201), `POST …/uploads/:uploadId/parts` (200), `POST …/uploads/:uploadId/complete` (200), `DELETE …/uploads/:uploadId` (204). Admin `GET /content/:id` now returns `originalUrl`/`downloadUrl`; guest detail too (same visibility rule).

- [ ] **Step 1: Failing tests** (`uploads.e2e.spec.ts`, real SeaweedFS; e2e env sets `UPLOAD_SINGLE_PUT_MAX_BYTES=6291456`, `UPLOAD_PART_SIZE_BYTES=5242880` to exercise multipart cheaply):
  - single: initiate `photo.jpg` → PUT bytes to the URL with the signed `content-type` → complete → `200` with `kind PHOTO`, `frameNo: 1`, `processingStatus: 'PENDING'`, one ORIGINAL media row with the real size, one `media.image-derivatives` job;
  - multipart 11 MiB generated MP4-headed buffer: initiate → parts `[1,2,3]` → PUT each → complete → `VIDEO`; parts 1–2 only → `409 UPLOAD_INCOMPLETE` with `missingPartNumbers: [3]`, then PUT 3 and complete again → `200`;
  - **Review Focus 3:** `Promise.all` of two completes → same item id, one row, one frame number; initiation retried with the same `clientUploadId` → same `uploadId`; same id with a different size → `409 IDEMPOTENCY_CONFLICT`;
  - `fake.jpg` → `422 FILE_TYPE_NOT_ALLOWED`, session `REJECTED`, discard job queued; running `DiscardUploadHandler` removes the object;
  - size mismatch (object written with the test S3 client at a different size) → `422 UPLOAD_SIZE_MISMATCH`;
  - declared 60 MB photo → `422 FILE_TOO_LARGE`, no session row; `.svg` → `422 FILE_TYPE_NOT_ALLOWED`;
  - `expiresAt` moved into the past → complete → `410 UPLOAD_EXPIRED`; `ExpireUploadsHandler` marks another stale session `EXPIRED` and queues its discard;
  - cancel → `204`, `ABORTED`, discard queued; cancel again → `204`; cancel after complete → `409 UPLOAD_CLOSED`;
  - 11th concurrent initiation with limit 10 → `429`;
  - **Review Focus 4 (HTTP):** collection limit 10 MB, two guests initiate 6 MB in `Promise.all` → one `201`, one `409 QUOTA_EXCEEDED`; the same across two collections of one owner with an account limit of 10 MB; after the admin deletes a 6 MB item a new 6 MB initiation succeeds at once;
  - discard handler on a `COMPLETED` session → object kept; purge of a `DELETING` collection with an `INITIATED` multipart upload → session `ABORTED`, multipart aborted;
  - storage down (point the service at a closed port via `testEnv`) → initiate `503 DEPENDENCY_UNAVAILABLE`, `retryable: true`;
  - `contentDispositionFor('../../ev"il\u0000.pdf', 'stepler-007.pdf')` → no `/`, `"` or NUL, has `filename*=UTF-8''`.
- [ ] **Step 2: Failing tests** (`uploads-authz.e2e.spec.ts`, **Review Focus 1 and 2**): guest B completes/cancels/requests parts for guest A's upload → `404`; guest of collection Y → `401`; link paused between PUT and complete → `403 LINK_INACTIVE` + `REJECTED`; revoked → `410 LINK_REVOKED`; `canUploadVideos` switched off → video complete `403 FORBIDDEN`; collection archived → `403 COLLECTION_ARCHIVED`; collection deleted → `410 COLLECTION_UNAVAILABLE`; in every case no `ContentItem` and a discard job exists; no presigned URL appears in any error body or log line.
- [ ] **Step 3:** FAIL → implement → PASS; `pnpm openapi:write`.
- [ ] **Step 4:** Commit `feat(api): direct-upload sessions with verified completion, cancel and expiry`.

**Checkpoint (API review, after Task 21):** one independent review of Tasks 18–21: Review Focus 1–4, lock order, transaction scope [C18], key and URL hygiene.

### Task 22: Upload components (packages/ui)

**Files:**
- Create: `packages/ui/src/components/upload-frame.tsx`, `upload-summary.tsx`, `upload-dock.tsx`, `print-stack.tsx`, each with `.stories.tsx`
- Modify: `progress.tsx` only if a story shows a gap; `docs/ux/design-system.md`

**Interfaces — produces (props):**
- `UploadFrame`: `state: 'queued'|'uploading'|'processing'|'done'|'failed'`, `progress?: number` (0–100), `preview?: ReactNode`, `position: { index: number; total: number }` (shows «1 з 6» until done), `frameNo?: number` (after done), `reason?: string` (failed, in the accessible name), `onRetry?`, `onCancel?`; DESIGN-SYSTEM §5.11 visuals (veil `scaleY(1 − p)`, pencil inset border, destructive cross).
- `UploadSummary`: `added`, `total`, `failed`, `cancelled` («Скасовано 2»; cancelled frames leave the grid), `rejected?: string` (the pre-check line «2 файли не підходять: формат .exe; понад 50 МБ»), `bytesDone`, `bytesTotal`, `etaSeconds?: number`, `offline: boolean`, `onRetryFailed?`, `onCancelRest?`; `aria-live="polite"` aggregated (not per percent).
- `UploadDock`: `primary: ReactNode`, `secondary?: ReactNode`, `mini?: ReactNode`, `note?: string` («Не закривайте сторінку, доки кадри завантажуються»); `data-toast-avoid`, safe-area padding.
- `PrintStack`: `prints: { key: string; image: ReactNode; frameNo?: number }[]` (1–3), `label: string`; ±1.5° only here; `motion-safe` develop fade.

- [ ] **Step 1: Design pass**; header comments.
- [ ] **Step 2: Failing stories with play + axe:** every UploadFrame state; failed has a 44 px «Повторити» reachable by keyboard; summary partial («27 з 30 додано · 3 не вдалося») and offline variants; dock at 320 with safe area; PrintStack 1/2/3 prints and reduced motion (no transform animation).
- [ ] **Step 3:** FAIL → implement → PASS.
- [ ] **Step 4:** Commit `feat(ui): UploadFrame, UploadSummary, UploadDock and PrintStack`.

### Task 23: Upload queue and transport (web)

**Files:**
- Create: `apps/web/src/guest/upload/queue.ts` (+ `queue.test.ts`), `file-rules.ts` (+ test), `transport.ts` (+ `transport.test.ts`), `use-upload-queue.ts`
- Modify: `apps/web/package.json` only if S9 chose Uppy (pinned versions)

**Interfaces — produces:**
- `UploadItem = { localId: string; file: File; kind: 'PHOTO'|'VIDEO'|'DOCUMENT'; clientUploadId: string; state: 'queued'|'uploading'|'processing'|'done'|'failed'|'cancelled'|'blocked'; progress: number; attempts: number; uploadId?: string; error?: ErrorCode; result?: GuestContentItem }`.
- `queueReducer(state: QueueState, action: QueueAction): QueueState`; actions `added`, `rejected` (pre-check failures, not queued: `{ name, reason: 'type'|'size' }[]`), `started`, `progressed`, `transferred` (→ `processing`), `completed`, `failed { error, retryable }`, `retryRequested`, `cancelled`, `offline`, `online`, `linkClosed { state }` (every non-done item → `blocked`).
- `selectNext(state, concurrency = 3): string[]` — queued items to start, none while `offline` or `linkClosed`.
- `retryDelayMs(attempt: number): number | null` — 2 000, 8 000, 30 000, then `null` (manual).
- `isRetryable(code: ErrorCode | 'NETWORK' | 'STORAGE_403'): boolean` — `NETWORK`, `UPSTREAM_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`, `RATE_LIMITED`, `UPLOAD_INCOMPLETE`, `STORAGE_403` (expired URL → re-initiate) are retryable; `FILE_*`, `UPLOAD_SIZE_MISMATCH`, `QUOTA_EXCEEDED`, `FORBIDDEN`, link/collection state codes are not.
- `precheck(files: File[], ctx: GuestContext): { accepted: File[]; rejected: { name: string; reason: 'type'|'size' }[]; truncated: number }` (`truncated` = files beyond `filesPerBatch`, message «Можна до 100 файлів за раз — додано перші 100»).
- `GuestUploadApi` (in `guest/api.ts`): `initiateUpload(cid, body: CreateUploadRequest): Promise<UploadSessionResponse>`, `presignParts(cid, uploadId, partNumbers: number[]): Promise<UploadPartsResponse>`, `completeUpload(cid, uploadId): Promise<GuestContentItem>`, `cancelUpload(cid, uploadId): Promise<void>`.
- PRODUCT §6.3 "preparing" = the `precheck` step plus the initiation call (the frame shows «У черзі» until bytes move).
- `UploadTransport` (per S9): `upload(item, api: GuestUploadApi, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<GuestContentItem>` — initiate just-in-time, single PUT via XHR with the returned `content-type`, multipart with ≤ 3 parts in flight, parts URLs requested in batches of ≤ 20, per-part retry, `complete`; on `409 UPLOAD_INCOMPLETE` re-sends `missingPartNumbers` once.
- `useUploadQueue(ctx: GuestContext)` — wires reducer + transport, `navigator.onLine` + `online`/`offline` events (offline → items stay `queued`), auto-retry timers, `beforeunload` while any item is `queued|uploading|processing`, link-state codes → `linkClosed` + page state, `QUOTA_EXCEEDED` → remaining items `failed` with that reason and the quota notice.

- [ ] **Step 1: Failing unit tests:** reducer transitions (queued → uploading → processing → done; retryable failure with `attempts < 3` re-queues after `retryDelayMs`; fourth failure → `failed`; non-retryable → `failed` at once; `offline` keeps `queued`; `cancelled` removes from `selectNext`; `linkClosed` blocks everything not done); `selectNext` never exceeds 3; `precheck` on 120 files with 2 `.exe` and 1 60 MB photo; `transport` with a fake XHR: progress events sum correctly across parts, a part failing twice then succeeding, abort stops all requests.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Commit `feat(web): guest upload queue, pre-checks and transport`.

### Task 24: Guest uploader UI and admin gallery for files (web)

**Files:**
- Create: `apps/web/src/guest/uploader.tsx`, `success-moment.tsx`
- Modify: `guest-page.tsx` (real «Додати фото» with `acceptFor`, name prompt first, then the hidden `<input type="file" multiple>` click inside the same handler), `own-frames.tsx` (upload frames merged above saved own frames), `apps/web/src/app/app/collections/[id]/content/content-tab.tsx` and `content-viewer.tsx` (photo/video/document frames, pending tiles, viewer media, metadata, «Завантажити»), `collection-card.tsx` and dashboard usage line («Сховище 1,2 ГБ з 20 ГБ» from `/me/usage`), collection settings tab («Використано 3,4 ГБ з 10 ГБ»), `messages/{uk,en}.json`

**Behaviour:**
- Guest (DESIGN-SYSTEM §6.2, §6.3, §5.11): pick → precheck (rejected files in the summary line with «Чому?») → frames with «1 з 6» → progress → «Додано» with the real `#087`; partial success is normal («27 з 30 додано · 3 не вдалося» + «Повторити невдалі» + «Скасувати решту»); offline Alert «Немає з’єднання. Продовжимо, щойно воно з’явиться» + «Повторити зараз»; persistent «Не закривайте сторінку…» while uploading; when all done → `PrintStack` of the last three own local previews (`URL.createObjectURL`, revoked on unmount; HEIC → pending tile) + «Готово, ваші кадри · 30 з 30»; all failed → no stack, «Не вдалося додати кадри» + reason + «Повторити всі»; link closed mid-batch → the link-state template with «Додано N до того, як посилання закрили»; quota → «Колекція заповнена — нові кадри не додаються».
- Admin: photo/video frames show «Готується прев’ю» until PR D [C13]; documents show type (`PDF`, `DOCX` mono violet) and filename; viewer: images `<img src={originalUrl}>` (HEIC → tile + «Завантажити»), video `<video controls preload="metadata">` with the fallback text «Браузер не може відтворити це відео — завантажте його» on `error`, document tile + «Завантажити»; details: `#087`, contributor or «Без імені», date and time, size (`Intl.NumberFormat` with `unit`), type, dimensions/duration when present, «Номери не змінюються після видалення» hint.

- [ ] **Step 1: Design pass**; header comments in `uploader.tsx` and `content-tab.tsx`.
- [ ] **Step 2:** Implement against Task 23's hooks; Storybook not needed (screens compose `packages/ui`).
- [ ] **Step 3:** Screenshots: picking, uploading 40%, partial, offline, success stack, all failed, link closed, quota full (guest at 360/390/1440), admin grid with mixed kinds and viewer (360/1440), light and dark.
- [ ] **Step 4:** Commit `feat(web): guest uploader with all states and admin gallery for files`.

### Task 25: Upload journeys, docs and PR C

**Files:**
- Create: `e2e/tests/guest-upload.spec.ts`, `e2e/tests/content-files.spec.ts`; `e2e/support/media.ts` (`fixture(name): string` path into `apps/api/test/fixtures/media/`, `bigBuffer(bytes, header)`)
- Modify: `e2e/playwright.config.ts` (API env: `UPLOAD_SINGLE_PUT_MAX_BYTES=6291456`, `UPLOAD_PART_SIZE_BYTES=5242880`, `LIMIT_FILE_BYTES_PHOTO=2000000` so "oversized" is a 3 MB buffer, `LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE=10000`), `apps/api/scripts/storage-bootstrap.ts` (CORS methods add `HEAD`, headers `content-type`)
- Docs: spec §10 (implemented; `missingPartNumbers`; part `Content-Length` signing), ADR 0008 "Implementation notes (uploads)" (closes the S4 open item), README (env vars), BOOTSTRAP slice 5 status, `docs/product/mvp.md` (guest photo/video/document upload, signed access).

- [ ] **Step 1: Failing journeys** (all three projects):
  - Journey 2: guest picks `photo.jpg`, `photo.png`, `doc.pdf`, `fake.exe`-named file → the `.exe` appears as rejected, three upload → «Готово … 3 з 3», PrintStack visible; admin sees 3 frames, opens the PDF frame, the download request has `content-disposition: attachment` (assert via `page.waitForResponse` on the storage URL);
  - multipart: an 11 MB generated video uploads (progress passes 50 %) and appears for the admin;
  - **Review Focus 5:** `page.route` on the storage host aborts the first two PUTs of one file → it ends «Додано» without user action; aborting it 4 times → «Не вдалося» + «Повторити» → unroute → click → «Додано»; `context.setOffline(true)` mid-batch → frames show «У черзі» and the offline Alert, `setOffline(false)` → batch completes;
  - **Review Focus 2:** six files, the admin revokes the link (API) after two complete → the guest sees «Посилання більше не діє» with «Додано 2 …»; the admin sees exactly 2 frames;
  - oversized 3 MB photo → rejected before upload with the size reason;
  - 360/390: no horizontal overflow during uploading and success.
- [ ] **Step 2:** FAIL → fix in owning tasks → PASS; record shard durations.
- [ ] **Step 3:** Batched minors; docs; full verification (Task 13 Step 4); owner design review; PR C → `dev` (not promoted [C13]).

---

## PR D — Media processing

### Task 26: Image derivatives

**Files:**
- Create: `apps/api/src/worker/handlers/image-derivatives.handler.ts`, `apps/api/src/worker/media/decode.ts` (HEIC path from S5), `apps/api/test/worker-media.e2e.spec.ts`
- Modify: `apps/api/package.json` (sharp pinned; check licence Apache-2.0, prebuilt for linux-x64/arm64 glibc and darwin-arm64), `worker/job-runner.ts` (register with `localConcurrency = WORKER_MEDIA_CONCURRENCY`), `content/media-urls.ts` (thumbnail/preview now resolved), `sharp.cache(false)` and `limitInputPixels: 100_000_000` set once in the worker

**Interfaces — produces:**
- `ImageDerivativesHandler.handle({ contentItemId })`: item missing or deleted → return; download the original to a temp file (stream, ≤ 50 MB); HEIC/HEIF → `decodeHeic(path): Promise<string>` (temp PNG per S5); `sharp(input).rotate()` → thumbnail 480 px (longest side, `fit: inside`, WebP q 70) and preview 1600 px (WebP q 80); `putObject` to the deterministic keys; one transaction: `INSERT … ON CONFLICT (contentItemId, role) DO UPDATE` for THUMBNAIL and PREVIEW (+ width/height on ORIGINAL), `processingStatus = READY` **only if `deletedAt IS NULL`**; if the item was deleted meanwhile → delete the written keys [Review: purge race]; temp files removed in `finally`. Final failure (pg-boss retries exhausted, `onComplete`/`failed` hook) → `processingStatus = FAILED`.
- Usage now counts derivatives automatically (MediaObject rows).

- [ ] **Step 1: Failing tests:** `photo.jpg` → two WebP objects, MediaObject rows, `READY`, thumbnail longest side 480; run twice → still two rows (idempotent); `photo.heic` → preview decodes (dimensions > 0); an EXIF-GPS JPEG fixture → the derived WebP has no EXIF (`sharp(metadata).exif === undefined`); a 20 000×20 000 PNG bomb → handler throws `InputPixelLimit`, after retries `FAILED`, original untouched; item deleted before the transaction → no rows, written keys removed.
- [ ] **Step 2:** FAIL → implement → PASS (CI installs the S5 tools in `quality` via `apt-get` before tests; README prerequisite: `brew install libheif ffmpeg` on macOS).
- [ ] **Step 3:** Commit `feat(worker): image thumbnails and previews, HEIC included`.

### Task 27: Video posters and the media worker image

**Files:**
- Create: `apps/api/src/worker/handlers/video-poster.handler.ts`, `apps/api/src/worker/media/ffmpeg.ts`
- Modify: `apps/api/worker.Dockerfile` (ffmpeg + the S5 HEIC packages, `apt-get --no-install-recommends`, version pins noted), `docker/scripts/verify-images.sh` (worker image: `ffmpeg -version` and the HEIC decoder run as the runtime user; API image still has neither), `apps/api/test/worker-media.e2e.spec.ts`

**Interfaces — produces:**
- `probeDuration(url: string): Promise<number | null>` (ffprobe, ms) and `extractFrame(url: string, atSeconds: number): Promise<Buffer>` (PNG; `-ss` before `-i` for range seeking; timeout 60 s; stderr not logged beyond 2 KB and never the URL).
- `VideoPosterHandler.handle({ contentItemId })`: presigned GET of the original (15 min), duration → `MediaObject(ORIGINAL).durationMs`, frame at `min(1 s, duration / 2)` → sharp → poster WebP 1600 px + thumbnail 480 px (the grid uses the thumbnail role for every kind); same upsert/deleted rule as Task 26; `READY` or, after retries, `FAILED` (the frame then shows ▶ without a poster, D4).

- [ ] **Step 1: Failing tests:** `clip.mp4` and `clip.mov` → POSTER + THUMBNAIL, `durationMs` ≈ 1000 (±100); a truncated MP4 → `FAILED` after retries; logs during the run contain no `X-Amz-Signature`.
- [ ] **Step 2:** FAIL → implement → PASS; `verify-images.sh` PASS.
- [ ] **Step 3:** Commit `feat(worker): video posters and durations; worker image with ffmpeg and HEIC`.

### Task 28: Previews in the UI, journeys, docs and PR D

**Files:**
- Modify: `content-tab.tsx`, `content-viewer.tsx`, `own-frames.tsx`, guest grid (thumbnail `<img loading="lazy" decoding="async">` with width/height; viewer uses `previewUrl` for photos (always for HEIC), `posterUrl` as the video `poster`; `FAILED` → type tile + «Прев’ю недоступне»); `useNewContent` also refetches page 1 while any visible item is `PENDING` (every 10 s, stops when none)
- Create: `e2e/tests/media-processing.spec.ts`
- Docs: spec §11 (implemented), ADR 0009 "Implementation notes (processing)" + S5 result if not yet written, BOOTSTRAP slice 6 status, `docs/development/README.md` (worker prerequisites), a **staging smoke checklist** section in `docs/development/README.md` (owner action S1).

- [ ] **Step 1: Failing journey** (all projects): guest uploads `photo.jpg` and `clip.mp4` → within 30 s the admin grid shows real thumbnails (`naturalWidth > 0`) and the video frame shows its duration «0:01».
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Batched minors; docs; full verification + `verify-images.sh`; owner design review (grid with previews, viewer on phone).
- [ ] **Step 4:** PR D → `dev`. After merge: owner actions R1, R2, W4 → promote `dev → stage` → staging smoke checklist S1:
  1. upload a > 100 MB video from a phone on staging (multipart on real R2; equal part sizes accepted);
  2. upload an iPhone HEIC → preview appears;
  3. upload a PDF → download is an attachment;
  4. cancel a large upload midway → the object disappears within 15 min (expiry/discard) — check in the R2 dashboard;
  5. revoke a link mid-upload → completion refused, no frame;
  6. verify in the browser network panel that the PUT response exposes `ETag` and no request carries `x-amz-checksum-crc32`.
  Record results in ADR 0008 ("R2 behaviour verified on staging").

---

## PR E — Guest gallery, own delete, admin multi-delete

### Task 29: Selection bar (packages/ui)

**Files:**
- Create: `packages/ui/src/components/selection-bar.tsx`, `selection-bar.stories.tsx`; extend `frame.stories.tsx` (selection mode)

**Interfaces — produces:** `SelectionBar`: `count: number`, `countLabel: string` («Вибрано 3»), `actions: ReactNode`, `onClear: () => void`, `clearLabel: string`; sticky in the grid column ≥ 1024, fixed with safe area below (DESIGN-SYSTEM §5.13, §7.3), `data-toast-avoid`, `role="region"` with a label.

- [ ] **Step 1:** Failing stories (play + axe): appears with count, `Escape` clears, buttons 44 px, no overlap with the dock at 360.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Commit `feat(ui): SelectionBar`.

### Task 30: Guest own-content deletion (API + web) and the `canDeleteOwn` toggle [C15]

**Files:**
- Modify: `content/guest-content.service.ts` (`delete`), `guest-content.controller.ts` (`DELETE /guest/collections/:cid/content/:id`), `apps/web/src/guest/own-frames.tsx` and the guest viewer (delete action), `apps/web/src/guest-links/link-permissions.ts`, `permission-fields.tsx` (+ test), `messages/{uk,en}.json`, `openapi.json`
- Create: `apps/api/test/content-guest-delete.e2e.spec.ts`

**Interfaces — produces:**
- `GuestContentService.delete(p: GuestPrincipal, id: string, requestId): Promise<void>` — item in `p.collectionId`, own (else `404`), `canDeleteOwn` (else `403 FORBIDDEN`); `deletedAt` + audit (`GUEST` actor) + `content.purge` in one transaction; already deleted own → `204`.
- `toFormPermissions`/`fromFormPermissions` stop forcing `canDeleteOwn`; the editor shows «Гості можуть видаляти свої кадри» (disabled with the reason when no contribution type is on).

- [ ] **Step 1: Failing tests:**
  - **Review Focus 1:** guest B deletes guest A's item (visible in a shared gallery) → `404`, A's item untouched; guest of collection Y → `401`; own item with `canDeleteOwn: false` → `403`; own item → `204`, invisible to admin and in counts at once, one purge job; repeat → `204`;
  - re-bound session (F5) through a link without `canDeleteOwn` → `403` on an item created through the earlier link;
  - web unit: the permission form round-trips `canDeleteOwn: false`; turning off every contribution type also turns it off.
- [ ] **Step 2:** FAIL → implement (guest UI: delete in own frames and in the viewer on own frames only, `ConfirmDialog` «Видалити свій кадр #087? Організатор теж більше його не побачить.»; hidden entirely without `canDeleteOwn`) → PASS.
- [ ] **Step 3:** Commit `feat: guests delete their own frames when the link allows it`.

### Task 31: Admin multi-select and bulk delete [C7]

**Files:**
- Modify: `content/admin-content.service.ts` (`bulkDelete`), `admin-content.controller.ts` (`POST /collections/:id/content/bulk-delete`), `apps/web/src/app/app/collections/[id]/content/content-tab.tsx`, Create `selection.ts` (+ test), `apps/web/src/api/content.ts` (`bulkDeleteContent`), `openapi.json`
- Create: `apps/api/test/content-bulk-delete.e2e.spec.ts`

**Interfaces — produces:**
- `AdminContentService.bulkDelete(a, collectionId, ids, requestId): Promise<BulkDeleteContentResponse>` — owned non-`DELETING` collection else `404`; one transaction: `UPDATE … SET deletedAt WHERE collectionId AND id IN ids AND deletedAt IS NULL RETURNING id, kind, frameNo`, audit each (`bulk: true`), `content.purge` each (singletonKey); `deletedIds` = updated ∪ already-deleted of this collection; `notFoundIds` = the rest (ids of other collections look like nonexistent ones).
- Web `selection.ts`: `toggle(set, id)`, `rangeSelect(ids, anchor, target)` (Shift+click / Shift+Space), selection cleared on filter change.
- Selection mode (DESIGN-SYSTEM §5.13): «Вибрати» in the grid header, `x`/Space on a focused frame, long-press on touch (500 ms, cancels on move); checkbox icon visible on every frame in the mode; `SelectionBar` with «Видалити» → `ConfirmDialog` «Видалити 3 кадри? Номери не використовуватимуться знову.» → toast `info` «Видалено 3 кадри».

- [ ] **Step 1: Failing tests:** API: 3 own ids + 1 of another owner's collection → `deletedIds` 3, `notFoundIds` 1, the foreign item untouched, 3 audit rows, 3 jobs; retry of the same request → same `deletedIds`, still 3 audit rows (**Review Focus 3**); 101 ids → `400`; admin B → `404`. Web unit: `rangeSelect` forward/backward, clear on filter change.
- [ ] **Step 2:** FAIL → implement → PASS; `pnpm openapi:write`.
- [ ] **Step 3:** Commit `feat: admin multi-select and bulk delete`.

### Task 32: Guest shared gallery with viewer, journeys, docs and PR E

**Files:**
- Modify: `apps/web/src/guest/guest-page.tsx` (tabs «Ваші кадри / Усі кадри» when `canViewGallery`, DESIGN-SYSTEM §6.3–§6.4; viewer for every visible frame with «Завантажити»; foreign frames without numbers or names; refresh on focus and every 30 s while visible)
- Create: `e2e/tests/content-management.spec.ts`
- Docs: spec §8/§12 notes (implemented), BOOTSTRAP slices 7–8 status (hide stays with slice 9), `docs/product/mvp.md` (own-content deletion, admin deletion), `docs/ux/design-system.md`, DESIGN-SYSTEM §12.8 (answered: own frames tab + viewer)

- [ ] **Step 1: Failing journeys:**
  - guest A uploads 2 photos; guest B (shared-gallery link) sees both under «Усі кадри» without numbers and without a delete action; A deletes one from «Ваші кадри» → the admin's counts drop by one; B's refresh no longer shows it;
  - a link with `canDeleteOwn` off → no delete control anywhere for its guests;
  - `@desktop` admin: «Вибрати» → select 3 with Shift+click → «Видалити» → confirm → «Видалено 3 кадри», tab count updated;
  - mobile (all projects): long-press selects a frame; SelectionBar does not cover the last row; no horizontal overflow at 360.
- [ ] **Step 2:** FAIL → fix → PASS; shard durations recorded.
- [ ] **Step 3:** Batched minors; docs; full verification; owner design review.
- [ ] **Step 4:** PR E → `dev`; promote `dev → stage` when the owner wants.

## Checkpoints

- After **Task 9** and after **Task 21**: one independent API/authorization review each (see the notes under those tasks).
- Before each PR: the owner's design review of that PR's screenshots, feedback in one commit.
- After each PR: one whole-branch review, one fix round, merge to `dev` with a merge commit.
- Staging promotions only at the points in "PR split", after the listed owner actions.

## Doc conflicts this plan resolves (to record in the docs it touches)

1. **Spec §7.2 and §15** say the guest name is not stored on the session and the session holds no profile data; [O4] remembers the name per session → amended in Task 13 [C4].
2. **DESIGN-SYSTEM §12.1** default asks for the name *after* the first upload; [O4] asks *before* the first contribution → §12.1 closed in Task 13.
3. **Spec §9.1** single-call exchange cannot see the path-scoped cookie, so re-binding (F5) would never happen → two-step exchange [C3], §9.1 rewritten in Task 13.
4. **BOOTSTRAP slice 7 ("delete/hide")**, spec §7.3 `hiddenAt/hiddenBy` and §9 `/content/{id}/hide|unhide` vs [O3] "no hide" → hide moves to slice 9 (operator); no `hiddenAt` column now [C19].
5. **Spec §3** lists `apps/worker/` but also calls the worker "a second entrypoint of the same modular monolith" → [C2].
6. **Spec §13.1** guest session creation 30/min per IP vs the slice-2 precedent [G10] (120) → [C10].
7. **DESIGN-SYSTEM §12.19** default order "by number" vs [C5] newest first.
8. **DESIGN-SYSTEM §5.9** shows the contributor's name on text frames; guests must never see names (D6, spec §8) → names only in the admin UI.
9. **DESIGN-SYSTEM §5.12** viewer menu «Поскаржитися» → reports are slice 9; not built here.
10. **Slice 2 [G3]** hid `canDeleteOwn` until slice 8 → exposed in PR E [C15].

## Out of scope

- Content reports and the operator flow (slice 9), including hide/unhide; legal pages and the guest Terms notice (slice 10, a production gate [C20]).
- Collection cover upload (the dashboard tile stays initials; using the newest photo is a follow-up), admin uploads, ZIP/bulk download (multi-select offers delete only), `capturedAt`/EXIF timeline, EventTimeline, justified rows view, dense mode, «нове» marks (needs `lastSeenAt`), oldest-first toggle.
- Transcoding, resumable uploads across tabs/devices (ADR 0015), reconciliation of DB rows whose objects are missing (spec §10.5: logged and shown as unavailable only).
- Production services and secrets (production Blueprint is a separate decision).
