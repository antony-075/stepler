# Stepler Phase 4, Slice 8a: Collection Appearance («Вигляд») Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin gives a collection a cover (an uploaded image, or any guest photo frame made the cover from the viewer) and a short welcome message on a new fourth tab «Вигляд»; the cover shows on the dashboard card, in the share dialog and as the hero of the guest page, the welcome text shows to guests above their main action, and everything degrades to today's initials tile when there is no cover.

**Architecture:**
- **API** (NestJS): `collections` gains a `CollectionCover` row per collection (one, replaced as a whole) and `Collection.welcomeMessage`. The admin's cover file reaches storage the same way guest files do — a multipart `UploadSession` with a new `purpose = COVER` and `uploaderUserId` (spec §7.3 reserved `userId?` on `UploadSession` for admin uploads), completed by a thin cover completion that reuses the guest completion's storage inspection (parts, size, content signature). «Зробити обкладинкою» copies the frame's **original** object server-side (`CopyObject`, ≤ 50 MB) into the cover's own prefix, so deleting the guest frame later never touches the cover. Keys are built from ids only: `collections/{cid}/cover/{coverId}/{original|thumbnail.webp|preview.webp}`.
- **Worker:** two jobs — `media.cover-derivatives` (thumbnail 480 px + preview 1600 px WebP from the copied original, HEIC through the same libheif path as photos) and `cover.purge` (the prefix of a replaced or removed cover). A collection's purge already deletes its whole prefix, cover included.
- **Web:** a fourth segment «Вигляд» (`?tab=appearance`) with a cover card (every state) and a welcome-message form; a shared `CollectionCover` component in `packages/ui` renders the cover image or falls back to the `TintTile` initials; the dashboard card, the share dialog header and the guest page hero use it. The admin upload reuses the guest `UploadTransport` (same multipart protocol, admin endpoints).

**Tech Stack:** as the Phase 4 guest-content plan (NestJS 12 ESM, Prisma 7, Zod 4 contracts, Next.js 16 + next-intl, TanStack Query 5, React Hook Form, Tailwind 4 + shadcn/Radix, Storybook 10 + Vitest browser + axe, Playwright, pg-boss, sharp + libheif in the worker). **No new dependency.**

**Spec:**
- Owner decisions 2026-10-04 (the brief for this plan): a fourth tab «Вигляд» with (1) a collection cover — upload JPEG/PNG/WebP/HEIC/HEIF/GIF ≤ 50 MB **or** pick any guest PHOTO frame from «Вміст» («Зробити обкладинкою» in the admin viewer); stored separately, the guest's item untouched (deleting it must not break the cover); replace and remove; (2) a welcome message — short plain text, 1–2 lines, no formatting, optional, shown to guests above the primary action; (3) the cover shown wherever initials show today, through one shared component with the initials fallback; the admin collection header stays textual; the tint stays automatic. Cover and welcome message were post-MVP (`docs/product/PRODUCT.md` §24.3, `docs/product/post-mvp.md`) and are pulled forward.
- `docs/product/PRODUCT.md` §3.1, §5.3–§5.4, §6.2; `docs/architecture/mvp-architecture-spec.md` §7.2–§7.3, §8, §9, §10 (§10.2 multipart only, §10.4, §10.6 keys), §11, §12, §13.2; ADR 0003, 0008 (addenda 2026-10-03), 0009, 0010, 0015; `docs/design/DESIGN-SYSTEM.md` §5.10 (`TintTile`), §6.0 (page frame), §6.1 (guest first screen), §6.5–§6.6, §12.12; `docs/ux/design-system.md` (`TintTile`, dashboard rows); the slice 3–8 plan `docs/superpowers/plans/2026-10-03-phase-4-guest-content.md` (conventions, decisions C1–C20, PR style).

## Prerequisites

- `dev` contains PRs A–E (merged 2026-10-04; `0b677d9` is the PR E merge).
- The owner has confirmed (or overridden) the decisions marked **[confirmed 2026-10-04]** below. Tasks are written against the recommendations; a different answer changes only the steps tagged with that decision id.
- Each PR is cut from the then-current `dev` and opened against `dev` (rule 15). Nothing here touches `apps/*/.env`, the owner's dev servers (3000/4010) or `stage`/`main`.

## Decisions (recommendations; **[confirmed 2026-10-04]** = the owner should answer before the PR it affects)

1. **[A1] [confirmed 2026-10-04] The admin cover file goes through `UploadSession` with `purpose = COVER`.** Two nullable-made columns (`guestSessionId`, `guestLinkId`), two new ones (`purpose`, `uploaderUserId → User`), CHECKs that a `CONTENT` row has its guest and link and a `COVER` row its uploader (and is a `PHOTO`), a second idempotency key `(uploaderUserId, clientUploadId)`. The admin gets its own four routes under `/collections/{id}/cover/uploads` with the admin session guard; the service reuses the guest module's planning, presigning, open-state rules, claim logic and storage inspection, and the existing `uploads.expire`, `storage.discard-upload` and `collection.purge` (aborts open uploads) jobs apply unchanged. ADR 0008's reasons for multipart-only hold for admins too (a single presigned PUT stays writable).
   - Alternative: a separate `CoverUpload` table and mini flow — duplicates expiry, discard, claim and inspection for one 50 MB file; or routing the admin through the guest controller with an admin principal — rejected, the guest guard and cookie semantics are the IDOR boundary and must stay guest-only.
2. **[A2] One `CollectionCover` row per collection, replaced whole** (`collectionId @unique`): `id`, `status PENDING|READY|FAILED`, `source UPLOAD|FRAME`, `mimeType`, `originalSizeBytes`, `derivedSizeBytes` (thumbnail + preview, 0 until `READY`), `width?`, `height?`, `createdAt`. No storage keys in the row: every key is `coverKey(collectionId, coverId, role)`. Replacing or removing deletes the row at once (usage drops immediately, like deleted items) and enqueues `cover.purge {collectionId, coverId}`, which deletes the prefix only if no row with that id exists.
   - Alternative: make `MediaObject` polymorphic (`contentItemId?` + `collectionCoverId?`) to reuse `DerivativeStore` — touches the content purge, usage SQL and a compound unique with a nullable column for ~40 lines of saved code.
   - A lost `cover.purge` (after pg-boss's 10 retries) leaves at most one cover's objects orphaned until the collection is deleted; accepted (the sweep cannot know former cover ids and the row is gone).
3. **[A3] Both sources end as the same object layout.** An uploaded cover is copied from `collections/{cid}/uploads/{uid}/original` to `collections/{cid}/cover/{coverId}/original` at completion (server-side `CopyObject`, then the upload key is deleted best-effort after commit); a frame is copied from the item's ORIGINAL key. One worker path, one purge path, no key column. New port method `ObjectStorage.copyObject(fromKey, toKey, contentType)` (R2 and SeaweedFS support same-bucket copies up to 5 GB; the SeaweedFS behaviour is verified by a storage test in Task 2).
4. **[A4] Derivatives for the cover are the photo ones**: thumbnail 480 px (dashboard card, share dialog) and preview 1600 px (guest hero; at 720 px CSS width and DPR 2 it is still 1440 px) through `renderDerivatives` unchanged; no extra hero size. The guest hero crops to 4:3 with `object-cover` (the DESIGN-SYSTEM §6.1 sketch), card tiles stay square.
5. **[A5] [confirmed 2026-10-04] Welcome message: at most 160 code points, one paragraph** (no line breaks or control characters, like the title; trimmed; `null` = hidden), SQL CHECK `Collection_welcome_length`. 160 is the owner's suggested number; on a 360 px phone at 17 px it is about four short lines at most, two for a typical sentence. Edited through the existing `PATCH /collections/{id}` (`welcomeMessage: string | null`), so it follows D9 like the title (editable while archived). Alternative: 200 with one line break allowed.
6. **[A6] [confirmed 2026-10-04] Archived collections: the «Вигляд» tab is read-only, and the API refuses cover mutations on an `ARCHIVED` collection with `409 COLLECTION_ARCHIVED`** (bytes, a copy and worker time for a collection nobody can open). The welcome message stays editable through `PATCH` per D9; the tab simply does not offer the form. Alternative: allow cover changes while archived like title and description.
7. **[A7] [confirmed 2026-10-04] Where the cover shows.** The brief lists "dashboard card tile, guest page hero, share dialog, link sheet summary". In the code today initials render only on the dashboard card (`TintTile size="cover"`); the share dialog and the links sheet show no tile. Plan: dashboard card (replace), guest hero (new, **only when a cover exists** — the guest page has no initials today, so no new tile without a cover), share dialog header (a 44 px `CollectionCover` beside the title, cheap and in place), links sheet untouched. Alternative: the guest hero always shows the tile (initials when no cover); the links sheet gets the mark too.
8. **[A8] Pick-from-frame rules.** The item must be in the admin's own collection (else `404`), not deleted (`404`), `kind = PHOTO` with an ORIGINAL and `processingStatus ≠ FAILED` (else `422 COVER_SOURCE_INVALID`: a photo the worker could not decode will fail again as a cover). The UI lists only photos with a thumbnail; others are shown disabled «Готується прев’ю». The quota check runs under the owner lock before the row is inserted (the copy happens first; on refusal the copied object is deleted).
9. **[A9] No new rate limit and no audit events.** Admin cover routes are behind the admin session; abuse is bounded by the quota and by at most **3 open cover uploads per collection** (`429 RATE_LIMITED`, rows). Title and description edits are not audited today; cover and welcome changes follow (spec §7.4 list unchanged). Both set and remove are logged with ids only.
10. **[A10] PR split: two PRs** (12 tasks; the brief's threshold). **PR F** `feat/phase-4-appearance-api` (Tasks 1–7: contracts, schema, API, worker, API docs) ships additive API only and is safe to merge alone; **PR G** `feat/phase-4-appearance-web` (Tasks 8–12: UI component, screens, journeys, product docs) carries the owner's design review. Promote `dev → stage` after G. Alternative: one PR of 12 tasks with a checkpoint review after Task 6.

## Deliberate choices (low risk; override if you disagree)

- **Idempotent completion:** a `COMPLETED` cover upload completed again returns the collection as it is now (the cover may already have been replaced); it never re-copies.
- **HEIC covers** are `PENDING` until the worker finishes; the admin sees «Готується», guests see no hero until `READY`; `FAILED` shows the admin «Не вдалося підготувати обкладинку» with «Замінити» and «Видалити» and guests nothing.
- **Guest DTO:** `GuestContext.collection.cover` is `{ thumbnailUrl, previewUrl, width, height } | null`, present only when `READY`; never a status, a source or an item id. `welcomeMessage: string | null`. The resolve response (`POST /guest/links/resolve`) is unchanged.
- **Admin DTO:** `Collection.cover` is `{ status, thumbnailUrl, previewUrl, width, height } | null` (URLs `null` until `READY`), on the list and the detail; presigned per window like media URLs (`MediaUrls` gains a public `signInline`). `Collection.welcomeMessage: string | null`.
- **Processing refresh:** the «Вигляд» tab refetches the collection every 10 s (`PREVIEW_POLL_MS`) while `cover.status === 'PENDING'`, for at most 30 min (`PREVIEW_WAIT_MS`), and stops when the tab is hidden.
- **Upload progress UI:** the cover card shows a `Progress` bar with the percent and «Скасувати»; a failed transfer shows the reason and «Повторити» (same `isRetryable` rules as the guest queue, one file, no queue).
- **Viewer action** «Зробити обкладинкою» appears for `PHOTO` items with a thumbnail in the admin viewer only (no per-frame menu: the viewer already holds «Завантажити» and «Видалити»).
- **Logs:** never a presigned URL or a file name; `cover set` / `cover removed` lines carry `collectionId`, `coverId`, `source`.

## Pre-implementation gate (rule 19)

- **Similar code:** `UploadsService` / `UploadCompletion` (claim, inspect, close), `upload-plan.ts`, `DerivativeStore` + `ImageDerivativesHandler` (download, decode, render, record-if-still-there), `PurgeContentHandler` (`deletePrefix`), `UsageService` (lock order, reservations), `CollectionsService.update`, `MediaUrls`, web `transport.ts`, `inline-edit.tsx`, `collection-settings.tsx` (`SectionCard`), `content-viewer.tsx` actions, `TintTile`, `MediaImg`, `gridPicture`.
- **Data:** `CollectionCover`, `Collection.welcomeMessage`, `UploadSession.purpose/uploaderUserId` (+ nullable guest columns); enums `CoverStatus`, `CoverSource`, `UploadPurpose`.
- **API:** `PATCH /collections/{id}` (+`welcomeMessage`); `POST /collections/{id}/cover/uploads`, `POST …/cover/uploads/{uploadId}/parts`, `POST …/cover/uploads/{uploadId}/complete`, `DELETE …/cover/uploads/{uploadId}`; `POST /collections/{id}/cover/from-frame`; `DELETE /collections/{id}/cover`; `Collection` and `GuestContext` gain fields.
- **Permissions:** owner only (`ownerId = principal.userId AND status <> 'DELETING'`, else `404`); guests read cover URLs and the welcome text through the context; the operator has no role here.
- **Third parties:** R2/S3 (multipart as today, `CopyObject` new); browser → storage directly for the admin's file (ADR 0003 exception, as for guests). No SDK in the browser.
- **Retry / partial failure / deletion / expiry / mobile:** Review Focus below.
- **Tests:** contracts unit; API integration (authorization matrix, quota, idempotency, archived); storage (`copyObject`); worker (derivatives, purge, collection purge); web unit (tab, cover state, welcome form); Storybook + axe (`CollectionCover`); Playwright (admin `@desktop`, guest all projects).
- **Scope:** MVP by owner decision 2026-10-04 (moved from post-MVP). Not in scope: automatic "newest photo as cover", themes/colours, custom upload instructions, cropping/repositioning the cover.

## Global Constraints

- **Branches:** PR F `feat/phase-4-appearance-api`, PR G `feat/phase-4-appearance-web`, each from `dev`, PR to `dev`, merge commit; never push to `dev`/`stage`/`main` directly. One commit per task.
- **Pace over polish:** per-task review raises only correctness, security, data integrity and accessibility blockers; minors are batched into each PR's last task.
- **Authorization:** admin routes reach rows only through `collection.ownerId = principal.userId AND collection.status <> 'DELETING'`; out of scope → `404 NOT_FOUND`; the guest context exposes only `READY` cover URLs and the text; every unsafe method keeps the CSRF origin check.
- **Contracts:** strict Zod objects, no `.transform()`, no `z.date()`; `COVER_SOURCE_INVALID` appended to `ERROR_CODES` with uk/en messages; DTOs mapped explicitly, never a Prisma row.
- **Database:** additive migration with `--create-only`, named raw-SQL CHECKs appended; `pnpm db:check` passes; `uuidv7()` ids; `bigint` bytes in the DB, safe `number` in JSON.
- **Storage:** keys from ids only; no file bytes through Node except the worker's derivative input (≤ 50 MB, streamed to a temp file) and the 4 KB signature read; `CopyObject` is server-side inside the bucket.
- **Limits:** cover size uses the existing `LIMIT_FILE_BYTES_PHOTO`; the open-cover-uploads cap (3) is a named constant in `cover-uploads.service.ts`, not env. **No new environment variable.**
- **OpenAPI:** `@ApiTags('Collections')` on the new routes, `@ApiResponse({ standardSchema })`, documented error codes; `pnpm openapi:write` in the same commit.
- **Web:** TanStack Query for server state; React Hook Form + the contract schema for the welcome form; no literal UI strings (uk default, en parity); destructive actions through `ConfirmDialog`; touch targets ≥ 44 px; nothing hover-only; no horizontal scroll at 320/360/390.
- **Direction C (ADR 0015):** admin primary buttons ink; violet focus ring; the cover image never gets rotation, shadow or frame; the tint stays derived from the collection id.
- **Design pass (every UI task):** before writing the screen apply the frontend-design skill, `.claude/skills/ui-ux-pro-max`, `web-design-guidelines`, `responsive-design`; write the decisions as a 5–10 line header comment in the screen's main file; afterwards screenshots at 360×780, 390×844 and 1440×900, light and dark, saved to `$TMPDIR/stepler-appearance-screens/` (not committed) for the owner's design review before PR G.
- **Never** start/stop the owner's dev servers or touch `apps/*/.env`; `pnpm e2e` uses 3100/4100 and is safe alongside them.

## Review Focus

1. **The source frame disappears after it became the cover.** Admin picks frame #012 as the cover; a guest (or the admin) deletes #012 and the worker purges it; later the whole collection is deleted. Expected: the cover stays `READY` with its three objects until the collection is deleted; the collection purge removes `collections/{cid}/cover/…` too. Tests in Task 5 (API) and Task 6 (worker).
2. **Replace while processing.** The admin uploads cover A (HEIC, slow), then immediately picks frame B. Expected: the row for A is gone and its prefix queued for purge; the worker run for A finds no row with its id and deletes the objects it just wrote; B becomes `READY`; usage counts B only. Tests in Task 6.
3. **Another admin's collection.** Admin B calls every cover route on A's collection, with A's upload id, with A's frame id; a guest cookie hits an admin route; A picks a frame from B's collection. Expected: `404` everywhere (or `401 UNAUTHENTICATED` for the cookie), no row changed, no object copied, no presigned URL in any error body or log. Tests in Task 4 and Task 5.
4. **Quota.** Collection limit 10 MB: a 6 MB cover and a 6 MB guest photo cannot both fit, whichever comes first; removing the cover frees its bytes at once; a replaced cover never double-counts. Tests in Task 3 and Task 5.
5. **Phone reality.** 360 px: the «Вигляд» tab, the frame picker as a bottom sheet with 44 px targets, a 160-character welcome text under the hero, a HEIC cover that stays «Готується» and never renders a broken `<img>`; `horizontalOverflow === 0`. Tests in Task 12.

---

## PR F — Contracts, schema, API, worker

### Task 1: Contracts — cover, welcome message, error code

**Files:**
- Create: `packages/contracts/src/cover.ts`, `packages/contracts/src/cover.test.ts`
- Modify: `packages/contracts/src/collections.ts` (+ `collections.test.ts`), `packages/contracts/src/guest.ts` (+ `guest.test.ts`), `packages/contracts/src/errors.ts`, `packages/contracts/src/index.ts`, `apps/web/messages/uk.json` and `en.json` (`errors.COVER_SOURCE_INVALID`)

**Interfaces — produces:**
- `WELCOME_MESSAGE_MAX_CHARS = 160`; `collectionWelcomeMessageSchema`: `z.string().trim().min(1).regex(NO_CONTROL_CHARACTERS)` refined to `codePointLength(s) <= 160` (one paragraph, like the title; code points like `textBodySchema`).
- `coverStatusSchema = z.enum(['PENDING', 'READY', 'FAILED'])`.
- `collectionCoverSchema` (strict): `{ status: coverStatusSchema, thumbnailUrl: z.url().nullable(), previewUrl: z.url().nullable(), width: int.nullable(), height: int.nullable() }`; `CollectionCover` type.
- `guestCoverSchema` (strict): `{ thumbnailUrl: z.url(), previewUrl: z.url(), width: int ≥ 1, height: int ≥ 1 }`.
- `collectionSchema` += `welcomeMessage: z.string().nullable()`, `cover: collectionCoverSchema.nullable()`; `updateCollectionRequestSchema` += `welcomeMessage: collectionWelcomeMessageSchema.nullable().optional()`.
- `setCoverFromFrameRequestSchema = z.object({ contentItemId: z.uuid() }).strict()`; `coverUploadParamsSchema = z.object({ id: z.uuid(), uploadId: z.uuid() })`. The cover upload body is `createUploadRequestSchema` (re-exported, no new schema).
- `guestContextSchema.collection` += `welcomeMessage: z.string().nullable()`, `cover: guestCoverSchema.nullable()`.
- `ERROR_CODES` += `COVER_SOURCE_INVALID` (422). uk «Обкладинкою може стати лише фото, яке вже готове.», en "Only a processed photo can become the cover."

- [ ] **Step 1: Failing tests:** `collectionWelcomeMessageSchema`: `'  Вітаємо! '` → `'Вітаємо!'`; 160 emoji pass, 161 fail; `'a\nb'` fails; `''` fails. `collectionSchema` rejects a body without `cover`/`welcomeMessage` and accepts `cover: null`. `guestCoverSchema` rejects `thumbnailUrl: null` and an extra `status` key; `guestContextSchema` rejects `collection.cover.sourceContentItemId`. `updateCollectionRequestSchema` accepts `{ welcomeMessage: null }`.
- [ ] **Step 2:** `pnpm --filter @stepler/contracts test` → FAIL.
- [ ] **Step 3:** Implement; messages in both catalogs.
- [ ] **Step 4:** `pnpm --filter @stepler/contracts test && pnpm --filter @stepler/web test` → PASS (catalog parity).
- [ ] **Step 5:** Commit `feat(contracts): collection cover and welcome message schemas`.

### Task 2: Data model, migration and `copyObject`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`; Create: `apps/api/prisma/migrations/<ts>_collection_cover/migration.sql` (`prisma migrate dev --create-only --name collection_cover` + raw SQL)
- Modify: `apps/api/src/storage/object-storage.ts`, `s3-object-storage.ts` (`CopyObjectCommand`, `MetadataDirective: 'REPLACE'`, `ContentType`), `apps/api/test/support/database.ts` (`MODEL_TABLES` + `CollectionCover`)
- Modify: `apps/api/src/uploads/upload-completion.ts`, `uploads.service.ts`, `worker/handlers/*.ts` only where `guestSessionId: string | null` now needs narrowing (`row.guestSessionId ?? fail('content upload without a guest session')`)
- Modify: `apps/api/test/database.e2e.spec.ts`, `apps/api/test/storage.e2e.spec.ts`

**Schema (Prisma-level):**
- `enum CoverStatus { PENDING READY FAILED }`, `enum CoverSource { UPLOAD FRAME }`, `enum UploadPurpose { CONTENT COVER }`.
- `Collection.welcomeMessage String?`, `Collection.cover CollectionCover?`.
- `CollectionCover { id uuidv7, collectionId @unique → Collection (Cascade), status CoverStatus @default(PENDING), source CoverSource, mimeType String, originalSizeBytes BigInt, derivedSizeBytes BigInt @default(0), width Int?, height Int?, createdAt }`.
- `UploadSession`: `purpose UploadPurpose @default(CONTENT)`; `guestSessionId String?`, `guestLinkId String?` (relations become optional; the composite-key relations keep their `map` names — the `ContentItem.contributorGuestSession` relation is the precedent for an optional field beside the required `collectionId`); `uploaderUserId String? @db.Uuid → User (Cascade)`; `@@unique([uploaderUserId, clientUploadId])`.

**Raw SQL (named):**
- `Collection_welcome_length` CHECK `("welcomeMessage" IS NULL OR char_length("welcomeMessage") BETWEEN 1 AND 160)`;
- `CollectionCover_sizes` CHECK `("originalSizeBytes" > 0 AND "derivedSizeBytes" >= 0)`;
- `CollectionCover_ready_dimensions` CHECK `((status = 'READY') = (width IS NOT NULL AND height IS NOT NULL))`;
- `UploadSession_purpose_actor` CHECK `((purpose = 'CONTENT') = ("guestSessionId" IS NOT NULL AND "guestLinkId" IS NOT NULL) AND (purpose = 'COVER') = ("uploaderUserId" IS NOT NULL))`;
- `UploadSession_cover_is_photo` CHECK `(purpose <> 'COVER' OR kind = 'PHOTO')`.

**Storage port:** `copyObject(fromKey: string, toKey: string, contentType: string): Promise<void>` — throws when the source is missing (callers treat it like any storage failure, `503 DEPENDENCY_UNAVAILABLE`).

- [ ] **Step 1: Failing tests:** `database.e2e.spec.ts`: each new CHECK violated by one insert and named by `constraintViolation()`; a second `CollectionCover` for the same collection → unique violation; deleting the collection cascades to its cover; a `COVER` upload row without `uploaderUserId` and a `CONTENT` row without `guestSessionId` are refused; existing upload tests still pass unchanged. `storage.e2e.spec.ts`: `copyObject` of `photo.jpg` → `head(toKey)` has the same size and `contentType: 'image/jpeg'` on SeaweedFS; copying a missing key throws.
- [ ] **Step 2:** FAIL → edit the schema, `prisma migrate dev --create-only --name collection_cover`, append SQL, `pnpm db:migrate`; implement `copyObject`; narrow the nullable reads.
- [ ] **Step 3:** `pnpm --filter @stepler/api test && pnpm db:check` → PASS; `pnpm --filter @stepler/api typecheck` → PASS.
- [ ] **Step 4:** Commit `feat(api): collection cover schema, upload purpose and storage copy`.

### Task 3: Welcome message, cover in the collection DTO, cover bytes in usage

**Files:**
- Create: `apps/api/src/collections/cover-keys.ts`, `apps/api/src/collections/cover-urls.ts`
- Modify: `apps/api/src/collections/collection-dto.ts`, `collections.service.ts` (`update` passes `welcomeMessage`; `toDto`/`list` async with cover URLs), `collections.module.ts`, `apps/api/src/content/media-urls.ts` (public `signInline`), `apps/api/src/limits/usage.service.ts`, `apps/api/src/guest-access/guest-sessions.service.ts` (`buildContext` includes `welcomeMessage` and the guest cover), `openapi.json`
- Modify: `apps/api/test/collections.e2e.spec.ts`, `apps/api/test/quotas.e2e.spec.ts`, `apps/api/test/guest-sessions.e2e.spec.ts`

**Interfaces — produces:**
- `coverPrefix(collectionId, coverId) = 'collections/{cid}/cover/{coverId}/'`; `coverKey(collectionId, coverId, role: 'original' | 'thumbnail' | 'preview')` → `…/original`, `…/thumbnail.webp`, `…/preview.webp`; `COVER_DERIVED_MIME = 'image/webp'`.
- `MediaUrls.signInline(key: string, mimeType: string, now?: Date): Promise<string>` (window-aligned, `inline`; the existing private `inline` uses it).
- `CoverUrls.forAdmin(cover: CollectionCoverRow | null): Promise<CollectionCover | null>` (URLs only when `READY`), `CoverUrls.forGuest(cover): Promise<GuestContext['collection']['cover']>` (`null` unless `READY`).
- `WITH_DEFAULT_LINK` gains `cover: true`; `toCollectionDto(row, content, cover: CollectionCover | null)`; every caller passes the mapped cover (`create` passes `null`).
- `UsageService.collectionStorageBytes` / `accountStorageBytes` add `COALESCE(SUM("originalSizeBytes" + "derivedSizeBytes"), 0)` over `CollectionCover` of the collection / of the owner's non-`DELETING` collections.

- [ ] **Step 1: Failing tests:** `PATCH {welcomeMessage: 'Вітаємо!'}` → `200` with it; `161` code points → `400 VALIDATION_FAILED`; `{welcomeMessage: null}` clears; `GET /collections` items carry `welcomeMessage` and `cover: null`; a seeded `READY` cover row → `cover.status 'READY'` with two `https?://` URLs and dimensions, a `PENDING` one → URLs `null`; two reads in one window → identical URLs. Quota: a `READY` cover row of 6 MB + a 6 MB reservation against a 10 MB collection limit → `assertCanReserve` throws `QUOTA_EXCEEDED`; `/me/usage` includes the cover bytes. Guest: context carries `collection.welcomeMessage` and `collection.cover` with URLs for a `READY` cover and `cover: null` for a `PENDING` one; the body has no `status`/`source` key under `collection.cover`.
- [ ] **Step 2:** FAIL → implement → PASS; `pnpm openapi:write`.
- [ ] **Step 3:** Commit `feat(api): welcome message and cover on collection and guest DTOs; cover bytes in usage`.

### Task 4: Admin cover upload (initiate, parts, complete, cancel) [A1][A3]

**Files:**
- Create: `apps/api/src/uploads/upload-inspector.ts` (extracted from `upload-completion.ts`: `assemble`, `inspect`, `Verdict`, `SIGNATURE_BYTES`), `apps/api/src/collections/cover-uploads.service.ts`, `apps/api/src/collections/covers.service.ts` (the `replace` primitive; routes for from-frame and remove come in Task 5), `apps/api/src/collections/cover.controller.ts`
- Modify: `apps/api/src/uploads/upload-completion.ts` (uses `UploadInspector`), `uploads.module.ts` (exports `UploadInspector`), `collections.module.ts`, `apps/api/src/jobs/job-names.ts` (`'media.cover-derivatives': { collectionId; coverId }`, `'cover.purge': { collectionId; coverId }`, options MEDIA / PURGE, entity key `coverId`), `job-names.spec.ts`, `openapi.json`
- Create: `apps/api/test/cover-uploads.e2e.spec.ts`

**Interfaces — produces:**
- `UploadInspector.inspect(row: UploadSession): Promise<Verdict>` — exactly today's step 2 (assemble parts → head → 4 KB signature); `Verdict = { kind: 'file'; mime; size } | { kind: 'refuse'; error: AppError }`; throws `UPLOAD_INCOMPLETE` with `missingPartNumbers`.
- `CoversService.replace(tx, collectionId, cover: { id: string; source: CoverSource; mimeType: string; originalSizeBytes: bigint }, reserve?: () => Promise<void>): Promise<void>` — deletes the existing row (if any) and enqueues `cover.purge` for its id, runs `reserve` (the quota check, once the old bytes no longer count; the upload completion passes none, its reservation was made at initiation), inserts the new row (`PENDING`), enqueues `media.cover-derivatives`. Caller holds the collection row lock and has called `jobs.ready()`.
- `CoversService.lockMutable(tx, a: AccountPrincipal, collectionId): Promise<{ id: string; ownerId: string }>` — `SELECT … FOR UPDATE` of the owned non-`DELETING` collection (else `404`), `ARCHIVED` → `409 COLLECTION_ARCHIVED` [A6].
- `MAX_OPEN_COVER_UPLOADS = 3`.
- `CoverUploadsService`:
  - `initiate(a, collectionId, body: CreateUploadRequest): Promise<UploadSessionResponse>` — `fileTypeFor` must give `PHOTO` (else `422 FILE_TYPE_NOT_ALLOWED`; a video or document is refused here), size ≤ `fileRules().fileBytes.PHOTO` (`422 FILE_TOO_LARGE`), replay by `(uploaderUserId, clientUploadId)` as the guest service does, open `COVER` uploads of this collection ≥ 3 → `429 RATE_LIMITED`; `createMultipart` then the transaction, in lock order [C9]: the owned collection's `ownerId` by a plain read (else `404`) → `lockOwner(ownerId)` → `lockMutable` → `assertCanReserve` → insert `{ purpose: 'COVER', uploaderUserId: a.userId, collectionId, kind: 'PHOTO', … }` (key `uploadKey(collectionId, id)`); `201`.
  - `presignParts(a, collectionId, uploadId, partNumbers)` and `cancel(a, collectionId, uploadId)` — as the guest ones over `findCoverUpload(tx, a, collectionId, uploadId)` (`purpose = 'COVER' AND uploaderUserId = a.userId AND collectionId`, collection owned; else `404`).
  - `complete(a, collectionId, uploadId): Promise<Collection>` — claim (`COMPLETED` → return the collection now; closed states as the guest flow; `ARCHIVED` → close `REJECTED` with `409 COLLECTION_ARCHIVED`) → `inspector.inspect` outside any transaction (missing parts give the claim back) → `coverId = uuidv7()`, `copyObject(row.storageKey, coverKey(cid, coverId, 'original'), verdict.mime)` → transaction: re-check the claim, `lockMutable`, `covers.replace(tx, …, { id: coverId, source: 'UPLOAD', mimeType: verdict.mime, originalSizeBytes })`, session `COMPLETED` (`contentItemId` stays `null`) → after commit `storage.delete(row.storageKey)` best-effort (logged on failure) → `collections.get(a, collectionId)`. A refusal (`verdict.refuse`) closes the session `REJECTED` and enqueues `storage.discard-upload`, as today.
- Routes (admin session guard, `@ApiTags('Collections')`): `POST /collections/:id/cover/uploads` (201), `POST /collections/:id/cover/uploads/:uploadId/parts` (200), `POST /collections/:id/cover/uploads/:uploadId/complete` (200 `collectionSchema`), `DELETE /collections/:id/cover/uploads/:uploadId` (204).

- [ ] **Step 1: Failing tests** (`cover-uploads.e2e.spec.ts`, SeaweedFS; the test env already uses a 5 MiB part size):
  - `photo.jpg`: initiate → parts → PUT → complete → `200` `cover.status 'PENDING'`, one `CollectionCover` row (`source UPLOAD`, `mimeType image/jpeg`, size = file size), one `media.cover-derivatives` job, the object at `coverKey(…, 'original')` with the file's size, the upload key gone, session `COMPLETED`;
  - `photo.heic` with `mimeType: ''` → accepted (`image/heic`); complete twice (`Promise.all`) → one row, the second answer `200` or `409 UPLOAD_IN_PROGRESS`; completing again afterwards → `200`, still one row, no second copy;
  - `clip.mp4` → initiate `422 FILE_TYPE_NOT_ALLOWED`; `doc.pdf` → `422`; a 60 MB declared photo → `422 FILE_TOO_LARGE`; `fake.jpg` bytes → complete `422 FILE_TYPE_NOT_ALLOWED`, session `REJECTED`, discard job queued, no cover row;
  - a second upload completed while a cover exists → the old row deleted, a `cover.purge` job with the old id, the new row `PENDING`;
  - 4th open cover upload → `429 RATE_LIMITED`; cancel → `204`, `ABORTED`, discard job; `uploads.expire` handler expires a stale cover upload;
  - **Review Focus 4:** collection limit 10 MB with a 6 MB guest photo present → a 6 MB cover initiate `409 QUOTA_EXCEEDED`; after the admin deletes the photo it succeeds;
  - archived collection → initiate `409 COLLECTION_ARCHIVED`; archived between PUT and complete → complete `409 COLLECTION_ARCHIVED`, session `REJECTED`, discard queued;
  - **Review Focus 3:** admin B on A's collection → `404` on all four routes (and with A's upload id); a guest cookie without an admin session → `401 UNAUTHENTICATED`; no presigned URL in any error body; captured logs contain no `X-Amz-Signature`.
  - existing `uploads*.e2e.spec.ts` unchanged and green (the inspector extraction is behaviour-preserving).
- [ ] **Step 2:** FAIL → implement → PASS; `pnpm openapi:write`.
- [ ] **Step 3:** Commit `feat(api): admin cover upload through purpose-scoped upload sessions`.

### Task 5: Cover from a frame, cover removal [A8]

**Files:**
- Modify: `apps/api/src/collections/covers.service.ts` (`setFromFrame`, `remove`), `cover.controller.ts`, `openapi.json`
- Create: `apps/api/test/covers.e2e.spec.ts`

**Interfaces — produces:**
- `CoversService.setFromFrame(a, collectionId, contentItemId): Promise<Collection>` — `jobs.ready()`; item `findFirst({ id, collectionId, deletedAt: null, collection: ownedBy(a) }, include WITH_MEDIA)` else `404`; `kind !== 'PHOTO'`, no ORIGINAL, or `processingStatus === 'FAILED'` → `422 COVER_SOURCE_INVALID`; `coverId = uuidv7()`; `copyObject(original.storageKey, coverKey(cid, coverId, 'original'), original.mimeType)`; transaction, in lock order [C9]: `lockOwner(item.collection.ownerId)` → `lockMutable` → delete the old cover row first → `assertCanReserve({ bytes: original.sizeBytes })` → insert + jobs (`replace` takes a `reserve` callback that runs between the delete and the insert); on any error after the copy delete the copied key best-effort; returns `collections.get`.
- `CoversService.remove(a, collectionId): Promise<void>` — `jobs.ready()`; transaction: `lockMutable` → existing row → delete + `cover.purge`; no row → no-op; `204`.
- Routes: `POST /collections/:id/cover/from-frame` (`setCoverFromFrameRequestSchema`, 200 `collectionSchema`; errors 404, 409 `COLLECTION_ARCHIVED`, 409 `QUOTA_EXCEEDED`, 422 `COVER_SOURCE_INVALID`, 503), `DELETE /collections/:id/cover` (204; 404; 409 `COLLECTION_ARCHIVED`).

- [ ] **Step 1: Failing tests** (`covers.e2e.spec.ts`; frames seeded through the guest upload helpers `uploadCalls`/`uploadFile` + complete):
  - a completed `photo.jpg` frame → from-frame `200` `cover.status 'PENDING'`, `source FRAME`, the cover original has the frame's size and `image/jpeg`, a derivatives job; the frame's own row and objects unchanged;
  - **Review Focus 1:** after that, admin `DELETE /content/{id}` and a run of `PurgeContentHandler` → the frame's keys are gone, the cover row and `coverKey(original)` remain;
  - a TEXT frame → `422 COVER_SOURCE_INVALID`; a `FAILED` photo → `422`; a deleted frame → `404`; **Review Focus 3:** a frame of another owner's collection (its real id) → `404`, nothing copied (no object under the collection's `cover/` prefix); admin B → `404`;
  - **Review Focus 4:** collection limit set so the frame's bytes do not fit twice → `409 QUOTA_EXCEEDED` and no object left under `cover/`; remove the cover → `204`, row gone, `cover.purge` job, usage down by the cover's bytes at once; remove again → `204`;
  - replacing a `FRAME` cover with another frame → old id in a `cover.purge` job, exactly one row;
  - archived → from-frame and remove `409 COLLECTION_ARCHIVED`;
  - guest context after a `READY` cover (status set directly) shows `collection.cover` URLs; after remove → `null`.
- [ ] **Step 2:** FAIL → implement → PASS; `pnpm openapi:write`.
- [ ] **Step 3:** Commit `feat(api): make a guest photo the collection cover; remove the cover`.

### Task 6: Worker — cover derivatives and cover purge

**Files:**
- Create: `apps/api/src/worker/handlers/cover-derivatives.handler.ts`, `apps/api/src/worker/handlers/purge-cover.handler.ts`
- Modify: `apps/api/src/worker/job-runner.ts` (register both; `media.cover-derivatives` takes the media concurrency like the other `media.*` jobs), `worker.module.ts`
- Modify: `apps/api/test/worker-media.e2e.spec.ts`, `apps/api/test/worker-handlers.e2e.spec.ts`

**Interfaces — produces:**
- `CoverDerivativesHandler.handle({ collectionId, coverId })` — row `findFirst({ id: coverId, collectionId })` else return; `slots.run(withWorkDir(…))`: `downloadToFile(coverKey(original))` (missing → `PermanentMediaError`), `decodeHeic` when `needsHeifDecoder(mimeType)`, `renderDerivatives(decoded, { autoOrient: !heic })`, `putObject` thumbnail and preview at their `coverKey`s, then one `updateMany({ where: { id: coverId, status: 'PENDING' }, data: { status: 'READY', width, height, derivedSizeBytes } })`; `count === 0` (replaced or removed meanwhile) → `deleteMany` of the two keys written. `PermanentMediaError` → `markFailed` (only a `PENDING` row becomes `FAILED`); `onFinalFailure` → the same.
- `PurgeCoverHandler.handle({ collectionId, coverId })` — if `collectionCover.findUnique({ id: coverId })` exists → skip (never purge a live cover); else `deletePrefix(storage, coverPrefix(collectionId, coverId), WORKER_PURGE_BATCH_SIZE)`.

- [ ] **Step 1: Failing tests:** `photo.jpg` cover → two WebP objects (thumbnail longest side 480, preview ≤ 1600), `READY`, `width/height` of the source, `derivedSizeBytes` = sum of both objects, the thumbnail has no EXIF; `photo.heic` → `READY`; run twice → same two keys, still one row; **Review Focus 2:** the row deleted before `handle` finishes (delete it inside a stubbed `putObject`) → no update, the two written keys are gone; a corrupt original → `FAILED`, original kept; `PurgeCoverHandler` with a live row → objects kept; with no row → the prefix emptied, running again succeeds; **Review Focus 1:** `PurgeCollectionHandler` on a `DELETING` collection with a `READY` cover → no key left under `collections/{cid}/`.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Commit `feat(worker): cover thumbnails and previews; purge of replaced covers`.

### Task 7: API docs, verification and PR F

**Files:**
- Docs: `docs/architecture/mvp-architecture-spec.md` (§1 scope note: "admin uploads via UI" stays out of MVP except the collection cover; §7.2 `Collection.welcomeMessage` + `CollectionCover`; §7.3 `UploadSession.purpose/uploaderUserId`; §8 table row "Upload files: Admin — the collection cover only"; §9 resource map with the six routes and the `PATCH` field; §10.6 key layout + a new §10.7 "Admin cover upload" paragraph; §11 job list; §13.2 usage includes cover bytes), ADR 0008 "Addendum (2026-10-04): the collection cover shares the upload session (`purpose = COVER`)", ADR 0009 "Implementation notes (covers)", `BOOTSTRAP.md` (slice 8a status, PR F)
- No env changes (nothing in README / `.env.example` / `turbo.json`).

- [ ] **Step 1:** Batched minors from Tasks 1–6 (one commit).
- [ ] **Step 2: Full verification:** `pnpm format:check && pnpm turbo run lint typecheck test build && pnpm db:check && pnpm e2e` (existing journeys must stay green: the `Collection` DTO grew). Report results as they are.
- [ ] **Step 3:** Commit `docs: collection cover and welcome message (API); ADR 0008/0009 addenda`; open PR F → `dev` with decisions A1–A10 as answered and test evidence.

**Checkpoint (API review, after Task 5):** one independent review of Tasks 2–5 focused on Review Focus 1, 3 and 4, the lock order (owner → collection), and the copy-then-record ordering (no row without an object, no object without a row beyond the best-effort deletes, which are listed in the ADR addendum).

---

## PR G — UI component, screens, journeys, product docs

### Task 8: `CollectionCover` (packages/ui)

**Files:**
- Create: `packages/ui/src/components/collection-cover.tsx`, `collection-cover.stories.tsx`
- Modify: `packages/ui/src/components/tint-tile.tsx` (JSDoc: the cover slot is `CollectionCover`), `docs/ux/design-system.md` (new row; `TintTile` row amended)

**Interfaces — produces (props):**
- `CollectionCover`: `tint: FrameTint`, `initials: string`, `image?: ReactNode` (the caller's `<img alt="">`, e.g. `MediaImg`; when present it fills the slot with `object-cover`), `size: 'sm' | 'cover' | 'hero'` (`sm` 44 px and `cover` 80/128 px are `TintTile`'s squares with the same radius and 1 px edge; `hero` is `w-full aspect-[4/3] rounded-sheet` — the full width of its column), `className?`. Decorative (`aria-hidden`), `data-slot="collection-cover"`, `data-state="initials" | "image"`. Without `image` it renders `TintTile` with the initials; with it, a clipped box around the image on the `--muted` background (so a slow image never flashes the tint).

- [ ] **Step 1: Design pass** (the four skills); header comment.
- [ ] **Step 2: Failing stories with play + axe:** `Initials` (every size, `data-state="initials"`, the tint's `data-tint`), `Image` (a `sample-photo` `<img>` fills the box, `data-state="image"`, the image is `aria-hidden` through the wrapper), `Hero` at 360 and 1024 container widths (aspect ratio 4:3 asserted from `getBoundingClientRect`), `AllTints`.
- [ ] **Step 3:** `pnpm --filter @stepler/ui test` → FAIL → implement → PASS; `pnpm --filter @stepler/ui build-storybook` → PASS.
- [ ] **Step 4:** Commit `feat(ui): CollectionCover with the initials fallback`.

### Task 9: Cover and welcome where guests and the dashboard see them (web)

**Files:**
- Modify: `apps/web/src/app/app/collection-card.tsx` (`CollectionCover size="cover"` with `MediaImg` from `cover.thumbnailUrl` when `cover?.status === 'READY'`, `onExpired` → invalidate the collections lists), `apps/web/src/app/app/collections/[id]/share-dialog.tsx` (`CollectionCover size="sm"` left of the `DialogTitle` [A7]), `apps/web/src/guest/guest-page.tsx` (hero and welcome), `apps/web/messages/{uk,en}.json` (`guest.coverAlt` unused — the image is decorative: `alt=""`; `guest.welcomeLabel` for the `aria-label` of the welcome paragraph's region)
- Create: `apps/web/src/app/app/collection-cover-image.tsx` (`CollectionCoverImage({ collection, size })`: picks the thumbnail for `sm`/`cover` and the preview for `hero`, renders `CollectionCover` with `collectionTint`/`collectionInitials`; used by the admin screens), `apps/web/src/guest/guest-cover.tsx` (the same for `GuestContext['collection']`: hero only when `cover !== null`)

**Behaviour** (DESIGN-SYSTEM §6.1, §6.5; [A4], [A7]):
- Guest header: the hero (4:3, `previewUrl`, `loading="eager"`, `decoding="async"`, `width`/`height` from the DTO so nothing shifts) **above the h1** when a cover exists; nothing otherwise. The welcome message as a `<p>` after the counts line and before the actions block, `text-pretty`, 17 px, foreground colour, `[overflow-wrap:anywhere]`; hidden when `null`.
- Dashboard card: the cover image in the same slot and sizes as the initials tile.
- Share dialog: the 44 px mark beside the title; nothing else moves.

- [ ] **Step 1: Design pass**; header comments in `guest-page.tsx` (amend) and `collection-cover-image.tsx`.
- [ ] **Step 2:** Implement; `pnpm --filter @stepler/web test lint typecheck` → PASS; screenshots: guest with and without cover, with a 160-char welcome, at 360/390/1440 light and dark; dashboard card with a cover; share dialog.
- [ ] **Step 3:** Commit `feat(web): cover on the dashboard card, share dialog and guest hero; welcome message for guests`.

### Task 10: The «Вигляд» tab — cover card with upload, removal and the welcome form (web)

**Files:**
- Create: `apps/web/src/app/app/collections/[id]/appearance/appearance-tab.tsx`, `cover-card.tsx`, `cover-state.ts` (+ `cover-state.test.ts`), `use-cover-upload.ts`, `welcome-form.tsx`, `welcome-form.ts` (+ test)
- Modify: `apps/web/src/app/app/collections/[id]/collection-overview.tsx` (`CollectionTab` += `'appearance'`, `tabOf`, a `Palette` segment «Вигляд» after «Посилання», `?tab=appearance`), `collection-overview.test.ts` if present (else add `tabOf` cases to a new test), `apps/web/src/api/collections.ts` (`coverUploadApi(collectionId): UploadApi<Collection>`, `removeCover(id)`, `setCoverFromFrame(id, contentItemId)` — the last used in Task 11), `apps/web/src/guest/upload/transport.ts` (`UploadApi<TResult = GuestContentItem>`; `upload<TResult>(…, api: UploadApi<TResult>, …): Promise<TResult>`; no behaviour change), `apps/web/messages/{uk,en}.json` (`collection.tabs.appearance` «Вигляд», new `appearance.*`)

**Interfaces — produces:**
- `coverState(cover: Collection['cover'], upload: UploadPhase): 'none' | 'uploading' | 'failed-upload' | 'processing' | 'failed' | 'ready'` where `UploadPhase = { kind: 'idle' } | { kind: 'uploading'; progress: number } | { kind: 'failed'; code: ErrorCode | 'NETWORK' | 'STORAGE_403' }`.
- `useCoverUpload(collectionId): { phase: UploadPhase; start(file: File): void; retry(): void; cancel(): void }` — pre-check with `fileTypeFor` only (must be `PHOTO`, else the message `appearance.cover.wrongType` and nothing is sent); the size limit is the API's answer (`422 FILE_TOO_LARGE` → `errorMessageKey`), since the admin has no limits object like `GuestContext`. One `createUploadTransport()`; `clientUploadId = crypto.randomUUID()` kept across retries; on success `setQueryData(collectionKey(id))` with the returned collection and invalidate the lists; `beforeunload` guard while uploading (`useLeaveGuard`).
- `welcomeFormSchema = z.object({ welcomeMessage: z.string().trim().refine(codePointLength ≤ 160) })` (plain string for a controlled field) and `toWelcomeRequest(values): UpdateCollectionRequest` (`''` → `null`); `WELCOME_MAX = WELCOME_MESSAGE_MAX_CHARS`.
- `AppearanceTab({ collection })`: two `SectionCard`s (lifted from `collection-settings.tsx` into `apps/web/src/app/app/collections/[id]/section-card.tsx`): 1 «Обкладинка» — `CoverCard`; 2 «Привітання для гостей» — `WelcomeForm`. Archived: both read-only (an `Alert` «Архівну колекцію не можна змінювати» replaces the actions; the welcome text is shown as text) [A6].
- `CoverCard` states (`coverState`): `none` — the initials tile (`CollectionCoverImage size="hero"` in a 420 px max column) with «Завантажити зображення» (ink; a hidden `<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif">`, named by the button) and «Вибрати з кадрів» (outline; opens the picker from Task 11; `aria-disabled` with the line «Ще немає фото від гостей» when `counts.photo === 0`); `uploading` — the tile dimmed, `Progress` with «{percent}%» and «Скасувати»; `failed-upload` — the reason (`errorMessageKey`) and «Повторити»; `processing` — the tile with a spinner line «Готується обкладинка…» (refetch every 10 s while `PENDING`, up to 30 min, only while visible); `failed` — `Alert` «Не вдалося підготувати обкладинку. Спробуйте інше зображення.» with «Замінити» and «Видалити»; `ready` — the preview image, «Замінити» (a `DropdownMenu`: «Завантажити зображення», «Вибрати з кадрів») and «Видалити обкладинку» (ghost destructive → `ConfirmDialog` «Видалити обкладинку? На її місці знову будуть ініціали колекції.» → toast «Обкладинку видалено»). Toasts: «Обкладинку завантажено — готується», «Обкладинку оновлено».
- `WelcomeForm`: `Textarea` (2 rows, `maxLength` unset — the counter and the schema decide), a counter «{n} з 160» from 120, hint «Один-два рядки без форматування. Гості побачать його над кнопкою додавання.», «Зберегти» (ink, disabled until dirty and valid) and «Прибрати» (ghost, only when a message exists; saves `null`); optimistic update like `inline-edit.tsx`; toast «Збережено».

- [ ] **Step 1: Design pass**; header comment in `appearance-tab.tsx`.
- [ ] **Step 2: Failing unit tests:** `tabOf('appearance') === 'appearance'`, `tabOf('x') === 'content'`; `coverState` table (no cover + idle → `none`; `PENDING` → `processing`; `FAILED` → `failed`; `READY` + uploading → `uploading`); `welcomeFormSchema`: 160 emoji pass, 161 fail, `'  '` → `null` request; `transport.test.ts` still green after the generic.
- [ ] **Step 3:** FAIL → implement → PASS; screenshots of every cover state and the form at 360/390/1440, light and dark.
- [ ] **Step 4:** Commit `feat(web): «Вигляд» tab with cover upload, removal and the welcome message`.

### Task 11: Frame picker and «Зробити обкладинкою» in the viewer (web)

**Files:**
- Create: `apps/web/src/app/app/collections/[id]/appearance/cover-picker.tsx`
- Modify: `apps/web/src/app/app/collections/[id]/content/content-viewer.tsx` (`onSetCover?: (item: AdminContentItem) => Promise<void>`; the action «Зробити обкладинкою» (`ImageIcon`) between «Завантажити» and «Видалити» for `PHOTO` items with a `thumbnailUrl`), `content/content-tab.tsx` (wires `setCoverFromFrame` with a toast «Обкладинку оновлено», invalidates `collectionKey` and the lists; `COVER_SOURCE_INVALID`/`QUOTA_EXCEEDED` → error toast via `errorMessageKey`), `appearance/cover-card.tsx` («Вибрати з кадрів» opens the picker), `apps/web/messages/{uk,en}.json`

**Interfaces — produces:**
- `CoverPicker({ collectionId, open, onOpenChange, onPicked(item: AdminContentItem): Promise<void> })` — a bottom `Sheet` below 640 px, a `Dialog` (max 46 rem) from 640; title «Виберіть фото для обкладинки»; `listContent(collectionId, { kind: 'PHOTO' })` as an infinite query with «Показати ще»; a `FrameGrid` of `Frame`s in single-select mode (`selectable`, `aria-pressed`, the selected one ringed; frames without a thumbnail rendered `kind="pending-preview"` and not selectable); footer «Зробити обкладинкою» (ink, disabled until one is selected) and «Скасувати»; empty → `EmptyState` «Гості ще не додали фото»; error → `Alert` + «Спробувати ще». Focus returns to the opener.

- [ ] **Step 1: Design pass**; header comment in `cover-picker.tsx`.
- [ ] **Step 2:** Implement; `pnpm --filter @stepler/web lint typecheck test` → PASS; screenshots: picker at 360 (sheet) and 1440 (dialog), the viewer action.
- [ ] **Step 3:** Commit `feat(web): pick a guest photo as the cover from the viewer or a picker`.

### Task 12: Journeys, product docs, verification and PR G

**Files:**
- Create: `e2e/tests/appearance.spec.ts`; Modify: `e2e/support/collections.ts` (`setCoverFromFrameViaApi(page, id, contentItemId)`, `updateCollectionViaApi(page, id, body)`, `waitForCoverReady(page, id, timeoutMs = 30_000)` polling `GET /api/v1/collections/{id}`)
- Docs: `docs/product/PRODUCT.md` (§5.3 "optional cover image and welcome message"; §5.4 "set the cover and welcome message"; §6.2 guest landing "+ welcome message, cover"; §24.3 remove the two items with the note "moved into MVP by owner decision 2026-10-04"), `docs/product/mvp.md` (two new rows under Must have: "Collection cover — built in slice 8a: upload or a guest photo, replace, remove" and "Guest welcome message — built in slice 8a: one paragraph up to 160 characters"), `docs/product/post-mvp.md` (Branding: "cover images" and "custom welcome screens" struck with the same note; themes and branded guest experience stay), `docs/design/DESIGN-SYSTEM.md` (§5.10 `CollectionCover`; §6.1 hero + welcome; §6.6 the fourth tab; §12.12 closed: admin cover by upload or frame, no automatic newest-photo cover), `docs/ux/design-system.md` (screens list), `docs/architecture/mvp-architecture-spec.md` §4 (routes note), `BOOTSTRAP.md` (slice 8a done)

- [ ] **Step 1: Failing journeys:**
  - `@desktop` cover by upload: sign in, create a collection, open `?tab=appearance`, set `photo.jpg` on the file input → «Готується обкладинка…» → within 30 s the cover image (`[data-slot="collection-cover"][data-state="image"] img` with `naturalWidth > 0`); `/app` → the card's cover slot shows the image; back on the tab «Видалити обкладинку» → confirm → the card shows initials again (`data-state="initials"`).
  - `@desktop` from the viewer: a guest (`openGuestLink`) uploads `photo.jpg` via `uploadViaApi`; the admin opens the frame in «Вміст» → «Зробити обкладинкою» → toast «Обкладинку оновлено» → the «Вигляд» tab shows processing then ready; the picker in «Замінити → Вибрати з кадрів» lists the frame.
  - all projects — the guest sees it: the admin sets the welcome «Дякуємо, що ви з нами!» (`updateCollectionViaApi`) and the cover from the guest's frame (`setCoverFromFrameViaApi` + `waitForCoverReady`); the guest reloads → the hero image is visible above the h1, the welcome text is visible; **Review Focus 5:** `horizontalOverflow(guest) === 0` at the project's width with a 160-character welcome.
  - all projects — the «Вигляд» tab at phone width: no horizontal overflow, the picker opens as a sheet, its «Зробити обкладинкою» is ≥ 44 px tall.
  - **Review Focus 1 (journey):** after the cover came from a frame, the guest deletes that frame («Ваші кадри» → «Видалити») → the admin's dashboard card still shows the cover image.
- [ ] **Step 2:** `pnpm e2e` → FAIL where missing → fix in the owning tasks' files → PASS on all projects; record shard durations in the PR body.
- [ ] **Step 3:** Batched minors (one commit); docs above.
- [ ] **Step 4: Full verification:** `pnpm format:check && pnpm turbo run lint typecheck test build build-storybook && pnpm db:check && pnpm e2e`. Report results as they are.
- [ ] **Step 5:** Owner design review of the screenshots from Tasks 9–11; feedback in one `fix(web): … after design review` commit.
- [ ] **Step 6:** Commit `docs: collection cover and welcome message moved into MVP; design system`; open PR G → `dev`. After merge, promote `dev → stage` (no owner action: no new env, bucket CORS and lifecycle already cover the admin's multipart PUTs).

## Checkpoints

- After **Task 5**: one independent API/authorization review (see the note under Task 7).
- Before PR G: the owner's design review of the screenshots; feedback in one commit.
- After each PR: one whole-branch review, one fix round, merge to `dev` with a merge commit.

## Doc conflicts this plan resolves (to record in the docs it touches)

1. **PRODUCT.md §24.3 and post-mvp.md** list "cover image" and "custom welcome message / screens" as post-MVP; the owner pulled both into MVP on 2026-10-04 → Task 12 moves them (mvp.md, PRODUCT.md §5.3/§5.4/§6.2) and leaves themes and branding post-MVP.
2. **DESIGN-SYSTEM §12.12** default "no cover; the newest frame as cover" and the `TintTile` docs ("the newest photo replaces it in slice 7", "an admin cover later in the same slot") → an explicit admin cover (upload or frame) in the same slot; no automatic newest-photo cover is built → §12.12 closed in Task 12, `TintTile`/`CollectionCover` rows in Task 8.
3. **The brief** names the share dialog and the "link sheet summary" as places that show initials today; the code shows initials only on the dashboard card. Resolved by [A7] (share dialog gets the mark; links sheet untouched) — confirmed 2026-10-04.
4. **Spec §1** puts "admin uploads via UI" out of MVP scope and **§8** marks admin uploads "— (MVP)"; the cover is an admin upload → noted as the one exception (cover only, never content) in Task 7.
5. **Spec §7.3** claims `contributorUserId` exists on `ContentItem`; it does not ([C19]). Unchanged by this plan (the admin's file is a cover, not content); the admin identity lands on `UploadSession.uploaderUserId`, which matches the spec's own `UploadSession … userId?` draft → wording fixed in Task 7.
6. **D9 (archived collections stay editable)** vs the owner's "read-only tab": resolved by [A6] (cover mutations refused, the welcome text still accepted by `PATCH`, the tab read-only) — confirmed 2026-10-04.

## Out of scope

- Automatic cover from the newest photo; cropping, focal point or repositioning; themes, colours, typography, guest-side branding, custom upload instructions (PRODUCT §24.3 remainder).
- A cover on the admin collection header (stays textual by owner decision) and in the links sheet ([A7]).
- Admin uploads of content (frames), bulk download, reports, legal pages (slice 9–10).
