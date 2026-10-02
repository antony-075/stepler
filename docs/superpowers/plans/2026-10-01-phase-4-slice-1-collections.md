# Stepler Phase 4, Slice 1: Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can create, view, edit, archive, unarchive and delete their own collections from a responsive dashboard. The account's active-collection limit is enforced on the server and shown in the UI.

**Architecture:**
- API: a new `collections` module (thin controller, one service, owner-scoped Prisma queries) and an `audit` module (append-only `AuditEvent`, which the owner moved into slice 1). Account usage goes in `limits` (`UsageService`), next to `LimitsService`.
- The limit check runs in a transaction that locks the owner's `User` row first, the same pattern uploads will use for quotas (spec §10.3).
- Contracts in `packages/contracts/src/collections.ts`. Web screens in `apps/web/src/app/app/` use TanStack Query and Phase 3 primitives. No new dependencies.
- Data model fit for later slices: guest links (slice 2) hang off `Collection` with a cascade. Guest visibility is a per-link permission (D7), so `Collection` has no visibility column. `DELETING` is in place now, so the guest slice can return `410` and the purge job (slice 5) has its backlog.

**Tech Stack:** As Phase 2 and 3:
- NestJS 12 with Standard Schema validation, Prisma 7.10 on PostgreSQL 18;
- Zod 4 contracts;
- Next.js 16 App Router, next-intl, TanStack Query 5, React Hook Form;
- `@stepler/ui` (Radix/shadcn), Vitest, Storybook, Playwright.

**Spec:**
- `docs/product/PRODUCT.md`: §3.1, §5.2–5.4, §7, §27 Journey 1, §28 ("collection deleted while guest is active");
- `docs/product/acceptance-criteria.md` (Collection, Responsive, API);
- `docs/architecture/discovery-questions.md`: D7, D11 (archive/delete), F1 (3 active collections);
- `docs/architecture/mvp-architecture-spec.md`: §5, §7.2, §7.4, §8, §9, §12, §13;
- ADR 0004, 0005, 0010, 0011;
- `docs/ux/design-system.md` (admin surface, settings pattern);
- `BOOTSTRAP.md` Phase 4 slice 1.

## Prerequisites

- The Phase 3 PR (`feat/phase-3-design-system`) is merged into `dev`. This slice uses its Select, ConfirmDialog, Card, Badge, EmptyState, PageHeader `compact`, toasts and the admin shell.
- The owner has answered the "Decisions for the owner" below, or accepted the recommended defaults. Tasks are written against the defaults; a different answer changes only the steps marked **[D#]**.

## Decisions for the owner

**Status: all recommended defaults (D1–D9) and the deliberate choices approved by the owner on 2026-10-01.**

**Web rebuilt in direction C (2026-10-02)** on `feat/phase-4-collections-c`: the same behaviour, tests and copy keys as Tasks 5–7, with the screens following `docs/design/DESIGN-SYSTEM.md` §6.5–6.8 instead of the v4 card grid (dashboard rows with an empty film strip, the C gallery header on the collection page). Design notes for the implemented screens: `docs/ux/design-system.md`.

The product spec and the discovery answers do not settle these, and each one changes behaviour. The recommended default is in bold.

1. **[D1] Do archived collections count toward the "3 active collections" limit (F1)?**
   - **Recommended: no.** Only `ACTIVE` counts. Archiving frees a slot, and unarchiving is refused with `409 COLLECTION_LIMIT_REACHED` when the account is at the limit.
   - Abuse stays bounded by the 20 GB account storage quota (slice 5), which counts archived content.
   - Alternative: count every non-deleted collection. Simpler for users to understand, but then archiving is useless as a way to make room.
2. **[D2] What does "delete collection" do before storage purge exists?**
   - **Recommended:** delete sets `status = DELETING` and `deletionRequestedAt`. From that moment the collection is gone for everyone: 404 for the admin, excluded from lists and limits, and `410` for guests (slice 3). The rows are hard-deleted later by the purge job (slice 5), which also clears what this slice leaves behind.
   - Deletion is allowed from both `ACTIVE` and `ARCHIVED`, behind a destructive `ConfirmDialog` that names the collection. There is no type-the-name step.
   - Alternative: hard-delete now (no storage objects exist yet) and switch to `DELETING` in slice 5. Less state today, but it rewrites delete semantics later.
3. **[D3] The default guest link at creation (PRODUCT §5.3, acceptance "A default guest link is created").**
   - **Recommended:** slice 2 adds link creation to the same create transaction, plus a data migration that gives every existing `ACTIVE`/`ARCHIVED` collection its default link.
   - Slice 1 ships without links. The PR states that this acceptance criterion is open until slice 2.
   - Alternative: pull a minimal `GuestLink` table into slice 1. That mixes slice 2's token, encryption and permission model into this slice.
4. **[D4] Fields and lengths.**
   - **Recommended:** `title` is required, 1–100 characters after trimming; `description` is optional, at most 1000 characters. Both are plain text, rendered escaped, with line breaks kept in the description.
   - MVP has no cover image, event date, theme or other "visual settings" (§5.3 "if required by the final UX": not required).
5. **[D5] Admin URL shape.**
   - **Recommended:** `/app/collections/{uuid}` and `/app/collections/{uuid}/settings`, with no slug. Guest URLs use the link token (slice 2), so a slug would only add a uniqueness rule and a rename problem.
6. **[D6] What the dashboard and collection page show before guest links and content exist.**
   - **Recommended:**
     - dashboard cards show the title, a status badge, the description (2 lines) and "Created {date}" (for archived: "Archived {date}"); the page header shows "{used} of {limit} active collections";
     - **no** content count, link info or "coming soon" placeholders; they arrive in slices 2 and 7 (rule 18: no theater);
     - the collection page shows the details and one honest empty "Content" panel ("What guests add will appear here").
7. **[D7] Guest visibility setting (PRODUCT §7, story A3).**
   - **Recommended:** keep D7's model, where `canViewGallery` is a permission on each guest link. The admin chooses visibility on the default link in slice 2, and `Collection` gets no visibility column.
   - Please confirm. PRODUCT §7 calls it a collection setting, and §11 lists it among admin settings.
8. **[D8] Collection creation rate limit.**
   - **Recommended: 10 per account per rolling 24 hours** (the value assumed in spec §13.1), from config `LIMIT_COLLECTION_CREATIONS_PER_DAY`.
   - It is counted from `collection.create` audit events, so deleting a collection does not give the attempt back.
9. **[D9] Editing an archived collection.**
   - **Recommended:** the admin can still edit the title and description of an archived collection, and can delete it. Archive affects guests only (D11: "admin continues to see the collection").

## Deliberate choices (low risk; override if you disagree)

- **Create:** in a dialog from the dashboard (two fields). On success it goes to the new collection's page with a "Collection created" toast. It has no `Idempotency-Key`: the submit button is pending-locked, and the limit bounds duplicates (spec §9 lists idempotency keys only for texts and reports).
- **Edits** are last-write-wins, with no ETag.
- **Archive and unarchive** are idempotent (`200` with the current state). Archiving asks for confirmation (guests lose access); unarchiving does not.
- **Errors:**
  - at the limit → `409 COLLECTION_LIMIT_REACHED`;
  - the daily cap → `429 RATE_LIMITED` with `Retry-After`;
  - a malformed id → `400 VALIDATION_FAILED`;
  - someone else's, or a `DELETING`, collection → `404 NOT_FOUND`.
- **Lists:**
  - `GET /collections` uses cursor pagination over `(createdAt, id)` (ADR 0004), `limit` 1–100, default 50, newest first, filtered by `status`;
  - the dashboard loads active and archived collections separately; archived has "Show more".
- **Usage** is `GET /me/usage`: `{ activeCollections: { used, limit } }`. Storage fields are added in slice 5 (additive).
- **Audit:**
  - `collection.create`, `collection.archive`, `collection.unarchive` and `collection.delete` are recorded in the same transaction as the change;
  - metadata is `{ fromStatus, toStatus }` only, never the title or description (spec §7.4: no content);
  - plain metadata edits are not audited (not in spec §7.4's list).
- **Deferred to slice 9:** operator blocking (`blockedAt`, `blockedReason`) is added there with its behaviour.
- **Dates** are shown as date only, using next-intl `format.dateTime` with the existing `Europe/Kyiv` zone and a shared `short` date format.
- **`SettingRow`:** its second use (collection settings) moves it from `app/app/settings/page.tsx` into `packages/ui` as `SettingsSection` + `SettingRow`, with a story.
- **No new process to start:** nothing new needs a root script. Any task that adds one adds a root `package.json` script and a README row.

## Pre-implementation gate (rule 19)

- **Similar code:** `users` (`MeController`/`UsersService`), `LimitsService`, magic-link domain rate limit derived from rows, `constraintViolation()`.
- **Data:** new `Collection` and `AuditEvent` tables, one migration.
- **API:** 8 endpoints under `/api/v1` (Task 3, Task 4).
- **Permissions:** owner-only. Operators are scoped to their own collections like any admin (operator tools are slice 9).
- **Third parties:** none. No direct provider connection.
- **Retry:** archive and unarchive are idempotent; delete of a `DELETING` collection is `204`; a double create is bounded by the row lock and the limit.
- **Partial failure:** every change and its audit event share one transaction.
- **Deletion:** see [D2]. **Expiration:** none.
- **Mobile:** every screen is designed at 360 first (Tasks 5–7).
- **Tests:** contracts unit tests, API integration tests with the authorization matrix, Storybook play tests and Playwright journeys on the three projects.
- **Scope:** MVP, slice 1.

## Global Constraints

- **Branch:** `feat/phase-4-collections` from `dev` (`git switch -c feat/phase-4-collections dev`), one commit per task, PR to `dev`, merged with a merge commit (docs/development/README.md → Branches and environments).
- **Pace over polish:**
  - per-task review raises only important findings (correctness, security, data integrity, accessibility blockers); minor findings are batched into a list fixed once in Task 8;
  - one full verification at the end;
  - no repeated fix rounds on style.
- **Authorization:**
  - every collection query filters by `ownerId = principal.userId`, and the path id is a lookup inside that scope (spec §5);
  - out of scope → `404 NOT_FOUND`;
  - `DELETING` is treated as non-existent everywhere.
- **Contracts:**
  - request and response schemas live in `@stepler/contracts`;
  - no `.transform()` or `z.date()` at the boundary; dates are `z.iso.datetime()`; query values use `z.coerce` (ADR 0005);
  - the API never exposes `ownerId`, `deletionRequestedAt` or `DELETING`;
  - new error codes are appended to `ERROR_CODES`, with messages in both catalogs (an existing test enforces this).
- **Database:**
  - invariants PostgreSQL can enforce are raw-SQL `CHECK`s with explicit names, appended to a `--create-only` migration (ADR 0005, S6);
  - `pnpm db:check` passes;
  - ids are `uuidv7()`.
- **Limits:** the values come only from `LimitsService` (env-backed), never literals in services (ADR 0010).
- **OpenAPI:** every endpoint has `@ApiTags('Collections')` (or `Me`), `@ApiCookieAuth`, and an `@ApiResponse({ standardSchema })` for success. `pnpm openapi:write` regenerates `apps/api/openapi.json` in the same commit.
- **Web:**
  - server state only in TanStack Query;
  - forms with React Hook Form and the shared contract field schemas;
  - no literal UI strings (lint); copy in `apps/web/messages/{uk,en}.json` with key parity, Ukrainian default;
  - admin surface rules from `docs/ux/design-system.md`:
    - flat `bg-background`, `stepler-container`;
    - `PageHeader size="compact"`;
    - panels `rounded-2xl border bg-card shadow-xs`;
    - no header nav: brand → `/app`, account menu = Settings + Sign out;
    - settings pages are a centred `max-w-[640px]` column with the label and helper on the left and the control on the right from 600px;
  - every destructive action uses `ConfirmDialog`; toasts confirm and inline `Alert`s explain;
  - touch targets ≥ 44px; nothing hover-only; no horizontal scroll at 360px.
- **Design pass (every UI task):** before writing the screen, read and apply:
  - the frontend-design skill (`/Users/antonshapoval/.claude/plugins/cache/claude-plugins-official/frontend-design/fbe07fb6ce7d/skills/frontend-design/SKILL.md`);
  - `.claude/skills/ui-ux-pro-max`;
  - `web-design-guidelines`;
  - `responsive-design`.

  Within the v4 direction (restrained, warm light, apricot accent only as decoration; no scrapbook, no SaaS clichés such as stat-card rows or gradient heroes). After implementing, take screenshots at 360×780 and 1440×900 in light and dark. Save them outside the repository (`$TMPDIR/stepler-slice-1-screens/`); they go to the owner and into the PR, not into git.
- **Dependencies:** none added.

## Review Focus

1. **Two creates at the limit at once** (double click, two tabs). With 2 of 3 active, two concurrent `POST /collections` must give exactly one `201` and one `409 COLLECTION_LIMIT_REACHED`, with 3 active rows after. Tested in Task 3 (`Promise.all`).
2. **Changing the id in the URL or request** (IDOR). Admin B sends `GET`/`PATCH`/`archive`/`unarchive`/`DELETE` to admin A's collection: always `404`, and A's row is unchanged. The web page for a foreign or deleted id shows the not-found state, not an error or a crash. Tested in Task 3/4 (table-driven matrix) and Task 7 (e2e).
3. **Archive frees a slot, unarchive respects the limit** [D1]. At 3 of 3, archiving one allows a create; then unarchiving the archived one is `409`, and the UI explains why inline. Tested in Task 4 (API) and Task 7 (e2e).
4. **Long, unbroken or Ukrainian text at 360px.** A 100-character title without spaces and a 1000-character description must not cause horizontal scroll on the dashboard card, the collection header, the settings form or the create dialog; titles wrap (`overflow-wrap:anywhere`) or clamp, with the full text available. Tested in Tasks 5 and 6 (stories/e2e `scrollWidth <= clientWidth`) and Task 7.
5. **Stale screens after a change.** After create, archive, unarchive or delete, the dashboard lists and the "{used} of {limit}" counter update without a reload. After delete, the browser Back button to the deleted collection's page shows not-found and no `onError` toast loop. Tested in Task 7 (e2e).

---

### Task 1: Contracts for collections and usage

**Files:**
- Create: `packages/contracts/src/collections.ts`, `packages/contracts/src/collections.test.ts`
- Modify: `packages/contracts/src/errors.ts` (append `COLLECTION_LIMIT_REACHED`), `packages/contracts/src/index.ts`, `packages/contracts/src/usage.ts` (new, with its test cases in `collections.test.ts`)
- Modify: `apps/web/messages/{uk,en}.json` (`errors.COLLECTION_LIMIT_REACHED`; en "You've reached the limit of active collections. Archive one to make room.", uk "Досягнуто ліміту активних колекцій. Заархівуйте одну, щоб звільнити місце.")

**Interfaces — produces (all exported from `@stepler/contracts`):**
- `collectionTitleSchema = z.string().trim().min(1).max(100)` [D4].
- `collectionDescriptionSchema = z.string().trim().min(1).max(1000)` [D4].
- `collectionStatusSchema = z.enum(['ACTIVE', 'ARCHIVED'])`; type `CollectionStatus`.
- `collectionSchema`: a strict `{ id: z.uuid(), title: string, description: string | null, status: CollectionStatus, createdAt: iso, updatedAt: iso, archivedAt: iso | null }`; type `Collection`.
- `createCollectionRequestSchema`: a strict `{ title: collectionTitleSchema, description?: collectionDescriptionSchema | null }`; type `CreateCollectionRequest`.
- `updateCollectionRequestSchema`: a strict `{ title?: …, description?: … | null }` (`null` clears); type `UpdateCollectionRequest`.
- `collectionIdParamsSchema = z.object({ id: z.uuid() })`.
- `listCollectionsQuerySchema`: a strict `{ status: collectionStatusSchema.default('ACTIVE'), cursor?: z.string().min(1).max(200), limit: z.coerce.number().int().min(1).max(100).default(50) }`; type `ListCollectionsQuery`.
- `collectionListResponseSchema = z.object({ items: z.array(collectionSchema), nextCursor: z.string().nullable() }).strict()`; type `CollectionListResponse`.
- `usageResponseSchema = z.object({ activeCollections: z.object({ used: z.number().int().min(0), limit: z.number().int().min(0) }).strict() }).strict()`; type `UsageResponse`.

- [ ] **Step 1: Failing tests** in `collections.test.ts`:
  - `createCollectionRequestSchema` trims `'  Wedding  '` to `'Wedding'`; rejects `''`, `'   '`, 101 characters and an extra key `ownerId`; accepts a 100-character title and `description: null`.
  - The description rejects 1001 characters and accepts 1000.
  - `listCollectionsQuerySchema.parse({})` equals `{ status: 'ACTIVE', limit: 50 }`; `{ limit: '0' }` and `{ limit: '101' }` and `{ status: 'DELETING' }` fail; `{ limit: '20' }` gives `20`.
  - `collectionSchema` rejects `status: 'DELETING'` and an extra `ownerId` key.
  - `ERROR_CODES` contains `COLLECTION_LIMIT_REACHED` (and the web parity test fails until both catalogs have it).
- [ ] **Step 2:** `pnpm --filter @stepler/contracts test` → FAIL.
- [ ] **Step 3:** Implement the schemas, append the error code and add both messages.
- [ ] **Step 4:** `pnpm --filter @stepler/contracts test && pnpm --filter @stepler/web test` → PASS.
- [ ] **Step 5:** Commit `feat(contracts): collection and usage schemas`.

### Task 2: Data model — Collection, AuditEvent; audit module

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_collections/migration.sql` (via `pnpm --filter @stepler/api exec prisma migrate dev --create-only --name collections`, then append raw SQL)
- Create: `apps/api/src/audit/audit.module.ts`, `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/logging/request-id.decorator.ts`
- Modify: `apps/api/src/app.module.ts` (import `AuditModule`), `apps/api/test/database.e2e.spec.ts` (constraint tests)

**Schema:**

```prisma
enum CollectionStatus { ACTIVE ARCHIVED DELETING }
enum AuditActorType { ADMIN OPERATOR GUEST SYSTEM }

model Collection {
  id                  String           @id @default(dbgenerated("uuidv7()")) @db.Uuid
  ownerId             String           @db.Uuid
  title               String
  description         String?
  status              CollectionStatus @default(ACTIVE)
  archivedAt          DateTime?        @db.Timestamptz(3)
  deletionRequestedAt DateTime?        @db.Timestamptz(3)
  createdAt           DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt           DateTime         @updatedAt @db.Timestamptz(3)
  owner               User             @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  @@index([ownerId, status, createdAt(sort: Desc), id(sort: Desc)])
}

model AuditEvent {   // append-only; plain ids, no FKs (spec §7.4)
  id           String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  collectionId String?        @db.Uuid
  actorType    AuditActorType
  actorId      String?        @db.Uuid
  action       String
  targetType   String
  targetId     String         @db.Uuid
  metadata     Json           @default("{}")
  requestId    String?
  createdAt    DateTime       @default(now()) @db.Timestamptz(3)
  @@index([collectionId, createdAt])
  @@index([actorId, action, createdAt])
}
```

`User` gets a `collections Collection[]` back-relation. Raw SQL appended to the migration:
- `Collection_title_length` CHECK (`char_length(title) BETWEEN 1 AND 100`) [D4];
- `Collection_description_length` CHECK (`description IS NULL OR char_length(description) BETWEEN 1 AND 1000`);
- `Collection_archived_consistent` CHECK (`(status = 'ARCHIVED') = ("archivedAt" IS NOT NULL)`);
- `Collection_deleting_consistent` CHECK (`(status = 'DELETING') = ("deletionRequestedAt" IS NOT NULL)`).

**Interfaces — produces:**
- `AuditService.record(tx: Prisma.TransactionClient, event: AuditEventInput): Promise<void>`, where `AuditEventInput = { collectionId?: string; actor: Principal; action: AuditAction; targetType: 'collection'; targetId: string; metadata?: Record<string, string | number | boolean | null>; requestId?: string }` and `type AuditAction = 'collection.create' | 'collection.archive' | 'collection.unarchive' | 'collection.delete'` (extended by later slices). `actorType` derives from `principal.kind` (`admin` → `ADMIN`, `operator` → `OPERATOR`).
- `@RequestId()` param decorator returning `string | undefined` from `req.id` (set by `LoggingModule`).

- [ ] **Step 1: Failing tests** in `database.e2e.spec.ts`:
  - inserting a `Collection` with `status: 'ARCHIVED'` and no `archivedAt` fails, and `constraintViolation()` returns `{ kind: 'check', constraint: 'Collection_archived_consistent' }`;
  - the same for `DELETING` without `deletionRequestedAt` (`Collection_deleting_consistent`);
  - a 101-character title fails (`Collection_title_length`);
  - deleting a `User` who owns a collection fails (restrict);
  - an `AuditEvent` row survives deleting its collection (no FK).
- [ ] **Step 2:** `pnpm --filter @stepler/api test test/database.e2e.spec.ts` → FAIL.
- [ ] **Step 3:** Edit the schema, create the migration with `--create-only`, append the named CHECKs, apply with `pnpm db:migrate`, then implement `AuditService` and `@RequestId()`.
- [ ] **Step 4:** PASS, and `pnpm db:check` exits 0. `pnpm --filter @stepler/api test test/health.e2e.spec.ts` still passes (DI boot of the whole `AppModule`).
- [ ] **Step 5:** Commit `feat(api): collection and audit event schema`.

### Task 3: Collections API — create, list, get, update; usage

**Files:**
- Create: `apps/api/src/collections/collections.module.ts`, `collections.controller.ts`, `collections.service.ts`, `collection-dto.ts`
- Create: `apps/api/src/common/cursor.ts`, `apps/api/src/common/cursor.spec.ts`
- Create: `apps/api/src/limits/usage.service.ts`
- Modify: `apps/api/src/limits/limits.module.ts` (provide/export `UsageService`), `apps/api/src/limits/limits.service.ts` (`UserLimits.collectionCreationsPerDay`), `apps/api/src/limits/limits.service.spec.ts`, `apps/api/src/config/env.ts` (`LIMIT_COLLECTION_CREATIONS_PER_DAY: positiveInt(10)` [D8]), `apps/api/.env.example`, `apps/api/src/users/me.controller.ts` (`GET /me/usage`), `apps/api/src/app.module.ts`, `apps/api/openapi.json`
- Create: `apps/api/test/support/sessions.ts`, `apps/api/test/collections.e2e.spec.ts`

**Interfaces — consumes:** Task 1 schemas; `AuditService.record`, `@RequestId()` (Task 2); `LimitsService.forUser`; `CurrentPrincipal`.

**Interfaces — produces:**
- `encodeCursor(position: { createdAt: Date; id: string }): string` (base64url JSON) and `decodeCursor(cursor: string): { createdAt: Date; id: string } | null` (`null` for anything malformed).
- `UsageService.lockOwner(tx: Prisma.TransactionClient, userId: string): Promise<void>`: `SELECT 1 FROM "User" WHERE id = $1 FOR UPDATE`. Uploads reuse it in slice 5.
- `UsageService.activeCollections(userId: string, tx?: Prisma.TransactionClient): Promise<number>` counts `status = 'ACTIVE'` [D1].
- `UsageService.collectionCreationsSince(userId: string, since: Date, tx: Prisma.TransactionClient): Promise<{ count: number; oldest: Date | null }>` reads `AuditEvent` rows with `action = 'collection.create'`.
- `UsageService.forUser(userId: string): Promise<UsageResponse>`.
- `toCollectionDto(row: CollectionRow): Collection`: an explicit field mapping, dates as `toISOString()`. `CollectionRow` is the Prisma model type, imported as `import type { Collection as CollectionRow } from '../generated/prisma/client.js'`, to avoid the clash with the contract type.
- `CollectionsService` (each method takes `principal: Principal` first):
  - `create(principal, body: CreateCollectionRequest, requestId?: string): Promise<Collection>`;
  - `list(principal, query: ListCollectionsQuery): Promise<CollectionListResponse>`;
  - `get(principal, id: string): Promise<Collection>`;
  - `update(principal, id: string, body: UpdateCollectionRequest): Promise<Collection>`;
  - a private `findOwned(id, userId, tx?)` that excludes `DELETING` and throws `AppError('NOT_FOUND', 404)`.
- Endpoints:

  | Method | Path | Success | Errors |
  |---|---|---|---|
  | `GET` | `/api/v1/collections?status&cursor&limit` | `200 CollectionListResponse` | `400` (an invalid cursor is `VALIDATION_FAILED`) |
  | `POST` | `/api/v1/collections` | `201 Collection` | `400`, `409 COLLECTION_LIMIT_REACHED`, `429 RATE_LIMITED` + `Retry-After` |
  | `GET` | `/api/v1/collections/:id` | `200` | `400`, `404` |
  | `PATCH` | `/api/v1/collections/:id` | `200` | `400`, `404` |
  | `GET` | `/api/v1/me/usage` | `200 UsageResponse` | |

**Create algorithm** (one `prisma.$transaction`):
1. `lockOwner`.
2. Count creations in the last 24h. If at least `collectionCreationsPerDay`, throw `RATE_LIMITED` (429) with `retryAfterSeconds = ceil((oldest + 24h − now) / 1000)`.
3. If `activeCollections(tx)` is at least `forUser().activeCollections`, throw `COLLECTION_LIMIT_REACHED` (409).
4. Insert the collection.
5. `audit.record({ action: 'collection.create', metadata: { toStatus: 'ACTIVE' } })`.

The rate check comes before the limit check. The list orders by `createdAt desc, id desc`, with keyset `WHERE (createdAt, id) < (cursor)` and `take: limit + 1` to compute `nextCursor`.

- [ ] **Step 1: Failing tests.**
  - `cursor.spec.ts`: a round trip keeps the date to the millisecond and the id; `decodeCursor('x')`, `decodeCursor(base64url('{"a":1}'))` and a non-uuid id return `null`.
  - `limits.service.spec.ts`: `forUser().collectionCreationsPerDay` equals the env value.
  - `collections.e2e.spec.ts` (real PostgreSQL, `resetDatabase` per test, sign-in through the shared `signInAs(app, prisma, email): Promise<{ cookie: string; userId: string }>` helper moved from `auth-core.e2e.spec.ts`; every unsafe request sets `Origin: http://localhost:3000`):
    - `POST` with `{ title: '  Wedding ' }` → `201`, the body passes `collectionSchema` with `title: 'Wedding'`, `description: null`, `status: 'ACTIVE'`; one `AuditEvent` with `action 'collection.create'`, `actorType 'ADMIN'`, `targetId = body.id` and a non-empty `requestId`.
    - Without a cookie → `401`; without `Origin` → `403 CSRF_ORIGIN_MISMATCH`.
    - **Review Focus 1:** with 2 active, `Promise.all` of two creates → status codes sorted `[201, 409]`, and `count(ACTIVE) === 3`.
    - With 3 active and 1 archived → `409 COLLECTION_LIMIT_REACHED`; `GET /me/usage` → `{ activeCollections: { used: 3, limit: 3 } }` [D1].
    - With `LIMIT_COLLECTION_CREATIONS_PER_DAY=2` and active limit 5 (`testEnv` overrides): the third create → `429 RATE_LIMITED` with a numeric `Retry-After` > 0. After deleting one collection (direct DB status update), still `429` (the count comes from audit).
    - List: 3 active and 2 archived → `?status=ARCHIVED` returns 2 newest first; `?limit=2` returns 2 items and a cursor whose next page has 1 item and `nextCursor: null`; `?cursor=garbage` → `400 VALIDATION_FAILED`; `DELETING` rows never appear.
    - `PATCH` `{ description: 'Line 1\nLine 2' }` keeps the newline; `{ description: null }` clears it; `{ title: '' }` → `400`; `{ status: 'ARCHIVED' }` → `400` (strict).
    - **Review Focus 2, matrix part 1:** `test.each` over `GET /collections/:id` and `PATCH /collections/:id`, for admin B, an operator (`OPERATOR_EMAILS`) who is not the owner, and the owner with a `DELETING` collection → `404 NOT_FOUND`; A's row is byte-identical after. `GET /collections/not-a-uuid` → `400`. Admin B's list does not contain A's collections.
- [ ] **Step 2:** `pnpm --filter @stepler/api test` → FAIL.
- [ ] **Step 3:** Implement the module, service, usage, cursor, env var and `.env.example` row; register `CollectionsModule` in `AppModule`; run `pnpm openapi:write`.
- [ ] **Step 4:** `pnpm --filter @stepler/api test && pnpm --filter @stepler/api lint typecheck` → PASS (includes the OpenAPI snapshot).
- [ ] **Step 5:** Commit `feat(api): create, list, read and edit collections with the active-collection limit`.

### Task 4: Collection lifecycle API — archive, unarchive, delete

**Files:**
- Modify: `apps/api/src/collections/collections.controller.ts`, `collections.service.ts`, `apps/api/openapi.json`
- Create: `apps/api/test/collections-lifecycle.e2e.spec.ts`

**Interfaces — consumes:** Task 3 (`findOwned`, `UsageService.lockOwner`, `activeCollections`), Task 2 (`AuditService`).

**Interfaces — produces:**
- `CollectionsService.archive(principal, id, requestId?): Promise<Collection>`:
  - `ACTIVE` → `ARCHIVED`, sets `archivedAt = now()`, audit `collection.archive` `{ fromStatus: 'ACTIVE', toStatus: 'ARCHIVED' }`;
  - already `ARCHIVED` → return it unchanged, no audit.
- `CollectionsService.unarchive(principal, id, requestId?): Promise<Collection>`:
  - in a transaction with `lockOwner` and the active-limit check [D1], `ARCHIVED` → `ACTIVE`, clears `archivedAt`, audit `collection.unarchive`;
  - already `ACTIVE` → unchanged.
- `CollectionsService.delete(principal, id, requestId?): Promise<void>` [D2]:
  - `ACTIVE`/`ARCHIVED` → `DELETING`, sets `deletionRequestedAt`, clears `archivedAt` (CHECK), audit `collection.delete` `{ fromStatus }`;
  - already `DELETING` and owned → no-op;
  - not owned → `404`.
  - It reads the row including `DELETING`, so it uses its own owner-scoped lookup, not `findOwned`.
- Endpoints:
  - `POST /api/v1/collections/:id/archive` → `200 Collection`;
  - `POST /api/v1/collections/:id/unarchive` → `200 Collection` or `409 COLLECTION_LIMIT_REACHED`;
  - `DELETE /api/v1/collections/:id` → `204`;
  - all of them `404` out of scope.

- [ ] **Step 1: Failing tests** in `collections-lifecycle.e2e.spec.ts`:
  - Archive → `200` with `status 'ARCHIVED'` and an ISO `archivedAt`; a second archive → `200`, the same `archivedAt`, and still exactly one `collection.archive` audit row.
  - **Review Focus 3:** at 3/3 active, archive one → `POST /collections` → `201`; then unarchive the archived one → `409 COLLECTION_LIMIT_REACHED` and it stays `ARCHIVED`. A concurrent `Promise.all` of unarchive + create at 2/3 → exactly one succeeds.
  - Unarchive at 1/3 → `200`, `archivedAt: null`, audit `collection.unarchive`.
  - `PATCH` on an archived collection → `200` [D9].
  - Delete an active and an archived collection → `204`; then `GET` → `404`, the list omits them, usage drops by one for the active one, and the DB row has `status 'DELETING'` and `deletionRequestedAt` set. A second `DELETE` → `204`, with one `collection.delete` audit row.
  - **Review Focus 2, matrix part 2:** `test.each` over archive / unarchive / delete for admin B and the non-owner operator → `404`, A's row and audit count unchanged.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; run `pnpm openapi:write`.
- [ ] **Step 4:** `pnpm --filter @stepler/api test && pnpm --filter @stepler/api lint typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(api): archive, unarchive and delete collections`.

### Task 5: Dashboard and create dialog (web)

**Files:**
- Create: `apps/web/src/api/collections.ts` (fetchers, mutations' request functions, query keys)
- Create: `apps/web/src/app/app/collections-dashboard.tsx` (client), `apps/web/src/app/app/collection-card.tsx`, `apps/web/src/app/app/create-collection-dialog.tsx`, `apps/web/src/app/app/collection-form.ts` (form schema)
- Modify: `apps/web/src/app/app/page.tsx` (render the dashboard, `generateMetadata` title "Collections"), `apps/web/src/i18n/request.ts` (`formats: { dateTime: { short: { day: 'numeric', month: 'short', year: 'numeric' } } }`), `apps/web/messages/{uk,en}.json` (`collections.*`; remove the `app.placeholderTitle` / `emptyTitle` / `emptyText` keys that are no longer used)
- Test: `apps/web/src/app/app/collection-form.test.ts`, `e2e/tests/collections.spec.ts` (dashboard part)

**Interfaces — consumes:** Task 1 schemas; `apiRequest`, `isApiError`, `errorMessageKey`; `@stepler/ui` `Card`, `Badge`, `Button`, `Dialog`, `Field`, `Input`, `Textarea`, `Alert`, `EmptyState`, `Skeleton`, `PageHeader`, `useToast`.

**Interfaces — produces:**
- Query keys:
  - `COLLECTIONS_KEY = ['collections'] as const`;
  - `collectionsListKey(status: CollectionStatus) = ['collections', 'list', status] as const`;
  - `collectionKey(id: string) = ['collections', 'detail', id] as const`;
  - `USAGE_KEY = ['me', 'usage'] as const`.
- Fetchers:
  - `listCollections(status: CollectionStatus, cursor?: string): Promise<CollectionListResponse>`;
  - `fetchCollection(id: string): Promise<Collection>`;
  - `fetchUsage(): Promise<UsageResponse>`;
  - `createCollection(body: CreateCollectionRequest): Promise<Collection>`.
- `useInvalidateCollections(): () => Promise<void>` invalidates `COLLECTIONS_KEY` and `USAGE_KEY`. Every mutation in Tasks 5–6 calls it.
- Form schema:
  - `collectionFormSchema = z.object({ title: collectionTitleSchema, description: z.string().trim().max(1000) })`;
  - `toCollectionRequest(values: CollectionFormValues): CreateCollectionRequest` maps `''` → `null`;
  - `CollectionForm` field ids are `collection-title` and `collection-description`. Task 6 reuses the schema and mapping.

**Screen behaviour** [D6]:
- **Header:** `PageHeader size="compact"` with the title "Колекції" / "Collections"; the description is `collections.usage` "{used} of {limit} active collections"; `actions` holds the primary button "Нова колекція" / "New collection" (lucide `Plus`).
- **Active section:** cards in a grid, 1 column → 2 from `sm` → 3 from `lg`.
  - Each card is the title as a link to `/app/collections/{id}`, with the whole card as the hit area through a stretched link (one tab stop).
  - It shows a `Badge` (success "Активна" / neutral "В архіві"), the description clamped to 2 lines, and "Створено {date}".
  - The title wraps with `overflow-wrap:anywhere`, at most 3 lines, with `title` set to the full text.
- **Archived section:** shown only when there is at least one archived collection. An `h2` "Archive", the same cards in a muted variant (dashed border), and "Show more" when `nextCursor` is set (`useInfiniteQuery`).
- **States:**
  - loading: 3 `Skeleton` cards, and the region `aria-busy`;
  - empty (no active and no archived): `EmptyState` with the action "Create your first collection";
  - error: `Alert variant="error"` with Retry;
  - all active slots used: the button stays enabled, and the dialog opens with `Alert variant="warning"` (`collections.limitReached`, which names the limit and suggests archiving) instead of the form.
- **Create dialog:**
  - `Field` + `Input` for the title, autofocused; `Field` + `Textarea` for the description, with a live counter "{n}/1000";
  - Cancel and the primary "Create", which shows a pending label while saving and is `aria-disabled` (not `disabled`) so focus stays in the dialog (design-system rule);
  - on `409` the form is replaced by the same limit Alert (the race case); other errors show an inline `Alert` with `errorMessageKey(code)`;
  - on success: invalidate, toast "Колекцію створено", `router.push('/app/collections/{id}')`.

- [ ] **Step 1: Design.** Apply the four design skills (Global Constraints) to the dashboard and dialog: card anatomy, empty state, the limit message, and how the archived section is set apart. Write the resulting decisions as a short comment at the top of `collections-dashboard.tsx` (5–10 lines), within the v4 direction.
- [ ] **Step 2: Failing tests.**
  - `collection-form.test.ts`: `toCollectionRequest({ title: ' A ', description: '  ' })` equals `{ title: 'A', description: null }`; a 1001-character description fails `collectionFormSchema`.
  - `e2e/tests/collections.spec.ts` (all three projects):
    - a new admin sees the empty state;
    - they create "Весілля Олі та Тараса" through the dialog, land on `/app/collections/<uuid>` and see the toast;
    - Back shows the card with the "Активна" badge and "1 з 3".
  - **Review Focus 4** (`mobile-chrome`): a collection created by API with a 100-character unspaced title and a 1000-character description → on `/app`, `document.documentElement.scrollWidth <= clientWidth`, and the card title's `title` attribute holds the full text.
  - Limit: an admin with 3 active (created through the API in setup) opens "New collection" → the limit Alert is visible and there is no title field.
- [ ] **Step 3: Run** `pnpm --filter @stepler/web test` and `pnpm --filter @stepler/e2e exec playwright test collections` → FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: PASS**, then `pnpm --filter @stepler/web lint typecheck`.
- [ ] **Step 6: Screenshots.** `/app` empty, with 2 active and 1 archived, the create dialog, and the limit state; at 360 and 1440, light and dark.
- [ ] **Step 7:** Commit `feat(web): collections dashboard and create dialog`.

### Task 6: Collection page and collection settings (web)

**Files:**
- Create: `packages/ui/src/components/setting-row.tsx` (`SettingsSection`, `SettingRow`) + `setting-row.stories.tsx`
- Modify: `apps/web/src/app/app/settings/page.tsx` (use the moved components; no visual change)
- Create: `apps/web/src/app/app/collections/[id]/page.tsx`, `collection-overview.tsx` (client)
- Create: `apps/web/src/app/app/collections/[id]/settings/page.tsx`, `collection-settings.tsx` (client)
- Create: `apps/web/src/app/app/collections/collection-not-found.tsx`
- Modify: `apps/web/src/api/collections.ts` (`updateCollection`, `archiveCollection`, `unarchiveCollection`, `deleteCollection`), `apps/web/messages/{uk,en}.json`, `docs/ux/design-system.md` (inventory row for the moved component)

**Interfaces — consumes:** Task 5 keys, fetchers, `useInvalidateCollections`, `collectionFormSchema`, `toCollectionRequest`; `ConfirmDialog`, `Alert`, `Badge`, `EmptyState`, `PageHeader` `back`.

**Interfaces — produces:**
- `SettingsSection({ id, title, description?, tone?, children }: { id: string; title: ReactNode; description?: ReactNode; tone?: 'default' | 'danger'; children: ReactNode })`: an `h2` plus a panel (`divide-y rounded-2xl border bg-card shadow-xs`; `danger` uses `border-destructive/40`).
- `SettingRow({ id, label, hint, control = 'compact', children })`, where `control?: 'compact' | 'wide'`:
  - `compact` is the current layout (control `auto` on the right from 600px);
  - `wide` gives text inputs `grid-cols-[minmax(0,14rem)_minmax(0,1fr)]` from 600px, stacked on phones;
  - the label is `id`, the hint is `${id}-hint`, as today.
- Request functions:
  - `updateCollection(id: string, body: UpdateCollectionRequest): Promise<Collection>`;
  - `archiveCollection(id: string): Promise<Collection>`;
  - `unarchiveCollection(id: string): Promise<Collection>`;
  - `deleteCollection(id: string): Promise<void>`.
- After a successful mutation: `setQueryData(collectionKey(id), result)` and `useInvalidateCollections()`. Delete also does `removeQueries(collectionKey(id))`.

**Screen behaviour:**
- **`/app/collections/[id]` (overview):**
  - `back` link "Колекції" → `/app`;
  - compact `PageHeader`: the title, the status `Badge` and the description (whitespace kept, wrapped); `actions` = outline "Налаштування" (`Settings` icon) → `/settings`;
  - archived: `Alert variant="info"` "Collection archived — guests can't open it" with the action "Unarchive". On `409`, the alert switches to the limit message;
  - body: one panel "Вміст" with `EmptyState` "Тут з'явиться те, що додадуть гості" [D6];
  - not found (`404`, `400`): `CollectionNotFound` (EmptyState "Колекцію не знайдено" + a link to `/app`), with no error toast;
  - loading: skeleton header; other errors: `Alert` with Retry;
  - document title: the generic "Колекція" (no server fetch).
- **`/app/collections/[id]/settings`:** a centred `max-w-[640px]` column; `back` → the collection (label: its title, truncated); compact `PageHeader` "Налаштування колекції". Three sections:
  1. "Деталі" — `wide` rows for Title (`Input`) and Description (`Textarea` with the counter), and a panel footer with "Скасувати" (reset) and "Зберегти" (disabled until the form is dirty, pending while saving). Success → toast "Збережено"; a server error → inline `Alert`; leaving with unsaved changes needs no guard (deliberate: two fields).
  2. "Доступ гостей" — a `compact` row. When active: label "Архівувати", hint "Гості втратять доступ, усе збережеться. Можна повернути будь-коли.", outline button "Архівувати" → `ConfirmDialog` (not destructive). When archived: "Повернути з архіву", with no confirmation. The limit error is shown inline.
  3. "Небезпечна зона" (`tone="danger"`) — label "Видалити колекцію", hint "Колекцію та все в ній буде видалено назавжди." → destructive `ConfirmDialog`. The title is "Видалити «{title}»?", the confirm button is "Видалити назавжди", and `errorMessage` comes from the code. On success: `router.replace('/app')` and toast "Колекцію видалено".

- [ ] **Step 1: Design.** Apply the four design skills to the overview (what fills the page before slices 2 and 7, without placeholders) and to the settings layout (the `wide` row and the danger panel). Record the decisions in a header comment in `collection-settings.tsx`.
- [ ] **Step 2: Failing tests.**
  - Story `SettingRow/Wide` at `phone`: the control is below the label (`control.top > label.bottom`); at `laptop`, on the same row. `SettingRow/LongText` keeps `scrollWidth <= clientWidth` (Review Focus 4). `SettingsSection/Danger` passes axe in light and dark.
  - `e2e/tests/collections.spec.ts`:
    - edit the title in settings → Save → the toast, and the overview header shows the new title;
    - archive → confirm → the info Alert on the overview and the "В архіві" badge on the dashboard; unarchive from the Alert → the badge is back to "Активна";
    - delete → confirm → on `/app` the card is gone and the counter dropped;
    - `ConfirmDialog` keyboard: `Escape` cancels the delete and focus returns to the delete button.
- [ ] **Step 3:** FAIL.
- [ ] **Step 4:** Implement: move `SettingRow` (the settings page keeps its look; its existing e2e passes), then the two pages.
- [ ] **Step 5:** PASS: `pnpm turbo run lint typecheck test --filter @stepler/ui --filter @stepler/web`, `pnpm e2e`.
- [ ] **Step 6: Screenshots** of the overview (active, archived, not found) and settings (default, dirty, the delete dialog), at 360 and 1440, light and dark.
- [ ] **Step 7:** Commit `feat(web): collection page and settings with archive and delete`.

### Task 7: Cross-cutting journeys, authorization and responsive checks (e2e)

**Files:**
- Modify: `e2e/tests/collections.spec.ts`
- Create (if needed): `e2e/support/collections.ts` (`createCollectionViaApi(page: Page, title: string, description?: string): Promise<{ id: string }>`, which posts through `page.request` with the session cookie and `Origin`)

**Interfaces — consumes:** `signIn`, `newEmail` (`e2e/support/auth.ts`); Tasks 5–6 screens and copy.

- [ ] **Step 1: Failing tests.**
  - **Review Focus 2:** admin A creates a collection; admin B (a second browser context) opens `/app/collections/{A's id}` and `/settings` → `CollectionNotFound` is visible, no `role=alert` error, and `page.request.patch` returns `404`.
  - **Review Focus 3:** at 3/3, archive one through settings, create a new one from the dashboard (success), then "Unarchive" on the archived one → the inline limit message (`errors.COLLECTION_LIMIT_REACHED` copy) and the badge stays "В архіві".
  - **Review Focus 5:** delete from settings, then `page.goBack()` twice to the deleted overview → `CollectionNotFound`, with no toast within 2s; the counter on `/app` matches `GET /me/usage`.
  - **Review Focus 4:** on all three projects, `/app`, the overview, settings and the open create dialog with the long-title fixture → no horizontal scroll.
  - Keyboard path on `desktop-chrome`: `Tab` to "New collection" → `Enter` → type the title → `Enter` submits → lands on the overview.
- [ ] **Step 2:** `pnpm e2e` → FAIL where behaviour is missing; fix in the owning Task 5/6 files.
- [ ] **Step 3:** PASS on all three projects.
- [ ] **Step 4:** Commit `test(e2e): collection journeys, isolation and responsive checks`.

**Checkpoint (design review with the owner):** show the owner the screenshot set from Tasks 5 and 6 (360 and 1440, light and dark) together with the flow (create → edit → archive → delete), before Task 8. Owner feedback is batched into one fix commit, `fix(web): collection screens after design review`. Re-shoot only the screens that changed.

### Task 8: Docs, batched minors, full verification, PR

**Files:**
- Modify: `docs/architecture/mvp-architecture-spec.md`:
  - §7.2 `Collection`: actual columns `archivedAt` and `deletionRequestedAt`; blocking columns deferred to slice 9;
  - §12: slice 1 sets `DELETING`, and slice 5 adds the purge;
  - §13.1: the creation limit, counted from audit events, and "Active = `ACTIVE` only" [D1];
  - mark items *Implemented in slice 1*.
- Modify: `BOOTSTRAP.md` (slice 1 status, plan link, the open acceptance item from [D3]); `docs/ux/design-system.md` (dashboard card and danger-zone patterns, `SettingRow` `wide`); `README.md` (env var `LIMIT_COLLECTION_CREATIONS_PER_DAY` if the README lists limits; otherwise only `.env.example`).
- Add an ADR only if the owner changed [D1] or [D2] from the default in a way that departs from spec §12/§13. Otherwise the spec update is enough.

- [ ] **Step 1:** Apply the batched minor findings from the per-task reviews (one commit, no scope growth).
- [ ] **Step 2:** Update the docs above.
- [ ] **Step 3: Full verification, once:** `pnpm format:check && pnpm turbo run lint typecheck test build build-storybook && pnpm db:check && pnpm e2e`. Everything must pass; report failures as they are.
- [ ] **Step 4:** Review the diff against `.claude/rules/11-code-review.md`, especially owner scoping in every query (`grep -n "collection\." apps/api/src/collections` shows `ownerId` in every `where`), no `ownerId` in DTOs, and no `meta` logging.
- [ ] **Step 5:** Commit `docs: collections slice; spec and design-system updates`. Push and open the PR `feat/phase-4-collections` → `dev`. The body includes: summary, the owner decisions as answered, the open acceptance criterion [D3], the test evidence (commands and results), and the screenshots.
  - PR checklist note: the acceptance criterion "A default guest link is created" (PRODUCT §5.3, [D3]) stays **open for slice 2**; slice 1 creates collections without links.

## Checkpoints

Execution (agreed 2026-10-01): subagents implement; an independent review only after Tasks 3–4 (API and access control) and one final whole-branch review; minors are batched into Task 8.

- **After Task 4** (API complete): one independent review of the API, covering authorization, the transaction and lock in create and unarchive, error codes and the OpenAPI diff. Important findings only.
- **After Task 7:** the design review with the owner (above).
- **After Task 8:** a whole-branch review, one fix round, merge to `dev` with a merge commit. Promote with a `dev → stage` PR when the owner wants it on staging.

## Out of scope for slice 1

- Guest links, QR, default-link creation [D3] (slice 2); guest sessions, guest pages, `410` for `DELETING` (slice 3).
- Content counts, the gallery, storage usage in `/me/usage` (slices 5 and 7); the purge job that hard-deletes `DELETING` collections (slice 5).
- Operator blocking of collections and accounts (slice 9); legal acceptance (slice 10).
- Collection cover, event date, themes, folders, retention, export.
