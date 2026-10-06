# Stepler Slice 9b: Appeals, Moderation Quarantine and the Ops Split — Plan Addendum

> **For agentic workers:** this addendum extends `2026-10-06-content-reports-and-operator.md` (slice 9, implemented on `fix/polish-batch-2`). Build on that code; do not restructure what works. Steps use checkbox (`- [ ]`) syntax for tracking. One commit per task.

**Goal:** The collection admin can appeal, in the app, a frame the Stepler operator hid or deleted and a collection the operator blocked. An operator deletion no longer purges at once: the frame goes into a 90-day quarantine that the operator can undo (a mistake, or an upheld appeal). The `/ops` console separates guest reports from admin appeals. Before that, two owner remarks on the status surfaces the appeal UI will touch: one truthful collection status everywhere (S1) and a multi-select dashboard status filter (S2).

**Owner request (2026-10-06, after trying slice 9 locally):** appeals; quarantine instead of immediate purge; the ops split. Owner remarks S1 and S2 (2026-10-06, screenshots 188/189).

**Spec:** slice 9 plan (R1–R8, P1–P8, Q1–Q7), ADR 0013, `mvp-architecture-spec.md` §7.3, §7.4, §8, §9, §11, §13.2; `docs/design/DESIGN-SYSTEM.md` §0 (V1), §0.11 (ops console), §5.8 (Badge), §5.9 (Frame marks); legal v2 drafts (unreleased, so they are edited in place, Q-A7).

## Decisions (recommended defaults, confirmed as the working hypothesis; each is one place to change)

1. **[Q-A1] Quarantine is the operator's deletion only.** The admin's and the guest's delete keep today's behaviour (soft delete, prompt purge).
   - `ContentItem` gets `quarantinedAt`, `quarantinedByUserId` (no FK), `quarantineReason` (1–500), `purgeAfter` (= `quarantinedAt` + `MODERATION_QUARANTINE_DAYS`, default 90; an API env variable, since the API stamps the date). `deletedAt` stays `NULL` while quarantined, so `content.purge` (which refuses undeleted items) cannot purge it by accident.
   - **Guests never see it:** `GUEST_VISIBLE` gains `quarantinedAt: null`. The partial guest indexes keep their predicate (the extra filter is implied by them; no index rebuild).
   - **The admin sees it** in «Вміст» as «Видалено модерацією»: greyed tile (a `Frame` `dimmed` prop), a destructive ring, the reason and the purge date in the viewer; no download (the detail's `originalUrl` / `downloadUrl` are `null`); the admin's hide/unhide → `409 CONTENT_MODERATED`; the admin's own delete still works (their data; it ends the quarantine with a prompt purge, and any open appeal on it stays resolvable as «Вміст видалено»). The «Стан» filter gains «Видалено модерацією» (`QUARANTINED`); counts gain `quarantined`; the identity becomes `active + hiddenByAdmin + hiddenByOperator + quarantined + (reported, not hidden, not quarantined) = total`.
   - **Quarantine replaces an operator hide** (the measure escalates): quarantining a frame the operator hid clears the hide fields in the same update; an admin hide is kept, so a restore returns the frame to the admin's state. Restore clears the quarantine fields only.
   - **Quota:** quarantined bytes do not count toward the owner's quota or the collection size (`UsageService` adds `AND c."quarantinedAt" IS NULL` in its three sums; `contentStats` keeps counting the frame). They exist in storage until the purge; the ops detail shows «У карантині до {date}».
   - **Purge:** the hourly sweep soft-deletes frames whose `purgeAfter` has passed, through `ContentDeletion.softDelete` with the actor `'system'` and `reason: 'quarantine_expired'`, so the existing `content.purge` path removes the objects. A collection's purge removes quarantined frames with everything else (cascade + prefix delete). Reports on a quarantined frame stay resolvable; `frameNo` stays reserved.
2. **[Q-A2] Who appeals what:** the collection admin only, on a frame hidden by the operator, a quarantined frame, or a blocked collection. Not in-app: a blocked account (e-mail), admin-hidden frames (the admin unhides).
3. **[Q-A3] `ModerationAppeal`** `{ id, collectionId, targetType (CONTENT | COLLECTION), targetId, submittedByUserId, text (1–1000), status (OPEN | UPHELD | REJECTED), createdAt, resolvedByUserId?, resolvedAt?, resolutionNote? (required on REJECTED, optional on UPHELD), requestId?, operatorNotifiedAt? }`. No FKs (like reports). One `OPEN` appeal per target (partial unique index); a new appeal after a decision is allowed (history). `LIMIT_APPEALS_PER_ACCOUNT_PER_DAY` (20), counted from rows.
   - A target that is not in an appealable state → `409 APPEAL_NOT_APPLICABLE`; an open appeal already → `409 APPEAL_OPEN` (a unique violation from a double submit is mapped to it); another admin's collection → `404`.
4. **[Q-A4] Operator decisions:** «Задовольнити» (`UPHELD`) reverses the measure in the same transaction (unhide / restore / unblock, each audited by its own use case) with an optional note; «Відхилити» (`REJECTED`) needs a note. Deciding an appeal never touches guest reports. Idempotent per status; the other status → `409 APPEAL_RESOLVED`.
5. **[Q-A5] The admin learns the status in-app only:** the latest appeal is embedded in `AdminContentDetail.appeal` and listed by `GET /collections/{id}/appeals` for the blocked banner. «Подати апеляцію» is disabled while one is `OPEN`. **Mail:** none to the admin; one `mail.appeal-received` per new appeal to `OPERATOR_EMAILS` (target type and the `/ops/appeals/{id}` link only).
6. **[Q-A6] The ops split:** a nav under the console header: «Скарги гостей» (`/ops/reports`) and «Апеляції адміністраторів» (`/ops/appeals`, tabs Нові / Задоволені / Відхилені). The appeal detail shows the target with the report detail's content stage, the admin's text, the measure and its reason, previous appeals, related reports (links), and the two actions. API `/api/v1/operator/appeals…` in `OperatorModule`; admin API in a new `AppealsController` (`@ApiTags('Moderation')`). Operator scope becomes «reported or appealed» (`OperatorScope` adds `OR EXISTS (ModerationAppeal …)`).
7. **The operator's delete route is renamed:** `POST /operator/content/{id}/quarantine` and `POST /operator/content/{id}/restore` replace `…/delete` (slice 9 is unreleased; the console is the only client). The console's button reads «Видалити (карантин 90 днів)».
8. **[S1] One display status:** `collectionDisplayStatus({ status, blocked })` in `@stepler/contracts` with precedence `BLOCKED > DELETING > ARCHIVED > ACTIVE`, and a presentational `CollectionStatusBadge` in `@stepler/ui` (variant + icon per display status; the label comes in). The access badge is neutral «Доступ закрито» for blocked or archived. A blocked card/row gets a 2px destructive left accent (not muted: it is an alert), distinct from the archived muted surface.
9. **[S2] The dashboard status filter is a multi-select** over the display status (`active` / `archived` / `blocked`), the «Вміст» «Стан» pattern (checkbox dropdown, mono counts, «Скинути»), OR between states, AND with the search, `?state=` repeated in the URL. Filtering stays client-side (today the page loads the ACTIVE and ARCHIVED lists and filters in the browser): a blocked collection is in one of those lists already, so the API list endpoint does not change. The «Архів · N» group stays in the unfiltered list; no group heading when a state is checked.

## Pre-implementation gate (rule 19)

- **Similar code:** `ContentHiding` (conditional update + audit), `ContentDeletion.softDelete`, `ReportResolution.resolve` (idempotent per status), `BlockingService`, `OperatorScope`, `OperatorQueries` (keyset queue), `ReportReceivedMailHandler` + `renderReportReceivedEmail`, `MaintenanceSweepHandler`, `ReportsService.create` (per-session count from rows), `LimitsService`; web: `ModerationPanel`, `BlockedBanner`, `moderation-marks.tsx`, `content-filters.ts`, `ReportQueue` / `ReportDetail` / `ReasonDialog` / `actions.ts`, `ReportDialog` (UI package), the content tab's «Стан» dropdown, `collection-row.tsx` badges, `visibleCollections`.
- **Data:** 4 nullable columns on `ContentItem`, one new table, two enums, partial unique index, CHECKs; no backfill.
- **API:** 3 admin routes (`POST /collections/{id}/content/{itemId}/appeals`, `POST /collections/{id}/appeals`, `GET /collections/{id}/appeals`), 3 operator appeal routes, 2 renamed operator content routes; DTO fields `moderation.quarantined`, `appeal`, `counts.quarantined`, state `QUARANTINED`, operator item state `QUARANTINED`; error codes `APPEAL_NOT_APPLICABLE`, `APPEAL_OPEN`, `APPEAL_RESOLVED`.
- **Permissions:** admins appeal on their own collections only (IDOR → 404). The operator's scope widens to appealed targets. Guests: nothing new.
- **Third parties:** SMTP via the worker (existing). Nothing reaches the browser.
- **Retry:** quarantine/restore idempotent (conditional updates); appeal creation returns `409 APPEAL_OPEN` on a replay (the UI refetches); decisions idempotent per status; mail idempotent by `operatorNotifiedAt`; the sweep's soft delete is conditional.
- **Partial failure:** appeal row + audit + mail job commit together; uphold + reversal commit together.
- **Deletion:** appeals survive purges (no FKs); the detail shows «Вміст видалено» / «Колекцію видалено». An admin delete of a quarantined frame leaves its appeal resolvable.
- **Expiration:** `purgeAfter` by the sweep (hourly; a frame may live up to an hour past it).
- **Mobile:** the appeal dialog is a bottom sheet below 640; the ops nav and appeal pages follow the console's phone cards.
- **Tests:** contracts unit; migration constraints; API integration per route (actor matrix, IDOR, scope, idempotency, limits, quota, sweep with a fake clock); worker handler with Mailpit; UI stories + axe; web unit (helpers); e2e journeys.
- **Scope:** MVP slice 9b. Not here: a user trash, appeals by guests, appeals on blocked accounts, operator notes visible to guests, a separate ops deployment.

## Global constraints

As in the slice 9 plan (branch `fix/polish-batch-2`, one commit per task, TDD, authorization tests per route, no literal UI strings, uk first with en parity, `pnpm openapi:write` with every API change, migrations via `prisma migrate dev --create-only` + named raw SQL, `pnpm db:check`, design pass header comments on UI files, V1 design system). New env variables go through `env.ts` / `worker-env.ts` with tests, `.env.example`, `turbo.json`, `e2e/playwright.config.ts`, `render.yaml`, `docker/scripts/verify-images.sh` and the README table.

---

### Task A [S1]: One truthful collection status

**Files:**
- Create: `packages/contracts/src/collection-status.ts`, `packages/contracts/src/collection-status.test.ts`, `packages/ui/src/components/collection-status-badge.tsx`, `collection-status-badge.stories.tsx`
- Modify: `packages/contracts/src/index.ts`, `apps/web/src/app/app/collection-row.tsx` (`CollectionStatusBadge` → the UI one, `AccessBadge`), `collection-card.tsx`, `archived-style.ts` (+ `BLOCKED_ACCENT`), `collections/[id]/collection-header.tsx`, `share-dialog.tsx` (blocked → «Доступ закрито» instead of the link's state), `apps/web/src/ops/report-detail.tsx` (one status badge), messages `collections.status.*`, `ops.collectionStatuses.*`, `e2e/tests/blocking.spec.ts`

**Interfaces — produces:**
- `COLLECTION_DISPLAY_STATUSES = ['BLOCKED', 'DELETING', 'ARCHIVED', 'ACTIVE'] as const`; `type CollectionDisplayStatus`.
- `collectionDisplayStatus(c: { status: 'ACTIVE' | 'ARCHIVED' | 'DELETING'; blocked: unknown | null }): CollectionDisplayStatus` — `blocked !== null` → `BLOCKED`, else the status.
- `CollectionStatusBadge({ status, label, className? })` in `@stepler/ui`: `BLOCKED` → `danger` + `Ban` icon; `DELETING` → `neutral` + `Trash2`; `ARCHIVED` → `neutral` + `Archive`; `ACTIVE` → `success`, no icon. `data-slot="collection-status"`, `data-status`.
- `AccessBadge`: display `BLOCKED` or `ARCHIVED` → neutral «Доступ закрито»; else the main link's badge.
- `BLOCKED_ACCENT = 'shadow-[inset_2px_0_0_var(--destructive)]'` on blocked rows, cards and tiles (and not `ARCHIVED_SURFACE` unless also archived).

- [ ] **Step 1: Failing tests:** `collection-status.test.ts` covers every `status × blocked` combination (blocked + archived → `BLOCKED`); a story play asserts the badge text and `data-status` for the four states, with axe. In `blocking.spec.ts`, the dashboard card shows exactly one status badge «Заблоковано» and the access badge «Доступ закрито», and no «Колекція активна»; the ops detail «Стан» cell shows one badge «Заблоковано».
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm turbo run lint typecheck test --filter @stepler/contracts --filter @stepler/ui --filter @stepler/web`, `pnpm e2e -- blocking` → PASS.
- [ ] **Step 5: Commit** `feat(web): one collection display status (blocked > deleting > archived > active) on every surface`.

### Task B [S2]: Dashboard status filter as a multi-select

**Files:**
- Modify: `apps/web/src/app/app/collection-filters.ts` + `.test.ts` (`COLLECTION_STATE_FILTERS = ['active', 'archived', 'blocked']`, `statesFromParams`, `visibleCollections(…, { states, query, sort, locale })`, `stateCounts`), `collections-dashboard.tsx` (the toolbar's dropdown, URL `?state=`, group heading only when `states.length === 0`), messages `collections.state.*`, `e2e/tests/collections.spec.ts` (the segment clicks → the dropdown), `docs/design/DESIGN-SYSTEM.md` (dashboard toolbar note)

**Interfaces — produces:**
- `visibleCollections(active, archived, { states: readonly CollectionStateFilter[]; query; sort; locale })`: pool = both lists; a collection matches when `states` is empty or contains the filter of its display status.
- `stateCounts(active, archived): Record<CollectionStateFilter, number>` by display status.
- The dropdown: trigger «Стан: Усі» / one label / «N вибрано»; items «Активні», «В архіві», «Заблоковані» with mono counts (a «+» suffix stays as today when a list has more pages); «Скинути» at the foot; nothing checked = all. 44px items on coarse pointers (the `DropdownMenuCheckboxItem` already is).

- [ ] **Step 1: Failing tests:** `collection-filters.test.ts`: `statesFromParams(['blocked','x']) → ['blocked']`; `visibleCollections` with `['blocked']` returns only blocked ones (an archived+blocked collection counts as blocked, not archived); with `['active','blocked']` the union; empty = all; the search still ANDs. e2e: open the dropdown, tick «Архів» → only the archived card; tick «Активні» too → both; «Скинути» → all with the «Архів · 1» heading.
- [ ] **Step 2: Run** → FAIL. **Step 3: Design pass, implement.** **Step 4: Run** → PASS (`pnpm e2e -- collections`, three browsers).
- [ ] **Step 5: Commit** `feat(web): dashboard «Стан» multi-select filter (active, archived, blocked) like «Вміст»`.

### Task 1: Contracts

**Files:**
- Create: `packages/contracts/src/appeals.ts`, `appeals.test.ts`
- Modify: `content.ts` (+ `QUARANTINED` state, `counts.quarantined`, `contentQuarantinedSchema`, `moderation.quarantined`, `adminContentDetailSchema.appeal`), `reports.ts` (`contentModerationSchema`), `operator.ts` (`operatorItemStateSchema` + `QUARANTINED`; detail `content.quarantined`; appeal queue/detail/resolve schemas; `operatorAppealIdParamsSchema`), `errors.ts` (+ `APPEAL_NOT_APPLICABLE` 409, `APPEAL_OPEN` 409, `APPEAL_RESOLVED` 409), `index.ts`, tests

**Interfaces — produces (`appeals.ts`):**
- `APPEAL_TEXT_MAX_CHARS = 1000`; `appealTextSchema` (trimmed, 1–1000 code points, no C0 except line breaks and tabs).
- `appealTargetTypeSchema = z.enum(['CONTENT', 'COLLECTION'])`; `appealStatusSchema = z.enum(['OPEN', 'UPHELD', 'REJECTED'])`.
- `createAppealRequestSchema = { text: appealTextSchema }`.
- `adminAppealSchema = { id, targetType, targetId: z.uuid(), status, text, createdAt, resolution: { status: z.enum(['UPHELD','REJECTED']), note: z.string().nullable(), at } | null }` (never who decided).
- `adminAppealListSchema = { items: adminAppealSchema[] }` (newest first, ≤ 50).
- `contentQuarantinedSchema = { at, reason: z.string(), purgeAfter: z.iso.datetime() }`.

**Interfaces — produces (`operator.ts`):**
- `operatorAppealListQuerySchema = { status: appealStatusSchema.default('OPEN'), cursor?, limit (1–100, 50) }`.
- `operatorAppealMeasureSchema = z.enum(['HIDDEN', 'QUARANTINED', 'BLOCKED', 'NONE'])` (what the appeal is against, as it stands now).
- `operatorAppealRowSchema = { id, targetType, status, createdAt, measure, content: { id, kind, frameNo, state } | null, collection: { id, title } | null }`; `operatorAppealPageSchema`.
- `operatorAppealDetailSchema = { appeal: { id, targetType, text, status, createdAt, resolution: { status, note: string | null, at } | null }, previousAppeals: { id, status, text, createdAt, resolution }[], measure, content: <the report detail's content shape> | null, collection: <same> | null, owner: <same> | null, relatedReports: { id, reason, status, createdAt }[] }`.
- `resolveAppealRequestSchema = z.object({ status: z.enum(['UPHELD', 'REJECTED']), note: moderationTextSchema.optional() }).strict().refine(status === 'REJECTED' → note defined)`.

- [ ] **Step 1: Failing tests:** `appealTextSchema` rejects `''`, 1001 code points and `'\u0007'`; `resolveAppealRequestSchema` rejects `{status:'REJECTED'}` and accepts `{status:'UPHELD'}`; `adminAppealSchema` has no key matching `/user|email/i`; `ERROR_CODES` has the three codes with uk/en; `contentStateSchema` accepts `QUARANTINED`; `operatorItemStateSchema` accepts `QUARANTINED`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm --filter @stepler/contracts test typecheck lint`).
- [ ] **Step 5: Commit** `feat(contracts): appeals, quarantine state and operator appeal contracts`.

### Task 2: Data model and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_appeals_and_quarantine/migration.sql`, `apps/api/test/migration-appeals.e2e.spec.ts`

**Schema:**
```text
enum AppealTargetType { CONTENT COLLECTION }
enum AppealStatus     { OPEN UPHELD REJECTED }

ContentItem += quarantinedAt? timestamptz(3), quarantinedByUserId? uuid (no FK), quarantineReason? text, purgeAfter? timestamptz(3)

ModerationAppeal
  id uuidv7, collectionId uuid, targetType AppealTargetType, targetId uuid, submittedByUserId uuid   -- no FKs
  text text, status AppealStatus default OPEN, createdAt, resolvedByUserId? uuid, resolvedAt?, resolutionNote?,
  requestId? text, operatorNotifiedAt?
  INDEX (status, createdAt DESC, id DESC)      -- operator queue
  INDEX (targetType, targetId, createdAt DESC) -- latest/previous appeals, scope
  INDEX (collectionId, createdAt DESC)         -- the admin's list
  INDEX (submittedByUserId, createdAt)         -- the daily limit
```
Raw SQL: `ModerationAppeal_one_open_per_target` UNIQUE `(targetType, targetId) WHERE status = 'OPEN'`; CHECKs `ModerationAppeal_text_length` (1–1000), `ModerationAppeal_note_length` (1–500), `ModerationAppeal_resolved_consistent` (`(status='OPEN') = (resolvedAt IS NULL) AND (resolvedAt IS NULL) = (resolvedByUserId IS NULL)`), `ModerationAppeal_rejection_note` (`status <> 'REJECTED' OR resolutionNote IS NOT NULL`), `ModerationAppeal_open_has_no_note` (`status <> 'OPEN' OR resolutionNote IS NULL`); `ContentItem_quarantine_consistent` (`quarantinedAt`, `quarantinedByUserId`, `quarantineReason`, `purgeAfter` all set or all null), `ContentItem_quarantine_reason_length` (1–500), `ContentItem_quarantine_not_operator_hidden` (`quarantinedAt IS NULL OR hiddenBy IS DISTINCT FROM 'OPERATOR'`); partial index `ContentItem_quarantine_purge_idx (purgeAfter) WHERE quarantinedAt IS NOT NULL AND deletedAt IS NULL`.

- [ ] **Step 1: Failing test:** each CHECK violates as named; a second OPEN appeal on one target violates the unique index while a REJECTED + OPEN pair is allowed; `pg_indexes` lists `ContentItem_quarantine_purge_idx`; deleting a `Collection` leaves its appeals.
- [ ] **Step 2–4:** FAIL → `prisma migrate dev --create-only --name appeals_and_quarantine`, append SQL → PASS; `pnpm db:check`; `pnpm db:deploy` on the owner's DB, `prisma migrate status`.
- [ ] **Step 5: Commit** `feat(db): moderation appeals and content quarantine`.

### Task 3: Quarantine in the API

**Files:**
- Create: `apps/api/src/moderation/content-quarantine.ts`, `apps/api/test/quarantine.e2e.spec.ts`
- Modify: `content-visibility.ts` (+ `quarantinedAt: null`), `moderation-reads.ts` (`moderationOf` + `quarantined`, `stateCounts` + `quarantined`, hidden-operator excludes quarantined), `admin-content.service.ts` (state `QUARANTINED`; hide/unhide on quarantined → 409; `get` nulls the original links when quarantined), `content-hiding.ts` (where clauses add `quarantinedAt: null`), `content-deletion.ts` (`actor: AuditActor`), `limits/usage.service.ts` (3 sums), `config/env.ts` + spec (`MODERATION_QUARANTINE_DAYS` 90), `limits.service.ts`, `operator/operator-actions.controller.ts` + `.service.ts` (`quarantine`, `restore`; `delete` removed), `operator-dto.ts` (`itemState` + `QUARANTINED`), `operator-queries.ts` (detail `content.quarantined`; nothing signed for `original` of a quarantined frame, previews still), `worker/handlers/maintenance-sweep.handler.ts` (+ `purgeExpiredQuarantine`), `worker.module.ts` (+ `ContentDeletion`, `AuditService`), `audit.service.ts` (+ `content.quarantine`, `content.restore`), `moderation-guest-paths.e2e.spec.ts` (+ quarantined frame), `operator.e2e.spec.ts` (delete → quarantine), `worker-handlers.e2e.spec.ts` or the new spec (sweep)

**Interfaces — produces:**
- `ContentQuarantine.quarantine(tx, item: HideTarget, op: OperatorPrincipal, reason, days, requestId?): Promise<'quarantined' | 'unchanged'>`: `UPDATE … SET quarantinedAt=now(), quarantinedByUserId, quarantineReason, purgeAfter = now() + days, hiddenAt/hiddenBy/hiddenByUserId/hiddenReason = NULL WHERE hiddenBy = 'OPERATOR' … WHERE id AND deletedAt IS NULL AND quarantinedAt IS NULL` (one conditional `updateMany`; the hide clearing as a CASE in raw SQL, or two statements in the transaction); audit `content.quarantine` `{ reason, purgeAfter, replacedHide: boolean }`.
- `ContentQuarantine.restore(tx, item, op, reason, requestId?): Promise<'restored' | 'unchanged'>`: `… WHERE quarantinedAt IS NOT NULL AND deletedAt IS NULL`; audit `content.restore` `{ reason }`.
- `GUEST_VISIBLE = { deletedAt: null, hiddenAt: null, quarantinedAt: null }`.
- `moderationOf(row, openReports)` → `{ hidden, quarantined: { at, reason, purgeAfter } | null, openReports }`.
- Operator routes: `POST /operator/content/{id}/quarantine {reason}` → 204; `POST …/restore {reason}` → 204.
- Sweep: `contentItem.findMany({ where: { quarantinedAt: { not: null }, deletedAt: null, purgeAfter: { lt: now } }, take })`, grouped by collection, `softDelete(tx, collectionId, ids, 'system', { bulk: false, reason: 'quarantine_expired' })` in chunks; logs `quarantinePurged: n`.

- [ ] **Step 1: Failing tests** (`quarantine.e2e.spec.ts`, scene from `operator.e2e.spec.ts`):
  - the operator quarantines a reported frame → `204`; the row has `quarantinedAt`, `purgeAfter ≈ now + 90d` (with `MODERATION_QUARANTINE_DAYS=90`), `deletedAt null`; one `content.quarantine` event; no `content.purge` job; a repeat → `204`, nothing new;
  - a frame the operator hid, then quarantined → `hiddenBy null`, `replacedHide: true`; an admin-hidden frame keeps `hiddenBy ADMIN`;
  - guests: absent from `?scope=all` / `?scope=own`, `GET` → 404, counts drop, text replay → 404, own delete → 404 (append to `moderation-guest-paths`);
  - the admin: the list shows it with `moderation.quarantined.reason`, `counts.quarantined === 1`, `?state=QUARANTINED` returns it, `?state=HIDDEN_OPERATOR` does not; `GET /content/{id}` has `originalUrl: null`, `downloadUrl: null` and still `thumbnailUrl`; hide/unhide → `409 CONTENT_MODERATED`; `DELETE` → 204 and `deletedAt` set;
  - quota: `GET /me/usage` and `GET /collections/{id}` `storageBytes` drop by the frame's bytes after quarantine and come back after restore (use an uploaded photo fixture);
  - restore → fields null, audit `content.restore`, guests see it again;
  - the operator detail shows `content.quarantined` and `originalUrl: null`; the queue row state `QUARANTINED`;
  - scope: an unreported frame → 404 for both routes; an admin → 404;
  - the sweep with `vi.setSystemTime(purgeAfter + 1h)` soft-deletes the frame (`deletedAt`, `content.delete` by `SYSTEM` with `reason: 'quarantine_expired'`, a `content.purge` job); a frame with `purgeAfter` in the future is untouched; a run again does nothing.
- [ ] **Step 2–4:** FAIL → implement, `pnpm openapi:write` → PASS; `pnpm --filter @stepler/api test`.
- [ ] **Step 5: Commit** `feat(api): operator deletions quarantine frames for 90 days, restorable and outside the quota`.

### Task 4: Appeals in the API

**Files:**
- Create: `apps/api/src/moderation/appeals.service.ts`, `appeals.controller.ts` (admin), `apps/api/src/operator/operator-appeals.controller.ts`, `operator-appeal-queries.ts`, `apps/api/src/moderation/appeal-resolution.ts`, `apps/api/src/mail/templates/appeal-received.ts`, `apps/api/src/worker/handlers/appeal-received-mail.handler.ts`, `apps/api/test/appeals.e2e.spec.ts`, `apps/api/test/appeal-mail.e2e.spec.ts`
- Modify: `moderation.module.ts`, `operator.module.ts`, `operator-scope.ts` (reported or appealed), `collections.module.ts` or `content.module.ts` (mounts `AppealsController`), `admin-content.service.ts` (`get` + `appeal`), `audit.service.ts` (+ `appeal.create`, `appeal.uphold`, `appeal.reject`, targetType `'appeal'`), `jobs/job-names.ts` (+ `mail.appeal-received`), `limits.service.ts` + `env.ts` (`LIMIT_APPEALS_PER_ACCOUNT_PER_DAY` 20), `mail/templates/messages.ts` (`APPEAL_RECEIVED_COPY`), `worker.module.ts`

**Interfaces — produces:**
- `AppealsService.createForContent(a: AdminPrincipal, collectionId, contentId, text, requestId?): Promise<AdminAppeal>`; `createForCollection(a, collectionId, text, requestId?)`; `listForAdmin(a, collectionId): Promise<AdminAppeal[]>`; `latestForContent(contentId): Promise<AdminAppeal | null>`.
  - `jobs.ready()`, then one transaction: owner scope (`collection.ownerId = a.userId AND status <> 'DELETING'`, else 404); the target state (`hiddenBy='OPERATOR'` or `quarantinedAt IS NOT NULL`, not deleted / `blockedAt IS NOT NULL`), else `409 APPEAL_NOT_APPLICABLE`; the daily count by `submittedByUserId` (24 h) ≥ limit → `429 RATE_LIMITED`; insert (unique violation → `409 APPEAL_OPEN`); audit `appeal.create` `{ targetType, targetId }`; enqueue `mail.appeal-received { appealId }`; log `appeal.created { appealId, collectionId, targetType }`.
- Admin routes (`@ApiTags('Moderation')`): `POST /collections/{id}/content/{itemId}/appeals` → `201 AdminAppeal`; `POST /collections/{id}/appeals` → `201`; `GET /collections/{id}/appeals` → `200 { items }`.
- `OperatorScope.reportedContent` / `assertReportedCollection` / `assertReportedOwner` add `OR EXISTS (SELECT 1 FROM "ModerationAppeal" … )` on the matching target (owner: through `collectionId`). `assertScopedAppeal(id)` → the appeal row or 404.
- `AppealResolution.resolve(op, appealId, { status, note }, requestId?)`: one transaction: load (404); not OPEN → same status 200 / else `409 APPEAL_RESOLVED`; conditional `updateMany WHERE status='OPEN'` (loser re-reads); on `UPHELD` reverse: CONTENT → `ContentQuarantine.restore` if quarantined, else `ContentHiding.unhide` if operator-hidden (a frame already visible or deleted: no-op, still upheld); COLLECTION → `BlockingService.unblockCollection` (needs a `tx` variant: add `unblockCollectionIn(tx, …)`); audit `appeal.uphold` / `appeal.reject` `{ targetType, targetId, note }`.
- Operator routes: `GET /operator/appeals?status&cursor&limit`, `GET /operator/appeals/{id}`, `PATCH /operator/appeals/{id}` → detail.
- `renderAppealReceivedEmail({ targetType, url })` uk: subject «Stepler: нова апеляція ({кадр|колекція})», lines «Адміністратор колекції подав апеляцію.», «Щодо: {label}», «Переглянути: {url}». `AppealReceivedMailHandler` mirrors `ReportReceivedMailHandler` with `operatorNotifiedAt`.

- [ ] **Step 1: Failing tests** (`appeals.e2e.spec.ts`):
  - **Create:** the owner appeals an operator-hidden frame → `201 { status: 'OPEN', targetType: 'CONTENT' }`; one `appeal.create` event whose metadata has no text; one `mail.appeal-received` job `{ appealId, requestId }`; `GET /content/{id}` has `appeal.status === 'OPEN'`; `GET /collections/{id}/appeals` lists it;
  - a quarantined frame → `201`; a visible frame and an admin-hidden frame → `409 APPEAL_NOT_APPLICABLE`; a deleted frame → `404`; a second appeal while OPEN → `409 APPEAL_OPEN`; after a rejection a new one → `201` (two in the list);
  - a blocked collection → `201 { targetType: 'COLLECTION' }`; an unblocked one → `409`;
  - **IDOR:** admin B on A's frame/collection → `404` for all three routes, no row; an operator on the admin routes → `404`; signed out → `401`; cross-site origin → `403`; `text: ''` → `400`;
  - **Limit:** `LIMIT_APPEALS_PER_ACCOUNT_PER_DAY=2` → the 3rd (on a third target) → `429`;
  - **Operator:** the queue lists OPEN newest first with `measure`, cursor paging; the detail has the text, `previousAppeals`, `relatedReports` and the content stage; an admin calling → `404`; a random id → `404`;
  - **Uphold** a quarantined-frame appeal `{status:'UPHELD'}` → `200`, the frame is restored (guest `GET` 200), events `appeal.uphold` + `content.restore`; an operator-hidden frame → unhidden; a blocked collection → unblocked (guest `context` 200), `collection.unblock` audited; a repeat → `200`, nothing new; `REJECTED` afterwards → `409 APPEAL_RESOLVED`;
  - **Reject** without a note → `400`; with one → `200`, the admin's `GET /content/{id}` shows `appeal.resolution.note`; the measure stays; the reports on the frame stay `OPEN`.
  - `appeal-mail.e2e.spec.ts`: the handler sends one message per `OPERATOR_EMAILS` with the `/ops/appeals/{id}` link and no text; stamps; a rerun sends nothing.
- [ ] **Step 2–4:** FAIL → implement, `pnpm openapi:write` → PASS; `operator.module.spec.ts` still green.
- [ ] **Step 5: Commit** `feat(api): admin appeals on operator measures, decided in the operator console`.

### Task 5: `AppealDialog`, status badges and the dimmed frame in `@stepler/ui`

**Files:**
- Create: `packages/ui/src/components/appeal-dialog.tsx`, `appeal-dialog.stories.tsx`
- Modify: `frame.tsx` (+ `dimmed?: boolean`: `grayscale opacity-70` on the media only, the marks and ring stay full), `frame.stories.tsx` (Quarantined), `badge.stories.tsx` («Видалено модерацією» danger, «У карантині» warning, «Апеляцію подано» info, «Апеляцію задоволено» success, «Апеляцію відхилено» neutral)

**Interfaces — produces:**
- `AppealDialog({ open, onOpenChange, title, description, textLabel, textHint, textRequiredLabel, textTooLongLabel, counterLabel(count, max), submitLabel, submittingLabel, cancelLabel, sentTitle, sentText, closeLabel, state: 'idle' | 'submitting' | 'sent', error, maxText, onSubmit({ text }) })`: a required `Textarea` with a counter; `sent` swaps to the confirmation and focuses the heading; bottom sheet below 640 (as `ReportDialog`).

- [ ] **Step 1: Failing play tests:** submitting empty shows the required error and does not call `onSubmit`; 1001 code points → destructive counter, no submit; Sent focuses the heading; axe on every story, light and dark; the dimmed Frame story passes axe (its name carries «видалено модерацією»).
- [ ] **Step 2–4:** FAIL → design pass, implement → PASS (`pnpm --filter @stepler/ui test`).
- [ ] **Step 5: Commit** `feat(ui): appeal dialog, moderation status badges and dimmed frames`.

### Task 6: The admin sees quarantine and appeals in «Вміст» and on the blocked banner

**Files:**
- Create: `apps/web/src/app/app/collections/[id]/content/appeal-status.tsx` (the status line + button, shared by the panel and the banner), `apps/web/src/api/appeals.ts`, `appeal-status.test.ts`
- Modify: `content-filters.ts` + test (+ `quarantined`), `content-tab.tsx` (`STATES_OF`, dimmed tile, no download action on quarantined), `moderation-marks.tsx` + `moderation.test.ts` («Видалено модерацією» wins over the others; ring destructive), `moderation-panel.tsx` (quarantined block: title, reason, «Буде видалено назавжди {date}», no hide/show; appeal status + «Подати апеляцію» on operator-hidden and quarantined), `content-viewer.tsx` (no download link when quarantined), `blocked-banner.tsx` + `collection-overview.tsx` (appeal status via `GET /collections/{id}/appeals`, the button), `api/content.ts`, messages `content.moderation.*`, `content.state.quarantined`, `collections.blocked.*`, `appeals.*`

**Interfaces — produces:**
- `appealStatusKey(appeal: AdminAppeal | null): 'none' | 'open' | 'upheld' | 'rejected'`; `canAppeal(appeal)` = `appeal === null || appeal.status !== 'OPEN'`.
- `AppealStatus({ appeal, onAppeal, tone: 'stage' | 'page' })`: «Апеляцію подано {date} · Розглядається» / «Апеляцію відхилено: {note}» / «Апеляцію задоволено {date}», and the button (disabled with `aria-disabled` + hint while open).
- `createContentAppeal(collectionId, contentId, text)`, `createCollectionAppeal(collectionId, text)`, `listAppeals(collectionId)`, key `appealsKey(collectionId)`.
- Error mapping: `APPEAL_OPEN` → refetch + «Апеляцію вже подано»; `APPEAL_NOT_APPLICABLE` → refetch + «Цей кадр уже не потребує апеляції»; `RATE_LIMITED` → «Забагато апеляцій. Спробуйте завтра.»

- [ ] **Step 1: Failing tests:** `moderation.test.ts` (quarantined → `['quarantined']` only, ring `destructive`); `appeal-status.test.ts`; e2e (`e2e/tests/appeals.spec.ts`, desktop + phone): the operator quarantines a seeded reported frame → the admin's «Вміст» shows the dimmed tile with «Видалено модерацією», the viewer shows the reason and the purge date and no «Завантажити», the «Стан» menu has «Видалено модерацією 1»; the admin appeals (empty text keeps the dialog open; «Надіслати» → «Апеляцію надіслано»); the panel shows «Розглядається» and a disabled button.
- [ ] **Step 2–4:** FAIL → design pass, implement → PASS.
- [ ] **Step 5: Commit** `feat(web): quarantined frames and in-app appeals in «Вміст» and on the blocked banner`.

### Task 7: The ops split: nav, appeal queue and detail, quarantine and restore

**Files:**
- Create: `apps/web/src/app/ops/appeals/page.tsx`, `appeals/[id]/page.tsx`, `apps/web/src/ops/ops-nav.tsx`, `appeal-queue.tsx`, `appeal-detail.tsx`, `appeal-labels.ts` + test, `appeal-actions.ts` + test
- Modify: `ops-shell.tsx` (the nav under the header), `api/operator.ts` (appeal calls, `quarantineContent`, `restoreContent`; `deleteContent` removed; `opsKeys.appeals`, `opsKeys.appeal`), `actions.ts` + test (`delete` → `quarantine`, + `restore`; `DESTRUCTIVE` has `quarantine`), `reason-dialog.tsx` (`optional` reason for `uphold`), `report-detail.tsx` (quarantined state text, «У карантині до {date}»), `report-labels.ts` (`STATE_BADGE.QUARANTINED = 'warning'`), messages `ops.nav.*`, `ops.appeals.*`, `ops.actions.quarantine|restore|uphold|reject`, `ops.states.QUARANTINED`, `e2e/tests/ops-access.spec.ts` (delete → quarantine), `blocking.spec.ts` if it names the button

**Interfaces — produces:**
- `OpsNav({ current })`: two links «Скарги гостей» / «Апеляції адміністраторів» (segmented look, `aria-current="page"`), full width on phones.
- `appealStatusFromParam(v): AppealStatus` (`open|upheld|rejected`); `APPEAL_TABS`; `MEASURE_BADGE`.
- `availableAppealActions(detail): ('uphold' | 'reject')[]` — both while `appeal.status === 'OPEN'`; none otherwise.
- `AppealQueue({ status })`: columns «Отримано», «Щодо» (kind + `#frame`, or «Колекція»), «Захід» (badge: Приховано / У карантині / Заблоковано / Знято), «Колекція»; cards on phones; «Показати ще»; empty copy per tab.
- `AppealDetail({ id })`: left the content stage (reused from `report-detail.tsx` by extracting `ContentStage` into `content-stage.tsx`) or the collection card; right: «Апеляція» (the admin's text, time, status, decision), «Захід» (what and why, «у карантині до {date}»), «Попередні апеляції (n)», «Скарги на цей кадр (n)» (links to `/ops/reports/{id}`), «Колекція», «Власник»; actions «Задовольнити» (note optional, confirm default) and «Відхилити» (note required).
- The console's content action «Видалити (карантин 90 днів)» with the description «Гості перестануть бачити кадр одразу. Файли зберігаються 90 днів: кадр можна відновити, після чого його буде видалено назавжди.»; «Відновити кадр» on quarantined frames.

- [ ] **Step 1: Failing tests:** `actions.test.ts` (quarantined → `restore`, not `hide`/`quarantine`); `appeal-actions.test.ts`; `appeal-labels.test.ts`; e2e `appeals.spec.ts` continued: the operator opens «Апеляції адміністраторів» → the appeal is first in «Нові» with «У карантині» → the detail shows the admin's text → «Задовольнити» → the frame is back for guests (API `GET` 200) and the admin's panel shows «Апеляцію задоволено»; a second scenario: operator hides → admin appeals → operator «Відхилити» with a note → the admin sees «Апеляцію відхилено: {note}»; a blocked-collection appeal → «Задовольнити» → the guest page loads; axe on the queue and the detail.
- [ ] **Step 2–4:** FAIL → design pass, implement → PASS.
- [ ] **Step 5: Commit** `feat(web): ops console split into guest reports and admin appeals; quarantine and restore`.

### Task 8: Legal v2 edits and the full journeys

**Files:**
- Modify: `apps/web/content/legal/terms.{uk,en}.v2.md` (§7 «Оскарження рішення»: the collection administrator appeals in the app for hidden or deleted content and a blocked collection; e-mail stays for everyone else and for blocked accounts; §12: moderated content is kept 90 days in quarantine before permanent deletion and is restored if an appeal is upheld), `privacy.{uk,en}.v2.md` (§9: «вміст, видалений модерацією: 90 днів у карантині, потім видалення»; «Дані зі скарг»: appeal texts), `docs/legal/README.md` (v2 changes list), `apps/web/src/content/legal/documents.test.ts` assertions as needed, `e2e/tests/appeals.spec.ts` (the full journeys from Tasks 6–7), `e2e/support/reports.ts` (+ `quarantineViaOps` helper if useful)

- [ ] **Step 1:** tests: the uk terms v2 contains «апеляц» and «90 днів»; every v2 file still has `[ПЕРЕВІРИТИ ЮРИСТОМ]` / `[LAWYER TO CONFIRM]`; `pnpm e2e -- appeals` 3× green.
- [ ] **Step 2: Commit** `feat(legal): v2 drafts mention in-app appeals and the 90-day quarantine` and `test(e2e): appeal and quarantine journeys`.

### Task 9: Docs, env wiring, screenshots, verification

**Files:**
- Modify: ADR 0013 (appeals, quarantine, the quota rule, the ops split; consequences), `mvp-architecture-spec.md` §7.3 (quarantine columns), §7.4 (`ModerationAppeal`, audit actions), §8 (rows «Appeal», «Quarantine»), §9 (routes), §11 (sweep), §13.2 (quota excludes quarantined bytes), `BOOTSTRAP.md` (slice 9b paragraph), `docs/design/DESIGN-SYSTEM.md` (§0.11 nav + appeal pages; §5.8/§5.9 the new badges and the dimmed frame; the dashboard «Стан» filter and the one status badge), `docs/deployment/staging.md` (`MODERATION_QUARANTINE_DAYS`, `LIMIT_APPEALS_PER_ACCOUNT_PER_DAY`, optional), `docs/development/README.md` (env table), `apps/api/.env.example`, `turbo.json`, `e2e/playwright.config.ts`, `render.yaml`, `docker/scripts/verify-images.sh`

- [ ] **Step 1:** docs. **Step 2:** screenshots at 390 and 1440, light and dark: the admin moderation panel with an appeal (open, rejected), the blocked banner with an appeal, `/ops/appeals` queue and detail → `$TMPDIR/stepler-reports-screens/M5/`. **Step 3:** `pnpm turbo run lint typecheck test build --force --continue`, `pnpm format:check`, `pnpm db:check`, migration tests, the full three-browser `pnpm e2e` (known flakes rerun alone).
- [ ] **Step 4: Commit** `docs: slice 9b appeals, quarantine and the ops split`.

## Checkpoints (progress notes to the coordinator)

- After Task A+B (status surfaces).
- After Task 4 (API/data layer green).
- After Task 6 (admin UI).
- After Task 7 (ops appeals section).
