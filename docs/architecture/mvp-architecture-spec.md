# Stepler — MVP Architecture Specification

Status: **Accepted** (2026-09-29). Items marked [verify] remain subject to their spikes.
Date: 2026-09-29

Sources:
- `docs/product/PRODUCT.md` (canonical product specification)
- `docs/product/mvp.md`, `user-stories.md`, `acceptance-criteria.md`
- `docs/architecture/discovery-questions.md` (owner answers Q1–Q4, D1–D15, F1–F8)
- `CLAUDE.md`, `.claude/rules/*`, ADR 0001–0003

This document describes accepted target architecture. Nothing here is implemented yet.
Items marked **[verify]** depend on a technical spike before they can be relied on (§20).
Items marked **[assumption]** are low-risk defaults chosen by engineering; the owner may override them.

---

## 1. Scope

MVP validates the loop: **create collection → share link/QR → guests contribute → admin manages content**.

In scope: admin auth (magic link + Google), collections, default + additional guest links, guest sessions, photo/video/document upload, text submission, gallery visibility, own-content deletion, admin deletion, QR, thumbnails/posters, content reports + operator flow, limits/rate limits, uk/en i18n, legal pages, staging/production-ready images, CI.

Out of scope for MVP (post-MVP): billing/payments, folders, retention policies, analytics, ZIP/export, transcoding, moderation queue, link expiration, admin uploads via UI (one exception since slice 8a, 2026-10-04: the owner uploads the collection cover, never content), operator admin panel, form builder, resumable upload after browser close.

---

## 2. System overview

```text
                      ┌──────────────────────────┐
 Browser (guest/admin)│ same origin: https://<host>│
                      └──────┬──────────────┬─────┘
                             │ /            │ /api/*
                             v              v
                      Next.js (web)     NestJS (api) ──────► PostgreSQL (EU)
                                            │  │                 ▲
                                            │  └─ enqueue jobs ──┤ pg-boss tables
                                            │                    │
                                            │               worker (Node + sharp + ffmpeg)
                                            │                    │
                   presigned PUT/GET        v                    v
 Browser ─────────────────────────────► Cloudflare R2 (EU jurisdiction bucket)

 api ──► email provider (magic link)   api ──► Turnstile verify   api/web ──► error monitoring
```

- **Same-origin topology** [assumption]: web and api are served under one host; `/api/*` routes to NestJS through a streaming Next.js route handler (`app/api/[...path]/route.ts`, runtime-configured `API_INTERNAL_URL`, so one image works in every environment; build-time rewrites would bake the URL in, and middleware rewrites leak the internal URL and buffer bodies at 10 MB). Client-supplied forwarding headers are always dropped; behind an edge, the web forwards only the client IP from the header the edge overwrites (`CLIENT_IP_HEADER`, Render: `cf-connecting-ip`, ADR 0014). The API builds public URLs from configured origins, never from request `Host`/forwarded headers. An ingress/reverse proxy may take over this routing in deployed environments, depending on the hosting decision. Removes CORS for the app, simplifies cookies. Uploads/downloads go to R2 directly, so the extra hop only carries small JSON.
- Direct browser → provider traffic exists only for: R2 transfer (ADR 0003) and Cloudflare Turnstile (ADR 0012).

---

## 3. Monorepo

```text
apps/
  web/        Next.js App Router — guest (/g/[token]) and admin (/app/...) UI
  api/        NestJS REST API
  (worker)    background jobs (processing, purge, expiry): apps/api/src/worker, a second entrypoint of api (Phase 4 [C2])
packages/
  contracts/  Zod schemas for API requests/responses, error codes, shared enums
  ui/         shared React components (shadcn/Radix/Tailwind) + Storybook
  config/     shared tsconfig / eslint / prettier presets
docker/       local infrastructure (compose files)
docs/
```

Tooling: pnpm workspaces, Turborepo, Node 24 LTS, TypeScript strict.

Trade-offs:
- `contracts` merges the previously planned `types` + `validation`: schemas and types always change together; splitting them creates a false boundary.
- Storybook lives in `packages/ui` next to the components. If page-level stories are needed later, move it to `apps/storybook`.
- The worker (`apps/api/src/worker/main.ts`, image `apps/api/worker.Dockerfile`) shares the Prisma client and domain modules with `api` by plain imports, not through HTTP. It is a second entrypoint of the same modular monolith, not a microservice. (Earlier drafts placed it in `apps/worker`; keeping it inside `apps/api` avoids moving the Prisma schema and client into a shared package, Phase 4 plan [C2].)
- Module format (spike S2, see ADR 0005): NestJS 12 is ESM-only, so `api`, `worker` and `contracts` are ESM. `contracts` is built with plain `tsc`. Prisma client uses the `prisma-client` generator with ESM output.

---

## 4. Frontend architecture (`apps/web`)

- **Routes:** `/g/[token]` guest entry; `/app/...` admin (protected); `/login`; `/legal/terms`, `/legal/privacy`. A collection's sections are tabs of `/app/collections/[id]` in the query (`?tab=links|appearance|settings`, none = the content); «Гостьова сторінка» (`appearance`, slice 8a) holds the cover and the welcome message, and the admin's cover file goes browser → storage through the same upload transport as a guest's (§10.7).
- **Rendering:** mostly client components with TanStack Query. Authorization and data are owned by the API; SSR data fetching would require forwarding cookies on every server fetch and offers little for authenticated/guest app screens. RSC is used for shells, metadata and static legal pages.
- **API client:** a thin typed `fetch` wrapper (`apps/web/src/api/client.ts`) that validates responses with the Zod schemas from `contracts`, the same schemas the API validates with; errors surface as `ApiError(code)`. No OpenAPI code generation: `openapi-typescript` 7.13 does not support TypeScript 6 (owner decision 2026-09-29, ADR 0005). Forms use the same schemas with React Hook Form. *Implemented in Phase 2.*
- **State:** server state in TanStack Query only. Upload queue state is local to the uploader feature (a store is introduced only if the queue must survive route changes — then Zustand, per rules).
- **Guest pages:** `Referrer-Policy: no-referrer`; **no third-party scripts** (token is in the URL). Mobile-first.
- **QR:** generated client-side (SVG/PNG) from the link URL — no data leaves the browser. Server-side generation can be added later for customization.
- **i18n:** see §16. No hardcoded user-facing strings.

---

## 5. Backend architecture (`apps/api`)

Feature modules (dependencies point one way; no cycles):

| Module | Responsibility |
|---|---|
| `auth` | magic link, Google OAuth, admin sessions, operator resolution, Turnstile verification |
| `users` | profile, locale, legal acceptances, account blocking |
| `collections` | CRUD, archive, delete orchestration, owner scoping |
| `guest-access` | guest links (create/permissions/deactivate/revoke/rotate), guest sessions |
| `content` | content items, gallery queries, deletion, signed download URLs |
| `uploads` | upload sessions, presigning, completion verification |
| `reports` | content reports, admin/operator actions |
| `limits` | effective limits, usage accounting (future entitlements seam) |
| `audit` | append-only audit events |
| `storage` | `ObjectStorage` port + S3/R2 adapter |
| `jobs` | job enqueue port (pg-boss adapter) |
| `mail` | `Mailer` port + provider adapter (Mailpit locally) |
| `health` | liveness/readiness |

Conventions:
- Controllers are thin: parse/validate → call a use-case service → map to response DTO.
- **Principal** is resolved by guards into one of:
  - `{ kind: 'admin', userId }`
  - `{ kind: 'operator', userId }` (an admin whose verified email is in the operator list)
  - `{ kind: 'guest', guestSessionId, collectionId, link: { id, permissions } }`
- **Authorization is expressed as pure policy functions** (`canDeleteContent(principal, item)`, …) — unit-testable, used by services.
- Scope comes from the principal: guest queries always filter by `principal.collectionId`; admin queries always filter by `ownerId = principal.userId`. Path IDs are lookups inside that scope, never the source of scope.
- Prisma is used from services/query classes. No generic repository layer on top of Prisma (it would duplicate the ORM's abstraction). Complex reads live in per-module query classes. (Deliberate deviation from the installed NestJS skill's `arch-use-repository-pattern`.)
- Multi-step writes use transactions. Invariants that PostgreSQL can enforce are enforced by constraints (§7).

---

## 6. Authentication

Decision details: ADR 0006.

- **Methods:** magic link (email) + Google OAuth. No passwords.
- **Registration:** open, protected by Turnstile on magic-link requests (ADR 0012), rate limits and account limits (§13).
- **Sessions:** opaque random token in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie; only its SHA-256 hash is stored. Revocable server-side. No JWT.
- **CSRF:** SameSite=Lax + every unsafe method must send `Origin` equal to `APP_ORIGIN` (403 `CSRF_ORIGIN_MISMATCH`), public routes included; future signed webhooks opt out with `@SkipOriginCheck()`. *Implemented in Phase 2.*
- **Magic link verification:** the email links to the web page `/auth/verify?token=…`. The page first calls a read-only `POST /auth/magic-link/preview` and shows "Sign in as <email>"; only the Sign in button calls `POST /auth/magic-link/verify`, which consumes the token. Email scanners that open links therefore cannot use them up, and a victim who opens an attacker's link sees a foreign address (owner decisions 2026-09-29). *Implemented in Phase 2.*
- **Account model:** `User` + `AuthAccount(provider, providerAccountId)` so more OAuth providers can be added without changing `User`. A Google identity is linked to an existing user by email only when Google reports the email as verified.
- **Operator:** users whose verified email is in `OPERATOR_EMAILS` config (ADR 0013).
- **Legal acceptance:** recorded at registration (§15). *Deferred to Phase 4 slice 10 (legal pages), with a gate that also covers users created before it (owner decision 2026-09-29).*
- **Implementation:** in-house (spike S1, ADR 0006: Better Auth stores session tokens in plain text and verifies magic links only by GET).

---

## 7. Domain model

Draft Prisma-level model. Final schema is written in the Collection/Guest Link slices; constraints marked `SQL` are added with raw SQL in migrations (verified in S6, ADR 0005: appended to `--create-only` migrations, explicitly named, no drift).

IDs: UUIDv7 (time-ordered), generated by the database: `@default(dbgenerated("uuidv7()")) @db.Uuid` (PostgreSQL 18, verified in S6).

### 7.1 Identity

```text
User
  id, email (citext, unique), emailVerifiedAt, displayName?, locale (uk|en, default uk),
  status (ACTIVE|BLOCKED), blockedAt?, blockedReason?, createdAt, updatedAt

AuthAccount
  id, userId → User (cascade), provider (google|email), providerAccountId, createdAt
  UNIQUE (provider, providerAccountId)

AuthSession
  id, userId → User (cascade), tokenHash (unique), expiresAt, lastUsedAt, createdAt
  INDEX (userId)

MagicLinkToken
  id, email, tokenHash (unique), expiresAt, consumedAt?, requestIpHash?, createdAt
  INDEX (email, createdAt)          -- per-email rate limit derived from rows

LegalAcceptance            -- Phase 4 slice 10 (legal pages); not created in Phase 2
  id, userId → User (cascade), document (TERMS|PRIVACY), version, acceptedAt
  UNIQUE (userId, document, version)
```

(Auth is implemented in-house: spike S1 rejected Better Auth because it stores session tokens in plain text and verifies magic links only by GET, see ADR 0006.)

### 7.2 Collections and guest access

```text
Collection
  id, ownerId → User (restrict), title (1–100), description? (1–1000),
  welcomeMessage? (1–160 code points, one paragraph; slice 8a),
  status (ACTIVE|ARCHIVED|DELETING), archivedAt?, deletionRequestedAt?,
  blockedAt?, blockedReason?, createdAt, updatedAt
  SQL CHECK ((status = 'ARCHIVED') = (archivedAt IS NOT NULL))
  SQL CHECK ((status = 'DELETING') = (deletionRequestedAt IS NOT NULL))
  INDEX (ownerId, status, createdAt DESC, id DESC)

CollectionCover                                     (slice 8a, 2026-10-04; [A2])
  id, collectionId → Collection (cascade, UNIQUE: one cover, replaced whole),
  status (PENDING|READY|FAILED), source (UPLOAD|FRAME), mimeType (verified),
  originalSizeBytes (bigint), derivedSizeBytes (bigint, 0 until READY), width?, height?, createdAt
  SQL CHECK (originalSizeBytes > 0 AND derivedSizeBytes >= 0)
  SQL CHECK ((status = 'READY') = (width IS NOT NULL AND height IS NOT NULL))
  -- no storage keys: every key is collections/{cid}/cover/{id}/{original|thumbnail.webp|preview.webp}

GuestLink
  id, collectionId → Collection (cascade), isDefault, label?,
  status (ACTIVE|INACTIVE|REVOKED), revokedAt?, hiddenAt?, replacedById? → GuestLink,
  tokenHash (unique), tokenCiphertext, tokenKeyId,
  canUploadPhotos, canUploadVideos, canUploadDocuments, canSubmitText, canViewGallery, canDeleteOwn,
  createdAt, updatedAt
  SQL CHECK (canUploadPhotos OR canUploadVideos OR canUploadDocuments OR canSubmitText OR canViewGallery)
  SQL CHECK (NOT canDeleteOwn OR canUploadPhotos OR canUploadVideos OR canUploadDocuments OR canSubmitText)
  SQL CHECK ((status = 'REVOKED') = (revokedAt IS NOT NULL))
  SQL CHECK (hiddenAt IS NULL OR (status = 'REVOKED' AND NOT isDefault))   -- deleted = revoked + hidden
  SQL UNIQUE (collectionId) WHERE isDefault AND status <> 'REVOKED'   -- exactly one live default

GuestSession
  id, collectionId → Collection (cascade), currentLinkId → GuestLink (no action),
  tokenHash (unique), contributorName? (1–80), nameAnsweredAt?, createdAt, lastSeenAt
  FOREIGN KEY (currentLinkId, collectionId) → GuestLink (id, collectionId)   -- same collection
  UNIQUE (id, collectionId)
  INDEX (collectionId), INDEX (currentLinkId)
```

*`Collection` implemented in slice 1* (Phase 4), without `blockedAt`/`blockedReason`: those columns arrive with operator blocking in slice 9. Title and description are plain text, trimmed, and reject C0 control characters (the description keeps line breaks and tabs); the lengths are also SQL CHECKs. `GuestLink` is implemented in slice 2. *`GuestSession` implemented in slice 3* (PR A, 2026-10-03), as above: the link key is composite with the collection, so PostgreSQL itself refuses a session bound to another collection's link; `NO ACTION` (not `RESTRICT`) lets deleting a collection cascade to its links and sessions in one statement while refusing to delete a link a session points at.

- **Token:** 32 random bytes, base64url (43 chars). Lookup by SHA-256 hash (high-entropy token, no slow hash needed). The owner must be able to re-display the link/QR, so the token is also stored encrypted (AES-256-GCM, key from config, `tokenKeyId` for key rotation). Rejected alternatives: plaintext (DB leak exposes every gallery); HMAC-derived tokens (rotating the secret kills every printed QR).
- **GuestSession belongs to the collection** (F5). The link is the capability used to enter. Permissions are always read from `currentLinkId` at request time; every guest request re-checks that link, the collection and its owner ([G5] order) and writes `lastSeenAt` at most once an hour.
- **The guest's name lives on the session** ([O4], [C4], amended 2026-10-03; it was "not stored on the session"): `contributorName` is optional, asked once before the first contribution («Пропустити» is an answer: `nameAnsweredAt` is set either way), editable, and copied to each new item. Renaming also updates this session's non-deleted items in the same transaction, so the admin never sees two names for one guest. It is never shown to other guests. The session holds nothing else about the guest.
- Future `expiresAt` / scheduled activation are nullable columns added later (D9).
- **Cover and welcome message (slice 8a, PR F, 2026-10-04; owner decisions A1–A10 in `docs/superpowers/plans/2026-10-04-collection-appearance.md`):** `welcomeMessage` is edited through `PATCH /collections/{id}` like the title (trimmed, no control characters or line breaks, 160 code points; editable while archived, D9). The cover is one `CollectionCover` row per collection, replaced whole: replacing or removing deletes the row at once (usage drops immediately) and enqueues `cover.purge` for its prefix. Its original is a server-side copy (`CopyObject`) of the admin's verified upload or of a guest photo frame's ORIGINAL, so deleting that frame never touches the cover. Cover changes are refused on an `ARCHIVED` collection with `409 COLLECTION_ARCHIVED` [A6]. The admin DTO carries `cover: {status, thumbnailUrl, previewUrl, width, height} | null` (URLs once `READY`); the guest context carries `cover` only when `READY`, never its status, source or frame id.

### 7.3 Content

```text
ContentItem                                         (as built in slice 3, 2026-10-03)
  id, collectionId → Collection (cascade), frameNo, kind (PHOTO|VIDEO|DOCUMENT|TEXT),
  contributorGuestSessionId? → GuestSession, contributorName? (1–80),
  originalFilename?, textBody? (1–5000 code points), idempotencyKey? (uuid),
  processingStatus (NOT_REQUIRED|PENDING|READY|FAILED), deletedAt?, createdAt
  FOREIGN KEY (contributorGuestSessionId, collectionId) → GuestSession (id, collectionId)
    ON DELETE SET NULL (contributorGuestSessionId)                   -- same collection, item stays
  UNIQUE (collectionId, frameNo)
  UNIQUE (contributorGuestSessionId, idempotencyKey)
  SQL CHECK ((kind = 'TEXT') = (textBody IS NOT NULL))
  SQL CHECK (frameNo > 0); char_length checks on textBody and contributorName
  SQL CHECK ((kind IN ('TEXT','DOCUMENT')) = (processingStatus = 'NOT_REQUIRED'))
  INDEX (collectionId, createdAt DESC, id DESC) WHERE deletedAt IS NULL         -- feed
  INDEX (collectionId, kind, createdAt DESC, id DESC) WHERE deletedAt IS NULL   -- feed by kind
  INDEX (contributorGuestSessionId, createdAt DESC, id DESC) WHERE deletedAt IS NULL -- own
  INDEX (deletedAt) WHERE deletedAt IS NOT NULL                                 -- purge
  Collection.nextFrameNo (≥ 1)

MediaObject
  id, contentItemId → ContentItem (cascade), role (ORIGINAL|THUMBNAIL|PREVIEW|POSTER),
  storageKey (unique), mimeType, sizeBytes (bigint), width?, height?, durationMs?, createdAt
  UNIQUE (contentItemId, role)

UploadSession                                       (as built in PR C and slice 8a)
  id, collectionId → Collection (cascade), purpose (CONTENT|COVER),
  guestSessionId? → GuestSession, guestLinkId? → GuestLink,       -- CONTENT: both set
  uploaderUserId? → User (cascade),                                -- COVER: set (the admin)
  clientUploadId, kind, originalFilename, declaredMime,
  declaredSizeBytes (bigint), storageKey (unique), (always multipart since 2026-10-03)
  multipartUploadId, partSizeBytes, partCount,
  status (INITIATED|COMPLETING|COMPLETED|ABORTED|EXPIRED|REJECTED), rejectReason?, claimedAt?,
  expiresAt, completedAt?, contentItemId? (unique) → ContentItem (CONTENT only), createdAt
  UNIQUE (guestSessionId, clientUploadId), UNIQUE (uploaderUserId, clientUploadId)
  SQL CHECK ((purpose = 'CONTENT') = (guestSessionId IS NOT NULL AND guestLinkId IS NOT NULL)
             AND (purpose = 'COVER') = (uploaderUserId IS NOT NULL))
  SQL CHECK (purpose <> 'COVER' OR kind = 'PHOTO')
  INDEX (status, expiresAt)
  INDEX (collectionId, status)
```

- One table for all content kinds: the gallery is a single mixed, cursor-paginated feed. The cost is nullable columns guarded by CHECKs. Alternatives rejected: table-per-kind (UNION feeds), EAV (loses integrity).
- `contributorName` is stored per submission (D6), never exposed in guest DTOs.
- `contributorUserId` was drafted so admin uploads are not structurally forbidden later (D14); it does not exist on `ContentItem` ([C19]). The admin identity lands on `UploadSession.uploaderUserId` instead (the draft's `userId?`), used by the collection cover (slice 8a): an admin's upload is a cover, never content.
- `hiddenAt` is the first moderation state (operator/admin "hide"). Future moderation (`pending/approved/rejected`) becomes a status column on `ContentItem` (D10).
- `UploadSession` is separate from `ContentItem`: unfinished uploads never pollute content and have their own lifecycle/cleanup.
- Future folders: nullable `folderId` on `ContentItem`. Storage keys do not depend on organization (§10.6).
- **Frame numbers (ADR 0015), implemented in slice 3 [C8]:** `UPDATE "Collection" SET "nextFrameNo" = "nextFrameNo" + 1 WHERE id = $1 AND status = 'ACTIVE' RETURNING "nextFrameNo" - 1` inside the transaction that creates the item; that statement row-locks the collection (so concurrent creations get consecutive numbers, and a rolled-back one gives its number back) and is the "still active" re-check. Texts and files share the sequence; gaps after deletion are never filled. The owner sees every number; a guest only their own. Lock order [C9]: a transaction that locks both takes the owner's `User` row first, then the `Collection`.
- **Not in slice 3 [C19]:** `contributorUserId`, `hiddenAt`/`hiddenBy` (hide belongs to slice 9) and `capturedAt`; each is an additive column later. `MediaObject` and `UploadSession` below arrive with uploads (PR C).

### 7.4 Reports and audit

```text
ContentReport
  id, contentId (uuid, no FK), collectionId (uuid, no FK),
  reporterGuestSessionId?, reporterUserId?, reason (ILLEGAL|INAPPROPRIATE|PRIVACY|SPAM|OTHER),
  description? (≤ 1000), requestId, status (OPEN|DISMISSED|ACTIONED),
  resolvedByUserId?, resolvedAt?, resolutionNote?, createdAt
  INDEX (collectionId, status, createdAt)
  INDEX (status, createdAt)

AuditEvent (append-only)
  id, collectionId?, actorType (ADMIN|OPERATOR|GUEST|SYSTEM), actorId?, action, targetType,
  targetId, metadata (jsonb, no secrets/content), requestId, createdAt
  INDEX (collectionId, createdAt)
```

`ContentReport` and `AuditEvent` reference content/collections by plain IDs **without foreign keys**: they must survive permanent deletion of content rows and collections (history and abuse evidence).

*`AuditEvent` implemented in slice 1* (Phase 4), with a second index `(actorId, action, createdAt)` for the collection creation limit (§13.1). Slice 1 records `collection.create`, `collection.archive`, `collection.unarchive` and `collection.delete`.

Audited actions: link create / permission change / deactivate / activate / revoke / delete / rotate; content delete / hide; collection archive / unarchive / delete; report status change; account/collection block.

---

## 8. Authorization model

Guest context is valid only if: session exists, `currentLink.status = ACTIVE`, the collection is `ACTIVE`, not blocked, and the owner is not blocked. Checked on **every** guest request (no permission caching in the session).

| Action | Admin (owner) | Operator | Guest |
|---|---|---|---|
| Collection metadata | own only | reported items' collections | public fields via any active link |
| List gallery | own collections | — | `canViewGallery` → all visible items; otherwise own items only |
| Get item / signed URL | own collections | reported items | same visibility rule as list |
| Upload files | the collection cover only (a photo; slice 8a) | — | `canUploadPhotos` / `canUploadVideos` / `canUploadDocuments`, by the file's type |
| Set / remove the cover | own collection (upload, or any live photo frame of it) | — | — |
| Submit text | — (MVP) | — | `canSubmitText` |
| Delete item | any in own collection | any | `canDeleteOwn` AND contributor = this session |
| Hide item | own collection | any | — |
| Report item | — | — | any item visible to the guest |
| Manage links | own collections | — | — |
| View reports | own collections | all | — |
| Block collection / account | — | yes | — |

- Access to a resource outside the principal's scope returns **404**, not 403 (no existence disclosure).
- `contributorName` and other guests' metadata are excluded from guest DTOs.
- Signed URLs are issued only after the same policy check as the item itself.
- A view-only link (`canViewGallery` only) is a full capability (F3).
- *Implemented in PR E (2026-10-04):* guest delete. An item that is not this session's own (another guest's, another collection's, or none) is `404` before the permission is looked at; an own item through a link without `canDeleteOwn` (the link the session is bound to now) is `403 FORBIDDEN`; an already deleted own item is `204`. The audit actor is `GUEST` with the session id. Admin bulk delete takes 1–100 ids of one owned collection in one transaction: ids of other collections are reported `notFound` and untouched, a retry reports the frames `alreadyDeleted`, and audit events (`bulk: true`) and purge jobs take their ids from the updated rows. Presigned links are readable by whoever holds them, so another guest's download link is signed with a neutral `attachment; filename="stepler.<ext>"`: no original name and no frame number (only the admin and the contributor get `stepler-087.pdf` / the original name). Guest deletes have their own per-IP bucket, `LIMIT_GUEST_WRITES_PER_IP_PER_MINUTE` (120).

---

## 9. API architecture

Decision details: ADR 0004.

- Base path `/api/v1` (URI versioning).
- Errors: RFC 9457 `application/problem+json` with a stable `code` (e.g. `LINK_INACTIVE`, `QUOTA_EXCEEDED`, `FILE_TYPE_NOT_ALLOWED`) and `retryable` flag. The web app translates codes; the API does not return localized prose.
- Pagination: opaque cursor over `(createdAt, id)`, `limit` ≤ 100.
- Idempotency: uploads via `clientUploadId`; text submissions and reports via `Idempotency-Key` header; completion is idempotent by upload session.
- Swagger/OpenAPI generated from the `contracts` schemas (Zod 4 `z.toJSONSchema`, see ADR 0005); the OpenAPI document is snapshotted and diffed in CI.

Resource map (MVP):

```text
Auth / me
  GET    /auth/methods                         {magicLink, google, turnstileSiteKey}
  POST   /auth/magic-link                      (Turnstile token required) → 202, same body for every email
  POST   /auth/magic-link/preview              {token} → {email}; read-only
  POST   /auth/magic-link/verify               {token} → sets session cookie
  GET    /auth/google/start | /auth/google/callback
  POST   /auth/logout                          → 204, idempotent
  GET    /me          PATCH /me (displayName, locale)
  POST   /me/legal-acceptances                 (Phase 4 slice 10)

Admin
  GET/POST            /collections
  GET/PATCH/DELETE    /collections/{id}                  (PATCH: title, description, welcomeMessage)
  POST                /collections/{id}/archive | /unarchive
  POST                /collections/{id}/cover/uploads                         (slice 8a: admin cover upload,
  POST                /collections/{id}/cover/uploads/{uid}/parts              the guest upload protocol
  POST                /collections/{id}/cover/uploads/{uid}/complete → Collection   under the admin session)
  DELETE              /collections/{id}/cover/uploads/{uid}
  POST                /collections/{id}/cover/from-frame  {contentItemId} → Collection   (slice 8a)
  DELETE              /collections/{id}/cover                                           (slice 8a)
  GET/POST            /collections/{id}/guest-links
  PATCH/DELETE        /guest-links/{id}                 (label, permissions / delete = revoke + hide)
  POST                /guest-links/{id}/deactivate | /activate | /revoke
  POST                /collections/{id}/guest-links/default/rotate
  GET                 /collections/{id}/content?kind=&sort=newest|frame&cursor=&limit=   (slice 3)
  GET                 /collections/{id}/content/counts                                   (slice 3)
  GET/DELETE          /content/{id}                    (soft delete, idempotent, audited; slice 3)
  POST                /collections/{id}/content/bulk-delete   {ids} (1–100) → {deleted, alreadyDeleted, notFound} [C7] (PR E)
  POST                /content/{id}/hide | /unhide            (slice 9)
  GET                 /collections/{id}/reports
  PATCH               /reports/{id}

Operator
  GET                 /operator/reports?status=&cursor=
  PATCH               /operator/reports/{id}
  POST                /operator/content/{id}/hide     DELETE /operator/content/{id}
  POST                /operator/collections/{id}/block | /unblock
  POST                /operator/users/{id}/block | /unblock

Guest (cookie scoped per collection, see §9.1)
  POST   /guest/links/resolve                    {linkToken} → {collectionId, collection, permissions}
  POST   /guest/collections/{cid}/session        {linkToken} → GuestContext + Set-Cookie   (slice 3)
  PATCH  /guest/collections/{cid}/session        {name | null} → GuestContext            (slice 3)
  GET    /guest/collections/{cid}/context        → GuestContext                           (slice 3)
  GET    /guest/collections/{cid}/content?scope=own|all&cursor=                          (slice 3)
  GET    /guest/collections/{cid}/content/{id}                                           (slice 3)
  DELETE /guest/collections/{cid}/content/{id}         own item + canDeleteOwn; else 404 / 403 (PR E)
  POST   /guest/collections/{cid}/texts      Idempotency-Key header (uuid), 201 / replay 200   (slice 3)
  POST   /guest/collections/{cid}/uploads
  POST   /guest/collections/{cid}/uploads/{uid}/parts
  POST   /guest/collections/{cid}/uploads/{uid}/complete
  DELETE /guest/collections/{cid}/uploads/{uid}
  POST   /guest/collections/{cid}/content/{id}/reports

Health
  GET /health/live   GET /health/ready
```

Why a separate guest namespace: different principal, different DTOs (admin fields cannot leak), and a clear surface for IDOR/BOLA review. Cost: two controller sets over shared services.

### 9.1 Guest session exchange

Amended and implemented in slice 3 ([C3], 2026-10-03): **two calls, not one.** The cookie is path-scoped to `/api/v1/guest/collections/{collectionId}`, so the browser would never send it to a `POST /guest/sessions` outside that path: the API could not re-bind, and every reload would create a new session and lose "my frames".

1. Guest opens `/g/{token}`; web calls `POST /api/v1/guest/links/resolve {linkToken}`. The answer carries the link's state ([G5] codes) and the `collectionId` (not a secret, CLAUDE.md §8; the guest needs it for every later call).
2. Web calls `POST /api/v1/guest/collections/{collectionId}/session {linkToken}` — under the cookie's path. The API resolves the token again; a link of another collection than the path's is `404` (nobody can plant a cookie for another collection).
3. If the request carries a valid session cookie of this collection → **re-bind** `currentLinkId` to this link (ownership preserved, permissions from the new link, F5) and set the same cookie again to renew it. Otherwise create a new `GuestSession`; the raw token goes only into the cookie, its SHA-256 into the row.
4. Cookie: `st_gs` with `HttpOnly; SameSite=Lax; Path=/api/v1/guest/collections/{collectionId}; Max-Age=34560000` (400 days, the browsers' cap; no server-side expiry, D12) and `Secure` per `COOKIE_SECURE` — one cookie per collection, so sessions for different collections are never linked by a shared device identifier.
5. Every guest collection route (`GuestSessionGuard`) needs that cookie (`401 GUEST_SESSION_REQUIRED` without it, or with another collection's), then re-checks the session's link and collection in [G5] order on each request. The web re-runs the exchange once on `GUEST_SESSION_REQUIRED` (it has the token in the address bar) and retries the call; a link or collection state from any call switches the page to that state.
6. Reloading `/g/{token}` repeats the exchange idempotently.

Known limitation: QR scanners and messenger in-app browsers often use a separate cookie jar; a guest who uploads in one browser cannot delete from another. Accepted for MVP (D12).

---

## 10. Upload and storage lifecycle

Decision details: ADR 0008.

### 10.1 Allowed types and limits (D2, D3)

| Kind | Types | Max size |
|---|---|---|
| Photo | JPEG, PNG, WebP, HEIC, HEIF, GIF | 50 MB |
| Video | MP4, MOV, WebM | 2 GB |
| Document | PDF, DOCX, XLSX, PPTX, TXT | 50 MB |
| Text | plain text | 5000 chars |

Forbidden: SVG, HTML, executables, archives. Validation layers: extension + declared MIME at initiation; content signature at completion. OOXML (DOCX/XLSX/PPTX) is ZIP-based, so "archives" are rejected by **detected type**, not by the ZIP signature alone. TXT has no signature → first bytes must be valid UTF-8 without NUL bytes. Browser `Content-Type` is never trusted.

### 10.2 Strategy

- **Every file is an S3 multipart upload** (addendum 2026-10-03, ADR 0008; replaces "`size ≤ 100 MB` → single presigned `PUT`"): `CreateMultipartUpload` at initiation, fixed part size (10 MiB), a file up to the part size being one part; part URLs issued on demand in batches, each signing its exact `Content-Length`, URL TTL 15 min; parts retried individually. Why: a presigned single `PUT` stayed writable after the upload closed (an orphan after cancel/reject/expiry/delete, or an overwrite of the verified original after completion); `CompleteMultipartUpload` and `AbortMultipartUpload` end the upload and every part URL with it. Cost: two extra API round trips per small file.
- Upload session TTL: 24 h [assumption] (2 GB over a poor mobile link can take hours); part URLs are re-issuable while the session lives.
- R2 specifics (S4, ADR 0008; the emulator cannot reproduce these, so they are verified in staging): no presigned POST policies (size is enforced at completion); all multipart parts except the last must be equal size; EU-jurisdiction buckets use a distinct endpoint. Bucket CORS must expose `ETag`; the emulator reproduces this, so it is tested locally too.
- Client transport is in-house (spike S9, ADR 0008; Uppy 6 completes multipart uploads from the browser, which the server must own): XHR `PUT` for progress; ≤ 3 parts in flight per file; part URLs requested on demand in batches of ≤ 20; per-part retry with 31 s of backoff in all (a broken path does not flip `navigator.onLine`); per-file retries after 2, 8 and 30 s, then «Повторити»; progress never goes back. Client concurrency 3 files; the "100 files per operation" limit is enforced in the UI and bounded server-side by the concurrency and hourly limits (§13).

**Implemented (PR C, 2026-10-04).** Routes under `/api/v1/guest/collections/{collectionId}/uploads`: `POST` (initiate, 201: `{ uploadId, partSizeBytes, partCount, expiresAt }`), `POST /{uploadId}/parts` (`{ partNumbers }` → part URLs, each signing its exact `Content-Length`), `POST /{uploadId}/complete` (200: the guest's frame; `409 UPLOAD_INCOMPLETE` carries `missingPartNumbers`; `409 UPLOAD_IN_PROGRESS` while another completion holds the claim), `DELETE /{uploadId}` (204, idempotent). Rate limits per IP and per guest session on all four. Signature detection (`uploads/file-signature.ts`): photos and videos match their declared kind (stored with the detected MIME), documents their declared format; SVG, HTML, archives, executables and AVIF are refused. Admin and guest item details carry presigned `originalUrl` (photos and videos only) and `downloadUrl` (an attachment named from the original file, fallback `stepler-087.pdf`).

### 10.3 Initiate — `POST .../uploads`

1. Resolve guest principal; require the upload permission for the file's type (`canUploadPhotos`, `canUploadVideos` or `canUploadDocuments`).
2. Validate extension/declared MIME/size against §10.1.
3. Rate limits: initiations per guest session per hour; concurrent `INITIATED` sessions per guest session.
4. In a transaction, lock the owner `User` row (`SELECT … FOR UPDATE`) and check collection quota (10 GB) and account quota (20 GB) against usage **including reservations** (§13.2).
5. Create `UploadSession` (idempotent on `(guestSessionId, clientUploadId)` — a retry returns the same session).
6. Return presigned URL(s) or multipart descriptor.

### 10.4 Complete — `POST .../uploads/{uid}/complete`

As built (addendum 2026-10-03, ADR 0008): a short transaction **claims** the upload (`COMPLETING`), the storage checks below run outside any transaction with deadlines, and a second short transaction re-checks the claim, link, collection and permission before recording the frame or the refusal. A concurrent completion gets `409 UPLOAD_IN_PROGRESS` (retryable); a claim older than 5 minutes can be claimed again or expired. Upload routes are rate-limited per IP and per guest session.

1. If already `COMPLETED` → return the existing content item (duplicate completion is safe).
2. Re-check the guest context **now** (link active, the upload permission for the file's type, collection active). If not authorized → `REJECTED` and enqueue object deletion (D8: bytes may exist in storage; completion is refused; cleanup removes them).
3. Multipart: the server calls `ListParts` and then `CompleteMultipartUpload` — client-supplied ETags are not trusted.
4. `HeadObject`: size must equal the declared size and be within limits.
5. Range-GET the first bytes (≤ 4 KB) → detect type; must be allowed and match the kind.
6. Transaction: create `ContentItem` + `MediaObject(ORIGINAL)`, mark session `COMPLETED`, enqueue the processing job (transactional enqueue **[verify S7]**, otherwise an outbox row).
7. Validation failure → `REJECTED` with reason, object deletion enqueued, problem response with a specific code.

### 10.5 Failure handling (PRODUCT §28)

| Case | Handling |
|---|---|
| Network drops mid-upload | client retries the file/part; single PUT restarts; multipart resumes from missing parts |
| Browser closed during upload | session stays `INITIATED` → expiry job aborts multipart/deletes object → `EXPIRED`. Guest re-uploads. True resume = post-MVP |
| Duplicate completion | idempotent (10.4.1) |
| Object uploaded, DB completion fails | session remains `INITIATED`; client retries complete; otherwise expiry cleans up |
| DB record exists, object missing | download URL yields 404 from storage; UI shows "unavailable"; logged. Reconciliation job = post-MVP |
| Unsupported / oversized | rejected at initiation; re-checked at completion |
| Link revoked/deactivated during upload | completion rejected, object cleaned up |
| Collection deleted while guest active | guest API → `410 Gone`, completion rejected |
| Storage provider outage | initiation/URL issuance → `503` problem with `retryable: true`; client backs off |
| Cancel | `DELETE .../uploads/{uid}` → abort multipart / delete object → `ABORTED` |

Safety net: R2 lifecycle rule "abort incomplete multipart uploads after 2 days".

### 10.6 Storage layout and access

```text
collections/{collectionId}/uploads/{uploadSessionId}/original
collections/{collectionId}/derived/{contentItemId}/{thumbnail|preview|poster}.webp
collections/{collectionId}/cover/{coverId}/{original|thumbnail.webp|preview.webp}    (slice 8a)
```

- No user-controlled data (filenames) in keys. Keys are immutable; nothing is renamed.
- Per-collection prefix enables collection purge by prefix; a cover's own prefix lets `cover.purge` remove a replaced cover while the live one stays.
- Downloads: presigned `GET`, TTL 1 h, expiry aligned to fixed windows so URLs are stable within a window and cacheable by the browser. `response-content-type` = verified MIME. `response-content-disposition`: `inline` for images/video, `attachment` for documents.
- Local development uses an S3-compatible emulator; R2-specific behavior is verified against a real R2 dev bucket and staging (honestly marked as not locally reproducible).

### 10.7 Admin cover upload (slice 8a, 2026-10-04)

The owner's cover file travels exactly like a guest's (§10.2–§10.5, ADR 0008 addendum 2026-10-04): `POST /collections/{id}/cover/uploads` opens an `UploadSession` with `purpose = COVER` and `uploaderUserId` (photos only, `LIMIT_FILE_BYTES_PHOTO`, idempotent on `(uploaderUserId, clientUploadId)`, at most 3 open cover uploads per collection → `429`), the quota is reserved under the owner lock then the collection lock [C9], part URLs come from `…/parts`, and `…/complete` claims the upload, inspects storage with the same `UploadInspector` (parts, size, content signature), then copies the verified original server-side (`CopyObject`, ≤ 50 MB) to `collections/{cid}/cover/{coverId}/original` and, in a short transaction, replaces the cover row (`PENDING`), marks the upload `COMPLETED` (no content item) and enqueues `media.cover-derivatives`; the upload's own key is deleted best-effort afterwards. «Зробити обкладинкою» (`POST …/cover/from-frame`) copies a live photo frame's ORIGINAL the same way (the frame is untouched; `422 COVER_SOURCE_INVALID` for a text, a frame without an original or one whose processing failed), checking the quota after the old cover's bytes stop counting. Best-effort deletes (a copied object whose transaction failed, the upload key after completion) are backstopped by the collection purge, which removes the whole prefix. The routes are rate limited per IP and per user (`LIMIT_ADMIN_COVER_CALLS_PER_IP_PER_MINUTE`, `LIMIT_ADMIN_COVER_CALLS_PER_USER_PER_MINUTE`).

---

## 11. Background processing

Decision details: ADR 0009.

- Worker process, same codebase (`apps/api/src/worker`), queue in PostgreSQL via pg-boss (no new infrastructure). Jobs are enqueued in the same transaction as the state change that needs them (spike S7); queues use the `exclusive` policy with one job per entity.
- *Implemented (Phase 4 PR B):* the queue port and pg-boss adapter, the worker entrypoint and image, `content.purge`, `collection.purge` and the hourly `maintenance.sweep` (re-enqueues lost purges; deletes guest sessions idle for `GUEST_SESSION_IDLE_DAYS`, default 400, that never contributed).
- *Implemented (Phase 4 PR D, 2026-10-04):* `media.image-derivatives` and `media.video-poster`, with the HEIC and video tools chosen by spike S5; details and measurements in ADR 0009 "Implementation notes (processing)".
- Jobs:
  - `media.image-derivatives` — thumbnail (480 px) and preview (1600 px) WebP via sharp, without metadata, with a 100 MP input limit. The original is always kept unchanged. The preview is what makes HEIC/HEIF viewable in every browser. HEVC-HEIC is decoded by the libheif CLI (`heif-dec`/`heif-convert` with libde265) to a temporary JPEG, then sharp (spike S5); a decoded HEIC is not auto-oriented again, every other format is. Implemented.
  - `media.video-poster` — ffprobe and ffmpeg read the original through a presigned URL with range requests (the 2 GB file never passes through Node memory) with `-threads 1` and protocol and format whitelists, take one frame at `min(1 s, duration / 2)` and record the duration; poster 1600 px and thumbnail 480 px. Implemented.
  - `content.purge`, `collection.purge` — idempotent (missing rows and objects are success); implemented. `storage.discard-upload` (bytes of rejected or cancelled uploads) — *pending*, upload slice. (Earlier drafts named these `storage.purge-content`, `storage.purge-collection`, `storage.delete-object`.)
  - `uploads.expire` — scheduled every 15 min; *pending*, upload slice (the schedule is registered once its handler exists).
  - `maintenance.sweep` — hourly; implemented (see above). It does not yet cover a cover left `PENDING` by a job pg-boss expired on its last attempt (slice 8a follow-up).
  - `media.cover-derivatives` `{collectionId, coverId}` — the cover's thumbnail (480 px) and preview (1600 px) from its copied original, the photo way (HEIC included); one conditional update sets `READY` with the dimensions and derived bytes only while the row still exists, else the two objects just written are deleted. Implemented (slice 8a).
  - `cover.purge` `{collectionId, coverId}` — the prefix of a replaced or removed cover, unless a row with that id is live. Implemented (slice 8a).
- Retries with exponential backoff; terminal failure → `processingStatus = FAILED` (a file the tools cannot decode fails at once, without retries). Content stays available; the UI shows a type tile instead of a preview, and the original can be downloaded.
- The API never performs heavy media work synchronously.
- Extension points: transcoding, compression, extra formats become new job types without changing the upload flow.
- Worker Docker target includes ffmpeg/libheif; the API image does not.

---

## 12. Deletion, archive, blocking (D11)

- **Delete content:** transaction sets `deletedAt` + audit → immediately invisible and excluded from quota → job purges all storage objects (original and derivatives) → only after successful purge, the `ContentItem`/`MediaObject` rows are permanently deleted. Reports and audit events keep the original content ID (no FK).
- **Archive collection:** `ARCHIVED`; guest access denied (`403 COLLECTION_UNAVAILABLE`); admin sees content; reversible.
- **Delete collection:** confirmation in UI; `DELETING` + audit → guest API returns `410`; job aborts active uploads, deletes the collection prefix in resumable batches, then hard-deletes the collection (cascade).
  - *Implemented in slice 1:* archive, unarchive and delete from `ACTIVE` or `ARCHIVED`. Delete sets `DELETING` and `deletionRequestedAt` with an audit event; from then on the collection is a 404 for the admin and excluded from lists and limits. The admin can still edit an archived collection. The `410` for guests comes with slice 3.
  - *Implemented in Phase 4 PR B:* the purge. Deleting content or a collection enqueues `content.purge` / `collection.purge` in the same transaction; the worker deletes the objects, then the rows (content: derived objects now, the original with the upload slice; collection: its whole prefix in resumable batches, then the cascade). Audit events stay. The hourly sweep re-enqueues anything older than an hour, which also purges collections left `DELETING` since slice 1. Aborting active uploads joins with the upload slice.
  - *Implemented in PR E:* every content deletion (admin single, admin bulk, guest own) goes through one `ContentDeletion.softDelete`: a conditional `UPDATE … WHERE deletedAt IS NULL RETURNING`, then one audit event and one `content.purge` job per returned row, in the caller's transaction, so a retry or a concurrent delete audits once.
- **Operator block collection:** `blockedAt`; guest access denied; the admin sees a blocked banner and cannot unblock.
- **Operator block account:** `User.status = BLOCKED`; sessions revoked; sign-in refused; guest access to the owner's collections denied.
- No automatic retention in MVP.

---

## 13. Limits, quotas, rate limits

Decision details: ADR 0010. All values come from typed configuration — never hardcoded in business logic, changeable without a DB migration.

### 13.1 Initial values (F1, D2)

| Limit | Value |
|---|---|
| Active collections per account | 3 |
| Storage per collection | 10 GB |
| Storage per account | 20 GB |
| Files per upload operation (UI) | 100 |
| Concurrent `INITIATED` uploads per guest session | 10 [assumption] |
| Upload initiations per guest session | 300 / hour |
| Magic link requests | 5 / hour per email, 20 / hour per IP |
| Guest session creation | 120 / minute per IP (raised from 30 like [G10]: venue NAT) |
| Guest texts | 60 / hour per guest session and 60 / minute per IP |
| Guest reads (context, content list, one item) | 600 / minute per IP and route |
| Collection creation | 10 per rolling 24 hours per account |
| Per-file size | §10.1 |

*Implemented in slice 8a (2026-10-04):* the admin's cover routes are rate limited per route, per client IP (`LIMIT_ADMIN_COVER_CALLS_PER_IP_PER_MINUTE`, 120) and per signed-in user (`LIMIT_ADMIN_COVER_CALLS_PER_USER_PER_MINUTE`, 60, keyed by the principal), plus at most 3 cover uploads open per collection (rows, `429`).

*Implemented in slice 3:* the guest rows above, all env-backed through `LimitsService` (`LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE`, `LIMIT_TEXTS_PER_GUEST_SESSION_PER_HOUR`, `LIMIT_TEXTS_PER_IP_PER_MINUTE`, `LIMIT_GUEST_READS_PER_IP_PER_MINUTE`, and from PR E `LIMIT_GUEST_WRITES_PER_IP_PER_MINUTE` for guest deletes; the per-file sizes and files per batch already come from `LIMIT_FILE_BYTES_*` and `LIMIT_FILES_PER_BATCH` for the guest page). The per-IP limits are in memory, per instance. A text is at most 5000 code points and a name 80 (contract constants mirrored by SQL CHECKs, not quotas).

*Implemented in slice 1:* "active" means `status = ACTIVE` only: archiving frees a slot, and unarchiving at the limit is refused with `409 COLLECTION_LIMIT_REACHED`. The check runs under a lock on the owner, so concurrent creates cannot exceed it. The creation limit (`LIMIT_COLLECTION_CREATIONS_PER_DAY`, `429 RATE_LIMITED`) is counted from `collection.create` audit events, so deleting a collection does not give the attempt back.

### 13.2 Usage accounting

"Actual storage" (F1) = sum of `MediaObject.sizeBytes` over **all roles** (originals + derivatives) of non-deleted content + the cover's `originalSizeBytes + derivedSizeBytes` (slice 8a) + `declaredSizeBytes` of `INITIATED` and `COMPLETING` upload sessions (reservations, guest and cover uploads alike).

[assumption] Content marked deleted stops counting immediately, even before the purge completes (purge lag is our responsibility; otherwise deleting to free space would not work for the user).

MVP computes usage with indexed aggregate queries under a row lock. Counter columns are added only if measurements show a need.

### 13.3 Enforcement

- Domain limits (per-email, per-session, concurrency, quotas) are derived from database rows — no extra store.
- IP-based limits use `@nestjs/throttler`. Storage for multi-instance deployment is decided with hosting (in-memory is correct only for a single instance).
- `LimitsService.forUser(user)` / `forCollection(collection)` is the only place limits are resolved — the seam for future plans/entitlements (D13).

---

## 14. Abuse reporting and operator (D15, F2)

Decision details: ADR 0013.

- A guest can report any item visible to them; the report stores content/collection IDs, reason, optional description, timestamp, reporter principal and request ID.
- The collection admin sees reports for their collections and can delete/hide content.
- The operator (config `OPERATOR_EMAILS`) sees all reports and can hide/delete content, block/unblock collections and accounts, dismiss reports or change their status. MVP surface: operator API endpoints plus a minimal protected page in the web app — no full admin panel.
- A public abuse contact email is published in the legal documents.
- **Open (legal):** whether reporter IP is stored, and whether reported illegal content must be preserved (evidence hold) instead of purged. Default until decided: no IP stored; normal purge.
- The applicability of specific DSA obligations to Stepler is not assumed; it requires legal review before public launch.

---

## 15. Legal and privacy (D15, F6, F8)

- Pages: Terms of Service, Privacy Policy (uk/en), versioned; texts provided by the owner/lawyer. Engineering does not write legal wording.
- Admin registration records `LegalAcceptance(document, version, acceptedAt)` (Phase 4 slice 10; not in Phase 2). No IP stored by default. Document updates do not force re-acceptance without a separate decision.
- Guest page shows a short notice with links (no checkbox).
- Privacy requests: email channel, processed manually by the operator. Data locatable by: admin account (email); guest data via collection + content item or guest session ID. Guests have no email, so guest requests must identify the content concerned — a known limitation.
- Data minimization: the guest name is optional, held on the guest session ([O4], amended 2026-10-03) and snapshotted per submission; the session holds nothing else about the guest; other guests never see a name or another guest's file name or frame number; logs and audit events exclude text bodies, names, file names, cookies, tokens and signed URLs.

---

## 16. Internationalization (Q4)

Decision details: ADR 0011.

- Languages: Ukrainian (default) and English.
- **No locale segment in URLs**: QR/guest links must be identical for everyone. Resolution order: admin profile locale → locale cookie → `Accept-Language` → `uk`.
- Web: message catalogs per locale; next-intl in "without i18n routing" mode (verified in spike S8, ADR 0011); lint rule against literal JSX strings.
- API: returns error codes, not localized prose. Emails (magic link) are rendered by the API in the recipient's locale.

---

## 17. Observability

- Structured JSON logs (nestjs-pino) with request ID (`x-request-id` in/out) in api and worker; job logs carry the job ID and the originating request ID.
- Redaction: cookies, `Authorization`, magic-link tokens, guest link tokens, signed URL query strings, text content.
- Error monitoring behind an adapter; provider chosen later (open).
- Logged with reason codes: upload rejections/expiries, processing failures, storage errors, quota denials, rate-limit hits, report creation, operator actions.
- Health: `/health/live` (process), `/health/ready` (DB + storage reachability).

---

## 18. Testing strategy

| Layer | Tooling | Focus |
|---|---|---|
| Unit | Vitest | policy functions, limits, type detection, state transitions, schemas |
| API integration | Vitest + Nest testing module + Supertest + real PostgreSQL (reset per file with one `TRUNCATE … RESTART IDENTITY CASCADE`, S6) | endpoints, transactions, constraints, idempotency |
| Authorization matrix | table-driven integration tests | every endpoint × {owner, other admin, operator, guest of same collection with each permission set, guest of other collection, revoked/inactive link, blocked account, anonymous} |
| Storage integration | local S3 emulator | presign, multipart, completion verification, cleanup |
| R2 behavior | staging smoke test | behaviors the emulator cannot reproduce |
| Worker | integration with fixtures | derivatives, posters, purge idempotency |
| UI components | Storybook + interaction tests + axe | states: loading/empty/error/disabled/denied/partial |
| E2E | Playwright (mobile + desktop projects, network throttling) | admin creates collection & shares; guest uploads multiple files with a failure + retry; view-only link; revoked link; guest deletes own and cannot delete another's; report flow |
| Contract | OpenAPI snapshot diff in CI | unintended breaking changes |

Vitest (4.1.x repo-wide) with NestJS runs through `unplugin-swc` for decorator metadata (verified in spike S3, ADR 0005). Request validation uses NestJS 12 built-in Standard Schema support with Zod schemas from `contracts`.

---

## 19. Development infrastructure

- Local: `docker compose` (`docker/compose.yaml`) with PostgreSQL 18 (host port 5433 by default, to avoid clashing with a local PostgreSQL) and Mailpit. S3-compatible emulator: SeaweedFS on port 8333, added in Phase 2 (spike S4, ADR 0008: MinIO's repository is archived; RustFS is the fallback). A dev/CI script creates the bucket and CORS idempotently. Apps run natively (rule 17).
- Config: per-app Zod-validated env at startup; `.env.example` documents names only.
- Docker: multi-stage images — `web` (Next standalone), `api`, `worker` (with ffmpeg/libheif).
- CI (GitHub Actions): install (cached) → lint → typecheck → unit → integration (PostgreSQL + S3 emulator services) → build → Prisma schema/migration check → OpenAPI diff → Playwright E2E on PRs to main.
- Migrations run as a separate deploy step before rollout; expand/contract for destructive changes.
- CD: out of bootstrap scope until hosting is chosen (Q3).
- Environments: staging and production fully isolated (DB, bucket, secrets, email sender); both in EU.

---

## 20. Spikes (verification before relying on the decision)

| ID | Question | Needed by |
|---|---|---|
| S1 | Better Auth in NestJS (magic link, Google, Prisma, same-origin cookies, schema control) vs in-house | Foundation (auth boundary) |
| S2 | Zod contracts + nestjs-zod + OpenAPI; CJS/ESM interop with Nest and Prisma | Bootstrap |
| S3 | Vitest + SWC for NestJS | Bootstrap |
| S4 | Local S3 emulator choice; R2 presigned PUT with Content-Length, multipart constraints, CORS, EU endpoint | Foundation (storage adapter) |
| S5 | HEIC decode + ffmpeg poster from presigned URL in the worker image | Processing slice |
| S6 | Prisma migrations with raw SQL CHECK / partial unique without drift | Foundation (first migration) |
| S7 | pg-boss transactional enqueue with Prisma | Upload slice |
| S8 | next-intl without locale prefix in App Router | Bootstrap (web) |
| S9 | Headless Uppy vs in-house uploader — **decided: in-house** (ADR 0008) | Upload slice |

---

## 21. Open decisions (not blocking bootstrap)

1. Hosting provider and production deployment architecture (EU). *Staging decided: Render, Frankfurt (ADR 0014); production to be confirmed.*
2. Email provider (EU preference). *Staging: Brevo SMTP (ADR 0014); production to be confirmed.*
3. Error monitoring provider.
4. ~~Auth implementation (S1)~~ — decided: in-house (ADR 0006).
5. Rate-limit storage for multi-instance deployment (depends on 1). Phase 2 limits are in-memory per API instance.
5a. ~~How deployed environments run migrations~~: the API image ships the Prisma CLI and migrations; Render runs `prisma migrate deploy` as the pre-deploy command (ADR 0014).
6. Legal: DSA/GDPR review, reporter IP storage, evidence preservation for reported illegal content.
7. Billing provider and pricing; transcoding provider.
8. Final UI texts and legal texts.

---

## 22. Risks

| Risk | Mitigation |
|---|---|
| Open registration → storage abuse / cost | account + collection quotas, Turnstile, rate limits, operator blocking |
| Illegal content via public links | reports to admin **and** operator, hide/block tools, legal review |
| HEIC / HEVC compatibility | derivatives in worker (S5); video download fallback |
| In-app browsers lose guest cookie | accepted; documented UX |
| R2 behavior differs from local emulator | staging smoke tests; adapter isolates provider |
| Poor mobile networks | multipart with per-part retry, 24 h sessions |
| Toolchain interop (Nest CJS vs ESM packages) | spike S2 before scaffolding packages |
