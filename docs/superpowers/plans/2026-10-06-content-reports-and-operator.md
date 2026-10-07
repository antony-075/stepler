# Stepler Slice 9: Content Reports and the Operator Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest reports another guest's frame or text from the viewer. The collection admin sees the reports in «Вміст» and can hide, delete or dismiss. A dedicated operator service account works the report queue in a separate console at `/ops`, where it can hide, delete, resolve, and block collections and accounts. Each operator action needs a reason and is audited. Hidden items and blocked collections disappear from every guest path. The operator and the reporter get e-mails through the worker. The admin never gets e-mails. Terms and Privacy get v2 drafts that describe all of this.

**Architecture:**
- **Data.** There is a new `ContentReport` table with no FKs (spec §7.4) and a few additions:
  - `ContentItem.hiddenAt` / `hiddenBy` / `hiddenByUserId` / `hiddenReason`;
  - `Collection.blockedAt` / `blockedReason`.
  - `User.status = BLOCKED` already exists.
  - Guest reads go through one filter, `GUEST_VISIBLE = { deletedAt: null, hiddenAt: null }`, backed by partial indexes.
- **API: two new modules, and both stay in the modular monolith.**
  - `ModerationModule` holds the use cases: create a report, hide or unhide, block or unblock, resolve. Guest, admin and operator controllers all call it.
  - `OperatorModule` holds the `/api/v1/operator/*` controllers, `OperatorGuard` and the operator read models. It depends on `ModerationModule` and on nothing in the admin or guest controllers.
- **Mail.** E-mails are pg-boss jobs (`mail.report-received`, `mail.report-decision`). They are enqueued in the transaction that creates or resolves the report and sent by the worker. The worker gets the SMTP config and `MailModule`. A `*NotifiedAt` column makes a retried job a no-op once its mail is sent.
- **Web.**
  - The guest report dialog sits in the viewer's «⋯» menu.
  - The admin gets marks, a filter, and a moderation panel in the «Вміст» viewer, plus a blocked banner.
  - The operator console is `src/app/ops/**` + `src/ops/**`. It has its own layout, header, API client and message namespace. An ESLint boundary keeps it apart from the user app in both directions.

**Tech Stack:** As in slices 1–10: NestJS 12 ESM, Prisma 7 on PostgreSQL 18, Zod 4 contracts, pg-boss, nodemailer behind the `Mailer` port, Next.js 16 App Router + next-intl, TanStack Query 5, React Hook Form + Zod, Tailwind 4 + shadcn/Radix in `@stepler/ui`, Storybook 10 + Vitest browser + axe, Playwright with Mailpit. **No new dependency.**

**Spec:**
- **Owner decisions R1–R8** (2026-10-06, below) and the console-extraction addition to R4 (2026-10-06).
- ADR 0013; ADR 0009 (jobs), 0016 (legal acceptance).
- `docs/architecture/mvp-architecture-spec.md` §7.2–§7.4, §8, §9, §11, §12, §13, §14, §15, §17, §18.
- `docs/architecture/discovery-questions.md` D10, D15, F2, F6, F8 (l.317, 455–546).
- `apps/web/content/legal/*.v1.md` (terms §7 and §12; privacy «Дані зі скарг», §9, §14) and `docs/legal/README.md`.
- `docs/design/DESIGN-SYSTEM.md` §0 (V1 «Графіт»), §5.8 (Badge), §5.9 (Frame «reported»), §5.12 (viewer «⋯» → «Поскаржитися»).
- Conventions: `2026-10-04-legal-and-acceptance.md` and `2026-10-05-guest-page-templates.md`.

## Prerequisites

- `dev` at `23f6607` or later: PR L, the V1 redesign and the legal acceptance are merged.
- The PR branches below are cut from the then-current `dev`. This plan itself lives on `feat/slice-9-reports`.
- **Owner answers R1–R8 are final.** The open questions at the end have recommended defaults, and the tasks are written against those defaults. A different answer changes only the steps tagged with that question's id (`[Q1]`…).

## Owner decisions (2026-10-06, confirmed)

1. **[R1] Reporting.**
   - **Where:** from the guest viewer's «⋯» → «Поскаржитися», on an item the guest can see that is not their own (another guest's frame or text).
   - **Form:**
     - a reason: ILLEGAL «Незаконний вміст» / INAPPROPRIATE «Непристойний або образливий» / PRIVACY «Порушує приватність» / SPAM «Спам або реклама» / OTHER «Інше»;
     - an optional description, ≤ 1000 code points;
     - an optional e-mail «щоб повідомити вам рішення».
   - **Confirmation:** «Скаргу надіслано».
   - **Server rules:**
     - rate-limited per guest session and per IP;
     - `Idempotency-Key`;
     - no IP stored;
     - no pre-moderation and no automatic action (no auto-hide after N reports).
2. **[R2] The collection admin sees reports on their content in the UI only, never by e-mail.**
   - **Where:** a «Скарга» mark on the tile, a «Скарги» filter with a count in «Вміст», and the reasons and descriptions in the viewer.
   - **Never shown:** the reporter's e-mail, anywhere.
   - **Actions:** delete the item, hide it, or dismiss the reports.
3. **[R3] Admin hide.**
   - «Приховати від гостей» / «Показати гостям» works on any item in the admin's collection. It is reversible (`hiddenAt`, `hiddenBy`).
   - Hidden items vanish for guests everywhere: feeds, own frames, galleries, counts and downloads. The admin still sees them, with a «Приховано» badge.
   - An item the operator hid shows «Приховано модерацією» and the reason, and the admin cannot unhide it.
4. **[R4] The operator is a dedicated service account** (e.g. `moderation@<domain>` in `OPERATOR_EMAILS`), documented in the staging/ops docs and the env example comments.
   - **The console:** `/ops`, with its own layout and the header «Stepler · Модерація». It looks distinct from the user app and has no collections dashboard. It runs in the same Next app with the same sign-in; there is no new service.
   - **Access:** non-operators get 404, enforced on the server.
   - **Extraction addition:** the console is built so it can later become `apps/ops` or `ops.<domain>` with minimal rework (see "Console architecture"). Boundaries and seams only; no separate service, package or deployment now.
5. **[R5] Operator scope.** The operator sees only reported items plus minimal context: the collection title, the owner's e-mail and status, and the report list. It never sees whole collections.
   - **Actions** (each needs a reason and is audited):
     - hide or unhide an item;
     - delete an item;
     - dismiss a report or mark it actioned;
     - block or unblock a collection;
     - block or unblock an account.
   - **Queue:** Нові / Розглянуті / Відхилені, cursor-paginated, newest first.
6. **[R6] E-mails.**
   - **To every `OPERATOR_EMAILS` address:** one per new report, with the reason and the link to `/ops/reports/{id}` only.
   - **To the reporter:** only if they left an e-mail; the decision («вжито заходів» / «не підтвердилась»).
   - **To collection admins:** nothing.
   - **Sending:** never blocks the request, and is retry-safe.
7. **[R7] Blocking.**
   - **A blocked collection:** guests get «Колекція недоступна». The admin sees a banner with the reason and the appeal contact (`LEGAL_CONTACT_EMAIL`) and cannot unblock it. What else the admin can do is decided in [Q2].
   - **A blocked account:** `User.status = BLOCKED`. Its sessions are revoked, sign-in is refused with a clear message, and all its collections are closed to guests.
8. **[R8] Legal texts v2** (uk + en) stay `draft: true` and keep their placeholders.
   - **What they add:**
     - in-app reports (e-mail is still accepted);
     - the optional reporter e-mail and its retention;
     - the admin is told in the app, not by e-mail;
     - the operator's powers to hide, delete and block.
   - **Promises removed:** the ones the product does not keep (e.g. acknowledging receipt, or notifying a reporter who left no contact).
   - **Acceptance:** users re-accept through the existing flow (`requireReacceptance: true`).

## Decisions made by this plan (recommendation first; override if you disagree)

1. **[P1] Mail goes through the worker, not fire-and-forget in the API.**
   - Today's magic-link mail is `void this.sendLink(...)`. Reusing that would lose a report mail on any SMTP hiccup, and R6 asks for retry-safe sending.
   - The API enqueues `mail.report-received {reportId}` / `mail.report-decision {reportId}` in the transaction that writes the report. The worker sends and then stamps `operatorNotifiedAt` / `reporterNotifiedAt`.
   - Delivery is at least once. A crash between the SMTP accept and the stamp can repeat one mail, which is acceptable; a stamped row never mails again.
   - **Cost:** the worker env gains `SMTP_URL`, `MAIL_FROM`, `APP_ORIGIN`, `OPERATOR_EMAILS` and the optional `LEGAL_CONTACT_EMAIL`. The worker comment "No SMTP" changes, and ADR 0009 gets an addendum.
   - **Alternative:** an outbox table polled by the API. That adds a second queue mechanism.
2. **[P2] The operator resolves an item, not a single report.**
   - `PATCH /operator/reports/{id}` sets every `OPEN` report of the same content to the chosen status with one note. Each reporter who left an e-mail gets the decision.
   - **Why:** the decision is about the item, and three reports on one photo should not need three clicks or produce three different outcomes.
   - A report that is already resolved with the same status → `200` (a retry). With the other status → `409 REPORT_RESOLVED`.
3. **[P3] Content actions do not change report status.**
   - Hiding or deleting is one action; «Вжито заходів» / «Відхилити» is another, explicit one. The detail page shows the open reports next to the actions, so the operator does both in one place.
   - **Why:** the reporter's decision mail must follow a deliberate decision, not a side effect.
4. **[P4] Only one `OPEN` report per guest session per item** (partial unique index).
   - A second report on the same item from the same session returns the existing report (`200`, no new mail).
   - A replay with the same `Idempotency-Key` and the same body → `200`. The same key with a different body → `409 IDEMPOTENCY_CONFLICT` (the texts precedent).
5. **[P5] The operator's scope is "reported", enforced in SQL.**
   - The operator may read or act on content only when some `ContentReport.contentId` matches it. The same holds for a collection (`ContentReport.collectionId`) and for an account (it owns a collection that has a report).
   - Anything else → `404`, as if it did not exist. This applies to unblocking too.
6. **[P6] The guest-path enforcement has one place for each rule.**
   - Hidden: `GUEST_VISIBLE` in `apps/api/src/moderation/content-visibility.ts` is used by every guest content query.
   - Blocked: `assertLinkUsable` gains the collection's `blockedAt`. It is the single function every guest route already passes through (resolve, exchange, `GuestSessionGuard`, `identify` for `@AllowClosedLink`).
   - `themeOf` adds the same check.
   - A blocked collection → `410 COLLECTION_UNAVAILABLE`, the same code and screen as a blocked owner.
7. **[P7] The operator e-mail is in Ukrainian; the reporter e-mail is in the reporter's UI locale.** The guest sends `locale` with the report, and it is stored only together with the e-mail.
8. **[P8] Signed-out visitors to `/ops/*` are redirected to `/login`.** Signed-in non-operators get `notFound()`.
   - The `/ops` path is not a secret, and authorization is what protects it.
   - The magic-link flow has no `returnTo` today, so after signing in the operator re-opens the e-mail link. Adding `returnTo` is out of scope.

## Deliberate choices (low risk; override if you disagree)

- **`ContentReport` stays FK-free** (spec §7.4), so it survives content and collection purges as abuse history.
  - The spec's `reporterUserId` is dropped: admins cannot report in the MVP (§8 matrix), so the column would never be written.
  - `reporterGuestSessionId` is `NOT NULL` and has no FK: the idle-session sweep may delete the session, and the report stays.
- **The admin "dismiss" is per item and separate from the operator status:** `adminDismissedAt` on that item's open reports ([Q1]). It clears the admin's «Скарга» mark. The operator still sees the report as `OPEN`, with «Адміністратор відхилив».
- **`hiddenBy` is an enum (`ADMIN` | `OPERATOR`),** not derived from who the user is. Named CHECKs enforce it:
  - `"ContentItem_hidden_consistent"`: `hiddenAt`, `hiddenBy` and `hiddenByUserId` are all set or all null;
  - `"ContentItem_operator_hide_reason"`: `hiddenBy = 'OPERATOR'` ⇒ `hiddenReason` is set;
  - `"ContentItem_hidden_reason_length"`: 1–500.
- **How the two hides interact:**
  - When the operator hides an item the admin already hid, it becomes an operator hide.
  - When the admin hides an item the operator already hid, nothing changes (`200`).
  - The admin's unhide is one conditional `UPDATE … WHERE "hiddenBy" = 'ADMIN'`; if no row matches because the item is operator-hidden → `409 CONTENT_MODERATED`. This closes the race between an admin unhide and an operator hide.
- **Text for reasons and notes:** the operator's reason and note are 1–500 code points, trimmed, with no C0 control characters except line breaks (`MODERATION_TEXT_MAX_CHARS = 500`). They are stored in `hiddenReason`, `blockedReason`, `User.blockedReason` and `resolutionNote`, and in the audit metadata as `reason`. They are operator-authored text, not user content, which is allowed per spec §7.4.
- **Who sees which text:**
  - The admin sees `hiddenReason` (operator hides) and `Collection.blockedReason`.
  - The reporter's decision mail carries no note and no content.
- **"Hidden" means hidden from guests only.** Usage and quotas still count the item, the admin feed still shows it, and the admin may delete it. A guest's own delete of an item that is now hidden → `404` (invisible means non-existent for guests). A text replay that finds its item hidden → `404 CONTENT_NOT_FOUND`, as for a deleted one.
- **Using a frame as an image:** the guest-page and collection-image «from frame» actions refuse a hidden frame with the existing `COVER_SOURCE_INVALID`. Copies made earlier are separate objects and are covered by [Q5].
- **Indexes** (raw SQL in the migration):
  - `ContentItem_guest_feed_idx (collectionId, createdAt DESC, id DESC) WHERE deletedAt IS NULL AND hiddenAt IS NULL` is added for the guest «Усі кадри».
  - `ContentItem_own_idx` is used only by the guest «own» scope. It is re-created with `… AND hiddenAt IS NULL`.
  - The admin's `ContentItem_feed_idx` and `ContentItem_feed_kind_idx` stay as they are; the admin sees hidden items.
- **Rate limits** are env-backed through `LimitsService`:
  - `LIMIT_REPORTS_PER_IP_PER_HOUR` (60): in-memory throttler `guest-report`, hour TTL;
  - `LIMIT_REPORTS_PER_GUEST_SESSION_PER_HOUR` (10): counted from rows, like the texts.
  - `REPORT_EMAIL_RETENTION_DAYS` (90) is a worker variable.
- **The admin's blocked collection** is described in [Q2]: full control except unblocking. The admin cannot see who reported anything and has no e-mail of any kind.
- **The dashboard row and tile show a danger Badge «Заблоковано»** in the status cell. This is the status display the dashboard already has, not a new feature. The banner with the reason is on the collection page.
- **Frame marks are composition, not booleans.** `Frame` gains `marks?: ReactNode`, rendered top-right over the media, in reading order before the number. Callers pass `Badge`s. `Badge` gets no new variants; its stories gain «Скарга» (warning), «Приховано» (neutral), «Приховано модерацією» and «Заблоковано» (danger).
- **The report dialog** is presentational, in `@stepler/ui` (`ReportDialog`): labels, reasons and callbacks come in as props, so it has no literal strings. `apps/web` owns the state, the API and the idempotency key. Like the name prompt, it portals outside the template, in the Stepler look.
- **The idempotency key** is one `crypto.randomUUID()` per opened dialog, kept across retries, and new only when the dialog is reopened.
- **The operator queue rows** show:
  - the reason;
  - the time;
  - the content kind and `#frame`;
  - the item state (Видимий / Прихований / Видалений);
  - the collection title;
  - the number of open reports on the item.
  - The description, the owner and the actions are on the detail page only.
- **Audit actions** are appended to `AuditAction`:
  - `content.hide`, `content.unhide`;
  - `report.create` (actor `GUEST`), `report.admin_dismiss`, `report.resolve`;
  - `collection.block`, `collection.unblock`, `account.block`, `account.unblock`.
  - `targetType` gains `'report' | 'user'`.
  - An operator delete reuses `content.delete` with `reason` in its metadata.
- **No IP and no e-mail in logs or audit events.**
  - `report.created` is logged with `{reportId, collectionId, reason, hasContact}`.
  - Operator actions are logged with `{action, targetType, targetId}`.
  - A mail job failure is logged with `{job, reportId, smtpCode}`, never with the address.

## Console architecture (owner addition to R4: extraction seams)

| Seam | Now | What extraction changes |
|---|---|---|
| API | All operator routes are `/api/v1/operator/*` in `OperatorModule` (`apps/api/src/operator/`) with its own `OperatorGuard`, `@ApiTags('Operator')`, its own contracts file `packages/contracts/src/operator.ts`, and moderation use cases called through `ModerationModule` exports only. It imports nothing from `collections/`, `content/*controller*`, `guest-access/*controller*`. | Mount `OperatorModule` in a second Nest app (or keep it and route `ops.<domain>/api` to it); no code moves. |
| Guard | `AuthGuard` (global) authenticates and computes `kind: 'operator'` from `OPERATOR_EMAILS` + verified e-mail, as today. `OperatorGuard` (route-level, operator module only) turns any non-operator into `404`. No operator check is added to user-app guards, middleware or the web proxy. | A separate session audience is a change inside `AuthGuard`/session resolution only. |
| Web | Routes in `apps/web/src/app/ops/**`; code in `apps/web/src/ops/**` (API client, shell, queue, detail, dialogs); messages under the `ops` namespace. It is a nested layout under the shared root layout (html, fonts, theme, intl, `QueryProvider`), not a second root layout: a second root would move every existing route into a group for no present benefit. | Copy the root layout and `src/ops` + `src/app/ops` into `apps/ops`, plus the `ops` message namespace. |
| Import boundary | ESLint `no-restricted-imports` (the preview precedent in `apps/web/eslint.config.js`): files in `src/app/ops/**` and `src/ops/**` may import `@stepler/*`, `@/ops/**`, `@/env`, `@/i18n/**`, `@/theme/**` and nothing else under `@/`; files outside may not import `@/ops/**` or anything under `src/app/ops`. No shared UI state. | Nothing; the rule proves the folder is movable. |
| Links | Every console URL in e-mails comes from `opsUrl(env, path)` in `apps/api/src/config/ops-url.ts` (`${APP_ORIGIN}/ops${path}`). | Add `OPS_ORIGIN` and change `opsUrl` only. |
| Auth/CSRF | Same `st_session` cookie (host-only) and the `CsrfGuard` `Origin === APP_ORIGIN` rule. | A subdomain needs either its own sign-in (cookie scoped to `ops.<domain>`, audience claim on the session) or a parent-domain cookie (wider exposure; not recommended), plus `CsrfGuard` accepting the ops origin and CORS if the API host differs. Recorded in ADR 0013; nothing now blocks it. |
| Data/audit | Same database, `AuditService`, `ContentDeletion`, `MediaUrls`. | Unchanged (a modular monolith deployed twice). |

## PR split

| PR | Branch | Tasks | Ships | Promote to `stage`? |
|---|---|---|---|---|
| M1 | `feat/slice-9-moderation-api` | 1–8 | data model, hidden/blocked enforcement on every guest path, guest report endpoint, admin hide/unhide/dismiss + DTO fields, operator API, mail jobs in the worker, e-mail retention sweep, ADR 0013/0009 update, env/ops docs | yes after owner actions O1–O3 (no UI produces reports yet; operator API usable by curl) |
| M2 | `feat/slice-9-ops-console` | 9–12 | `/ops` console: boundary rule, client, shell, queue, detail with all actions | yes (empty queue until M3) |
| M3 | `feat/slice-9-reports-ui` | 13–19 | `ReportDialog`, marks, guest «Поскаржитися», admin moderation in «Вміст», blocked banners and sign-in message, legal v2 (re-acceptance), Playwright journeys, BOOTSTRAP/spec/DESIGN-SYSTEM | yes; owner re-accepts v2 once on staging |

Order matters: the operator e-mail links point at `/ops/reports/{id}`, so the console (M2) ships before anything can create reports from the UI (M3). Each PR ends with its own "docs, batched minors, full verification, PR" task and is merged with a merge commit.

## Owner-only actions (agents never see or write secrets)

| Id | When | Action |
|---|---|---|
| O1 | before promoting M1 | Create the service mailbox (e.g. `moderation@<domain>`) that can receive mail. Sign in with it once on staging and accept the documents. |
| O2 | before promoting M1 | In Render, set `OPERATOR_EMAILS=<service address>` on **both** `stepler-api-staging` and the worker; give the worker the same `SMTP_URL`, `MAIL_FROM` and `APP_ORIGIN` as the API, and `LEGAL_CONTACT_EMAIL` (optional). Remove your personal address from `OPERATOR_EMAILS` if it is there. |
| O3 | after promoting M1 | Smoke test: `GET /api/v1/operator/session` as the service account → 200; as your own account → 404. |
| O4 | after promoting M3 | Re-accept Terms/Privacy v2 on the next sign-in, then run the report flow once on a phone. |

## Pre-implementation gate (rule 19)

- **Similar code:**
  - API: `ContentDeletion.softDelete` (conditional update + audit + job per row), `TextsService` (`Idempotency-Key`, the per-session hourly limit counted from rows), `assertLinkUsable` / `GuestLinkResolver.themeOf`, `GuestSessionGuard`, `RateLimit` + `throttlerOptions`, `AuditService.record`, `MaintenanceSweepHandler`, `renderMagicLinkEmail` + `MAGIC_LINK_COPY`, `MediaUrls`, `ContentQueries.page`, the `collections.e2e.spec.ts` actor matrix, `queuedJobs()`, `mailpit.ts`.
  - Web: `GuestViewer`, `content-tab.tsx` / `content-viewer.tsx` / `content-filters.ts`, `ConfirmDialog`, `DropdownMenu`, `Alert`, `Badge`, `getSessionUser`, the preview import boundary in `eslint.config.js`, `link-state-page` / `guestPageState`.
- **Data:**
  - new: `ContentReport`, enums `ReportReason`, `ReportStatus`, `HiddenBy`;
  - new columns on `ContentItem` (4) and `Collection` (2);
  - two partial indexes changed or added;
  - no backfill: every column is nullable or has a default.
- **API:** 1 guest route, 3 admin routes, and 11 operator routes; the DTO fields `moderation`, `reports`, `blocked` and `counts.reported`; the admin list query `reported`; 2 error codes (`CONTENT_MODERATED`, `REPORT_RESOLVED`).
- **Permissions:** guests can create reports. Admins can hide, unhide and dismiss on their own collections. The operator works on reported scope only. All of this is listed in the §8 matrix rows "Hide item", "Report item", "View reports" and "Block".
- **Third parties:** SMTP (existing port), now also used from the worker. There is no new provider and nothing reaches the browser.
- **Retry:**
  - report creation is idempotent per key, and per item per session ([P4]);
  - hide and unhide are idempotent;
  - resolve is idempotent per status;
  - mail jobs are idempotent by `*NotifiedAt` and singleton per report.
- **Partial failure:** the report row, the audit event and the mail job commit together. An SMTP outage leaves the job retrying (`retryLimit` 8, 60 s doubling) and does not affect the guest.
- **Deletion:** reports survive content and collection purges (no FKs). The operator detail shows «Вміст видалено» / «Колекцію видалено».
- **Expiration:** media URLs signed before a hide stay valid for at most 2 × `MEDIA_URL_WINDOW_SECONDS` ([Q4]). The reporter e-mail is nulled after the decision mail is sent or after 90 days ([Q6]).
- **Mobile:** the guest dialog is mobile-first. The admin moderation panel lives in the existing responsive viewer. The `/ops` console is desktop-first and usable at 360.
- **Tests:**
  - contracts unit;
  - API integration: the authorization matrix per route, the guest-route enumeration for blocked and hidden, idempotency, limits, mail jobs with Mailpit;
  - worker handlers;
  - lint boundary;
  - Storybook play + axe;
  - Playwright journeys (the report flow, blocking).
- **Scope:** MVP slice 9. Not here:
  - pre-moderation;
  - automatic actions;
  - reports by admins;
  - an appeal workflow (it is e-mail);
  - an evidence hold ([Q7]);
  - a dashboard report counter;
  - `returnTo` for magic links;
  - a separate ops deployment.

## Global Constraints

- **Branches:** one per PR as in the PR split, cut from `dev`, PR to `dev`, merged with a merge commit, one commit per task. Never push to `dev`, `stage` or `main` directly (rule 15).
- **Pace over polish:** per-task review raises only correctness, security, data-integrity and accessibility blockers. Minors are batched into each PR's last task.
- **Authorization:**
  - Admin routes reach rows only through `collection.ownerId = principal.userId AND status <> 'DELETING'`; otherwise `404`. A non-owner operator on an admin route → `404` (as today).
  - Operator routes need `OperatorGuard` and the [P5] scope; otherwise `404`.
  - Guest routes stay `@Public()` + `GuestSessionGuard`, and their item lookups are scoped to `principal.collectionId` + `GUEST_VISIBLE` + `canSeeItem`.
  - Every unsafe method keeps the CSRF origin check. The legal gate applies to operators too.
- **Contracts:**
  - Strict Zod objects, no `.transform()`, no `z.date()`.
  - The reporter e-mail is `z.email().max(254)`.
  - Text is checked with `codePointLength`.
  - New error codes are appended to `ERROR_CODES` with uk/en messages: `CONTENT_MODERATED` (409) and `REPORT_RESOLVED` (409).
  - DTOs are mapped explicitly, never from a Prisma row.
- **Database:**
  - Migrations are created with `prisma migrate dev --create-only`, with named raw-SQL CHECKs and partial indexes appended (ADR 0005).
  - `pnpm db:check` passes. Ids are `uuidv7()`.
  - Lock order [C9] is kept (owner `User` row, then `Collection`) wherever both are locked; account blocking locks only `User`.
- **No PII leaks:**
  - The reporter e-mail never appears in an admin or operator DTO, a log line, an audit event or a job payload (job payloads hold `reportId` only).
  - No IP is ever written.
  - Logs and audit events never contain the description.
- **Env:** each new variable goes into `env.ts` / `worker-env.ts` with tests, `.env.example` (with a comment), `turbo.json` `passThroughEnv`, `e2e/playwright.config.ts`, `docker/scripts/verify-images.sh`, `render.yaml` (`sync: false` for addresses) and the README env table.
- **OpenAPI:** `@ApiTags('Moderation')` for the guest and admin routes, `@ApiTags('Operator')` for the operator routes, each with `@ApiResponse` + documented error codes. Run `pnpm openapi:write` in the same commit as the API change.
- **Web:**
  - TanStack Query for server state; no literal UI strings (uk default, en parity; the rules in `ukrainian-copy.test.ts` apply).
  - Destructive actions go through `ConfirmDialog`. Operator actions go through a reason dialog.
  - Touch targets ≥ 44 px on coarse pointers; nothing hover-only.
  - No horizontal scroll at 320/360/390.
- **Design pass (every UI task):**
  - Before the task, apply the frontend-design, ui-ux-pro-max, web-design-guidelines and responsive-design skills, and write the decisions as a 5–10 line header comment in the main file.
  - After it, take screenshots at 360×780, 390×844 and 1440×900, light and dark, into `$TMPDIR/stepler-reports-screens/<pr>/` (not committed) for the owner's review.
  - Report the owner's remarks as a numbered status table.
- **Never** start or stop the owner's dev servers (3000/4010), touch `apps/*/.env`, or run migrations against the owner's database. `pnpm e2e` uses 3100/4100 and `stepler_e2e`.

## Review Focus

1. **Hidden content leaking through a side path.**
   - **Setup:** an operator- or admin-hidden item, and a guest with the shared gallery who is also that item's contributor.
   - **Paths to check:**
     - `GET …/content?scope=all` and `?scope=own`, and `GET …/content/{id}` (the detail with download URLs);
     - `counts` in `GET …/context`;
     - a text replay with the original `Idempotency-Key`;
     - `DELETE …/content/{id}`;
     - `POST …/content/{id}/reports`;
     - the admin «from frame» for the guest page cover or background and for the collection image.
   - **Expected:** absent, or `404`/`CONTENT_NOT_FOUND`/`COVER_SOURCE_INVALID`. The counts exclude the item. Unhide restores everything.
   - **Race:** hide while the guest's detail request is in flight. The response is either the pre-hide state or a `404`, never a half state, and the next request is `404`.
   - Tests in Task 3.
2. **A guest path that forgets the block.**
   - **Setup:** a blocked collection, and separately a blocked owner.
   - **Expected:** every route under `/api/v1/guest/**` answers `410 COLLECTION_UNAVAILABLE`, including the `@AllowClosedLink` upload complete and cancel (the completion records `REJECTED`) and the theme endpoint (`404`). A test enumerates the guest routes from the Nest router, so a route added later cannot skip the check.
   - **After unblocking:** the same guest cookie works again.
   - Tests in Task 3.
3. **The operator reaching beyond reported scope by changing an id.**
   - **Calls:** the operator calls every `/operator/*` route with:
     - a content id that has no report;
     - an existing collection with no report;
     - a user with no reported collection;
     - a report id that does not exist.
   - **Others:** an admin (non-operator), a user whose e-mail is in `OPERATOR_EMAILS` but unverified, a signed-out caller and a caller without legal acceptance call them too.
   - **Expected:** `404` / `404` / `404` / `404`; `401` / `403 LEGAL_ACCEPTANCE_REQUIRED` as usual. No write happens.
   - Tests in Task 7.
4. **The reporter e-mail leaks or outlives its purpose.**
   - **Search:** after a report with `email`, look for the address in:
     - the admin `GET /content/{id}` and the list;
     - the operator queue and detail;
     - `AuditEvent.metadata`;
     - the pg-boss job data;
     - the captured API and worker logs.
   - **Expected:** absent everywhere (the operator sees only `hasReporterContact: true`).
   - **Retention:** after the decision mail, `reporterEmail` and `reporterLocale` are `NULL`. A report 91 days old with no decision has them nulled by the sweep.
   - Tests in Tasks 5, 6 and 7.
5. **Report spam and duplicate mail.**
   - **Spam:** 11 reports in an hour from one session → the 11th is `429`. 61 from one IP → `429`. The same item twice from one session → one row, one operator mail.
   - **Retries:** a mail job retried after SMTP failed → one mail once SMTP recovers. A job run again after success sends no mail. Resolving twice with the same status → one decision mail.
   - **A forged address:** a reporter e-mail belonging to someone else gets at most one decision mail per report, with no content.
   - Tests in Tasks 5 and 6.

---

## PR M1 — Moderation API, guest enforcement, operator API and mail jobs

### Task 1: Contracts for reports, moderation, operator and limits

**Files:**
- Create: `packages/contracts/src/reports.ts`, `packages/contracts/src/reports.test.ts`, `packages/contracts/src/operator.ts`, `packages/contracts/src/operator.test.ts`
- Modify: `packages/contracts/src/content.ts` (`moderation`, `reports`, `counts.reported`, the `reported` query), `packages/contracts/src/collections.ts` (`blocked`), `packages/contracts/src/errors.ts`, `packages/contracts/src/index.ts`, `packages/contracts/src/content.test.ts`, `collections.test.ts`, `errors.test.ts`

**Interfaces — produces (`reports.ts`):**
- `REPORT_REASONS = ['ILLEGAL', 'INAPPROPRIATE', 'PRIVACY', 'SPAM', 'OTHER'] as const`; `reportReasonSchema = z.enum(REPORT_REASONS)`; `type ReportReason`.
- `REPORT_DESCRIPTION_MAX_CHARS = 1000`; `MODERATION_TEXT_MAX_CHARS = 500`.
- `reportStatusSchema = z.enum(['OPEN', 'DISMISSED', 'ACTIONED'])`; `type ReportStatus`.
- `createReportRequestSchema = z.object({ reason: reportReasonSchema, description: <trimmed, 1–1000 code points, no C0 except \n\t>.optional(), email: z.email().max(254).optional(), locale: localeSchema }).strict()`; `type CreateReportRequest`.
- `createReportResponseSchema = z.object({ id: z.uuid() }).strict()`.
- `moderationTextSchema` (trimmed, 1–500 code points, no C0 except `\n`).
- `adminReportSchema = z.object({ id, reason, description: z.string().nullable(), createdAt: z.iso.datetime() }).strict()` (never an e-mail field).
- `contentModerationSchema = z.object({ hidden: z.object({ by: z.enum(['ADMIN', 'OPERATOR']), at: z.iso.datetime(), reason: z.string().nullable() }).nullable(), openReports: z.number().int().min(0) }).strict()`.

**Interfaces — produces (`content.ts`, `collections.ts`):**
- `adminContentItemSchema` gains `moderation: contentModerationSchema`.
- `adminContentDetailSchema` gains `reports: z.array(adminReportSchema)` (open, not admin-dismissed, oldest first).
- `contentCountsSchema` gains `reported: z.number().int().min(0)` (distinct non-deleted items with open, not dismissed reports).
- `adminContentListQuerySchema` gains `reported: z.enum(['true']).optional()`.
- The collection DTO gains `blocked: z.object({ at: z.iso.datetime(), reason: z.string() }).nullable()`.

**Interfaces — produces (`operator.ts`):**
- `operatorSessionSchema = { email: z.email() }`.
- `operatorReportListQuerySchema = { status: reportStatusSchema.default('OPEN'), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }`.
- `operatorItemStateSchema = z.enum(['VISIBLE', 'HIDDEN', 'DELETED'])`.
- `operatorReportRowSchema = { id, reason, status, createdAt, content: { id, kind, frameNo, state }, collection: { id, title } | null, openReportsOnItem }`.
- `operatorReportPageSchema = { items: operatorReportRowSchema[], nextCursor: string | null }`.
- `operatorReportDetailSchema`:
  - `report: { id, reason, description, status, createdAt, adminDismissedAt, hasReporterContact: boolean, resolution: { status, note, at } | null }`;
  - `otherReports: { id, reason, description, status, createdAt, adminDismissedAt }[]`;
  - `content: { id, kind, frameNo, createdAt, hidden: { by, at, reason } | null, deleted: boolean, text: string | null, media: ContentMediaUrls | null, originalUrl: string | null } | null`;
  - `collection: { id, title, status, blocked: { at, reason } | null } | null`;
  - `owner: { id, email, status: 'ACTIVE' | 'BLOCKED', blockedReason: string | null } | null`.
- `resolveReportRequestSchema = { status: z.enum(['DISMISSED', 'ACTIONED']), note: moderationTextSchema }`.
- `operatorActionRequestSchema = { reason: moderationTextSchema }`.

- [ ] **Step 1: Write the failing tests**:
  - `createReportRequestSchema` accepts `{reason:'SPAM', locale:'uk'}`;
  - it rejects a 1001-code-point description (Cyrillic + emoji count as one each), `email: 'x'`, an unknown reason, extra keys, `description: '   '` and `'\u0007'`;
  - `moderationTextSchema` rejects `''` and 501 code points;
  - `operatorReportListQuerySchema.parse({})` → `{status:'OPEN', limit:50}`;
  - `adminReportSchema` has no key matching `/mail/i` (`Object.keys(adminReportSchema.shape)`);
  - `ERROR_CODES` contains `CONTENT_MODERATED`, `REPORT_RESOLVED`, with uk/en messages present (the existing catalog test).
- [ ] **Step 2: Run** `pnpm --filter @stepler/contracts test` → FAIL.
- [ ] **Step 3: Implement** per the Interfaces blocks; export them from `index.ts`.
- [ ] **Step 4: Run** → PASS; `pnpm --filter @stepler/contracts typecheck lint`.
- [ ] **Step 5: Commit** `feat(contracts): report, moderation and operator contracts`.

### Task 2: Data model and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_content_moderation/migration.sql`, `apps/api/test/migration-moderation.e2e.spec.ts`

**Interfaces — produces (schema):**
```text
enum ReportReason { ILLEGAL INAPPROPRIATE PRIVACY SPAM OTHER }
enum ReportStatus { OPEN DISMISSED ACTIONED }
enum HiddenBy     { ADMIN OPERATOR }

ContentItem += hiddenAt? timestamptz(3), hiddenBy? HiddenBy, hiddenByUserId? uuid (no FK), hiddenReason? text
Collection  += blockedAt? timestamptz(3), blockedReason? text

ContentReport
  id uuidv7, contentId uuid, collectionId uuid, reporterGuestSessionId uuid   -- no FKs (spec §7.4)
  idempotencyKey uuid, reason ReportReason, description? text, reporterEmail? citext, reporterLocale? Locale,
  requestId? text, status ReportStatus default OPEN, resolvedByUserId? uuid, resolvedAt? timestamptz(3),
  resolutionNote? text, adminDismissedAt? timestamptz(3), operatorNotifiedAt? timestamptz(3),
  reporterNotifiedAt? timestamptz(3), createdAt timestamptz(3) default now()
  UNIQUE (reporterGuestSessionId, idempotencyKey)
  INDEX  (status, createdAt DESC, id DESC)              -- operator queue
  INDEX  (contentId, status)                            -- per item; scope checks
  INDEX  (collectionId)                                 -- collection scope check
```
Raw SQL appended (named):
- `ContentReport_one_open_per_guest`: UNIQUE `(reporterGuestSessionId, contentId) WHERE status = 'OPEN'`.
- `ContentReport_admin_open_idx` on `(collectionId, contentId) WHERE status = 'OPEN' AND "adminDismissedAt" IS NULL`.
- CHECKs:
  - `ContentReport_resolved_consistent`: `(status = 'OPEN') = (resolvedAt IS NULL) AND (resolvedAt IS NULL) = (resolvedByUserId IS NULL) AND (resolvedAt IS NULL) = (resolutionNote IS NULL)`;
  - `ContentReport_description_length` (1–1000);
  - `ContentReport_note_length` (1–500);
  - `ContentReport_email_length` (≤ 254);
  - `ContentReport_contact_consistent`: `(reporterEmail IS NULL) = (reporterLocale IS NULL)`;
  - `ContentItem_hidden_consistent`, `ContentItem_operator_hide_reason`, `ContentItem_hidden_reason_length` (see Deliberate choices);
  - `Collection_blocked_consistent`: `(blockedAt IS NULL) = (blockedReason IS NULL)`;
  - `Collection_blocked_reason_length` (1–500).
- `CREATE INDEX "ContentItem_guest_feed_idx" … WHERE "deletedAt" IS NULL AND "hiddenAt" IS NULL`.
- `DROP INDEX "ContentItem_own_idx"; CREATE INDEX "ContentItem_own_idx" … WHERE "deletedAt" IS NULL AND "hiddenAt" IS NULL`.

- [ ] **Step 1: Write the failing test** (`migration-moderation.e2e.spec.ts`, real Postgres):
  - an operator hide without a reason violates `ContentItem_operator_hide_reason`;
  - `hiddenAt` without `hiddenBy` violates `…_hidden_consistent`;
  - a second `OPEN` report from the same session on the same content violates `ContentReport_one_open_per_guest`, and a `DISMISSED` one plus a new `OPEN` one is allowed;
  - `status='DISMISSED'` without `resolvedAt` violates `…_resolved_consistent`;
  - an e-mail without a locale violates `…_contact_consistent`;
  - `blockedAt` without a reason violates `Collection_blocked_consistent`;
  - `pg_indexes` shows `ContentItem_guest_feed_idx` and `ContentItem_own_idx` with `"hiddenAt" IS NULL` in `indexdef`;
  - deleting a `Collection` row leaves its `ContentReport` rows in place.
- [ ] **Step 2: Run** `pnpm --filter @stepler/api test -- migration-moderation` → FAIL.
- [ ] **Step 3: Write the schema; `prisma migrate dev --create-only --name content_moderation`;** append the SQL above; apply it to the test database only.
- [ ] **Step 4: Run** → PASS; `pnpm db:check`.
- [ ] **Step 5: Commit** `feat(db): content reports, hidden content and blocked collections`.

### Task 3: Hidden and blocked on every guest path

**Files:**
- Create: `apps/api/src/moderation/content-visibility.ts`, `apps/api/test/moderation-guest-paths.e2e.spec.ts`
- Modify: `apps/api/src/guest-access/guest-link-resolver.ts` (`LinkState`, `assertLinkUsable`, `themeOf`, `resolveActive` select), `guest-sessions.service.ts` (`findByCookie` select, `counts`), `apps/api/src/content/guest-content.service.ts` (`list`, `get`, `delete`), `content/texts.service.ts` (`findReplay`), `apps/api/src/images/collection-images.service.ts` and the guest-page draft from-frame lookup (`hiddenAt: null`)

**Interfaces — produces:**
- `GUEST_VISIBLE = { deletedAt: null, hiddenAt: null } as const satisfies Prisma.ContentItemWhereInput`.
- `LinkState.collection` gains `blockedAt: Date | null`. In `assertLinkUsable`, the first branch becomes `collection.status === 'DELETING' || collection.blockedAt !== null || collection.owner.status === 'BLOCKED'` → `410 COLLECTION_UNAVAILABLE`. The type change makes `tsc` list every caller.
- `themeOf` → `404` when `blockedAt !== null`.

- [ ] **Step 1: Write the failing tests** (`moderation-guest-paths.e2e.spec.ts`):
  - **Hidden item.** Set it up with SQL (`hiddenBy` ADMIN, then again OPERATOR with a reason), for a guest who contributed it, on a `SHARED_GALLERY` link:
    - absent from `?scope=all` and `?scope=own`;
    - `GET …/content/{id}` → `404`;
    - `context.counts.total` decreases by 1;
    - a text replay with the original key → `404 CONTENT_NOT_FOUND`;
    - the guest's own `DELETE` → `404` and the row is untouched;
    - the admin's guest-page draft cover from-frame and the collection-image from-frame with that frame → `400 COVER_SOURCE_INVALID`;
    - after `hiddenAt = NULL`, everything is back.
  - **Blocked collection** (`blockedAt`, `blockedReason` set by SQL):
    - enumerate every route whose path starts with `/api/v1/guest/` from `app.getHttpAdapter().getInstance()` (the router stack). For each, call it with a valid session cookie and plausible params → status `410`, `code: 'COLLECTION_UNAVAILABLE'`. `POST /guest/links/resolve` and the session exchange are included;
    - `GET /guest/links/{token}/theme` → `404`;
    - an upload initiated before the block, then completed → `410`, and the upload row is `REJECTED`;
    - after unblocking, the same cookie gets `200` on `context`.
  - **Blocked owner:** the same enumeration → `410` (a regression guard for the existing rule).
  - **Race:** 20 concurrent `GET …/content/{id}` with one `UPDATE … SET hiddenAt` in the middle. Every response is `200` with full DTOs or `404`, and every request after the update commits is `404`.
- [ ] **Step 2: Run** → FAIL (hidden items still listed; blocked collections still served).
- [ ] **Step 3: Implement.**
  - Every guest content query spreads `GUEST_VISIBLE` (`list` passes it into `ContentQueries.page`, which already adds `deletedAt: null`).
  - `get` uses `findFirst({ where: { id, collectionId, ...GUEST_VISIBLE } })`. `delete` looks up with `hiddenAt: null`. `findReplay` treats `hiddenAt !== null` like `deletedAt`.
  - Add `blockedAt` to the three selects. Both from-frame lookups add `hiddenAt: null`.
- [ ] **Step 4: Run** → PASS; `pnpm --filter @stepler/api test -- guest content uploads` (no regressions).
- [ ] **Step 5: Commit** `feat(api): hidden items and blocked collections are closed on every guest path`.

### Task 4: Hide and unhide, admin moderation fields, and the blocked collection DTO

**Files:**
- Create: `apps/api/src/moderation/moderation.module.ts`, `apps/api/src/moderation/content-hiding.ts`, `apps/api/src/moderation/moderation-reads.ts`, `apps/api/test/moderation-admin.e2e.spec.ts`
- Modify: `apps/api/src/audit/audit.service.ts` (actions, target types), `apps/api/src/content/admin-content.controller.ts` + `admin-content.service.ts` + `content-dto.ts` (`moderation`), `apps/api/src/collections/collection-dto.ts` + its select (`blocked`), `apps/api/src/app.module.ts`

**Interfaces — produces:**
- `ContentHiding.hide(tx, item: { id; collectionId }, actor: AccountPrincipal, reason: string | null): Promise<'hidden' | 'unchanged'>`.
  - An admin actor: `UPDATE … SET hiddenAt=now(), hiddenBy='ADMIN', hiddenByUserId, hiddenReason=NULL WHERE id=$1 AND deletedAt IS NULL AND hiddenAt IS NULL`.
  - An operator actor: `… hiddenBy='OPERATOR', hiddenReason=$reason WHERE id=$1 AND deletedAt IS NULL AND hiddenBy IS DISTINCT FROM 'OPERATOR'`.
  - An audit event `content.hide` per changed row, with metadata `{ by, reason? }`.
- `ContentHiding.unhide(tx, item, actor, reason: string | null): Promise<'shown' | 'unchanged'>`.
  - An admin actor uses `WHERE hiddenBy = 'ADMIN'`. When nothing changed and the row is `hiddenBy = 'OPERATOR'`, it throws `AppError('CONTENT_MODERATED', 409)`.
  - An operator actor clears any hide.
  - Audit `content.unhide`.
- `ModerationReads.forItems(ids: string[]): Promise<Map<string, { openReports: number }>>`: one `groupBy` over `ContentReport` where `status='OPEN' AND adminDismissedAt IS NULL`. No N+1.
- `ModerationReads.openReports(contentId): Promise<AdminReport[]>`.
- `ModerationReads.reportedContentIds(collectionId): Promise<string[]>`.
- `ModerationReads.reportedCount(collectionId): Promise<number>`: raw SQL `count(DISTINCT r."contentId")` joined to non-deleted items.
- Admin routes (`@ApiTags('Moderation')`, owner scope):
  - `POST /content/{id}/hide` → `200 AdminContentItem`;
  - `POST /content/{id}/unhide` → `200 AdminContentItem` | `409 CONTENT_MODERATED`.
- `toAdminContentItem(row, media, moderation)`: `moderation.hidden` comes from the row, `openReports` from `forItems`.
- `AdminContentService.list` passes `reported=true` as `id: { in: reportedContentIds }`. `counts` adds `reported`.
- The collection DTO gets `blocked` from `blockedAt` / `blockedReason`.

- [ ] **Step 1: Write the failing tests** (`moderation-admin.e2e.spec.ts`):
  - **Hide:** the owner hides → `200`, `moderation.hidden.by === 'ADMIN'`, one `content.hide` audit event with actor `ADMIN`. Hiding again → `200` with no second event.
  - **Unhide:** the owner unhides → `hidden: null`, audit `content.unhide`.
  - **Operator-hidden item** (SQL): the owner's hide → `200` unchanged (still `OPERATOR`); the unhide → `409 CONTENT_MODERATED`, with `hiddenReason` visible in `moderation.hidden.reason`.
  - **Actor matrix** for both routes:
    - another admin → `404`;
    - a non-owner operator → `404`;
    - the owner of a `DELETING` collection → `404`;
    - a deleted item → `404`;
    - signed out → `401`;
    - a cross-site `Origin` → `403 CSRF_ORIGIN_MISMATCH`.
  - **Feed:** the admin list still contains hidden items. `GET /collections/{id}` has `blocked: null`, and after setting `blockedAt` by SQL it has `{at, reason}`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; `pnpm openapi:write`.
- [ ] **Step 4: Run** → PASS, together with the existing `content-admin` and `collections` suites.
- [ ] **Step 5: Commit** `feat(api): admin hide and unhide with moderation state on content`.

### Task 5: Guest reports, admin report view and dismissal

**Files:**
- Create: `apps/api/src/moderation/reports.service.ts`, `apps/api/src/moderation/guest-reports.controller.ts`, `apps/api/test/reports.e2e.spec.ts`
- Modify: `apps/api/src/guest-access/guest-policy.ts` (+ `canReportItem`), `guest-policy.spec.ts`, `apps/api/src/auth/rate-limit.ts` (+ `'guest-report'`), `apps/api/src/limits/limits.service.ts`, `apps/api/src/config/env.ts` + `env.spec.ts` (`LIMIT_REPORTS_PER_IP_PER_HOUR` 60, `LIMIT_REPORTS_PER_GUEST_SESSION_PER_HOUR` 10), `admin-content.controller.ts` (dismiss), `admin-content.service.ts` (`get` adds `reports`), `apps/api/src/jobs/job-names.ts` (+ two mail jobs, options below)

**Interfaces — produces:**
- `canReportItem(p: GuestPrincipal, item: ItemOwnership): 'ok' | 'own' | 'invisible'`: `canSeeItem && !isOwnItem` → `ok`; own → `own`; otherwise `invisible`.
- `POST /guest/collections/{cid}/content/{id}/reports`:
  - guards: `RateLimitGuard`, `GuestSessionGuard`, `@RateLimit('guest-report')`;
  - header `Idempotency-Key` (uuid, required);
  - body `CreateReportRequest`;
  - responses: `201 {id}` | `200 {id}` (replay, or an existing open report from this session on the item [P4]) | `404` (invisible, hidden, deleted, another collection's) | `403 FORBIDDEN` (own item) | `409 IDEMPOTENCY_CONFLICT` | `429 RATE_LIMITED`.
- `ReportsService.create(p: GuestPrincipal, contentId: string, body: CreateReportRequest, idempotencyKey: string, requestId?: string): Promise<{ id: string; created: boolean }>`.
  - Call `jobs.ready()` first, then run one transaction:
    1. find the item with `GUEST_VISIBLE`;
    2. check the policy;
    3. check the replay by `(session, key)`: the same body fields → return it; different → `409`;
    4. check for an existing `OPEN` report by `(session, contentId)` → return it;
    5. the per-session hourly count from rows: `>= limit` → `429 RATE_LIMITED`, `retryable`;
    6. insert;
    7. audit `report.create` (actor `GUEST`, metadata `{reason}`);
    8. `jobs.enqueue(tx, 'mail.report-received', { reportId, requestId })`;
    9. log `report.created`.
  - A unique violation on either unique key, from a concurrent double submit, is re-read and returned as a replay.
- `JobPayloads` additions:
  - `'mail.report-received': { reportId }`, `'mail.report-decision': { reportId }`;
  - `JOB_OPTIONS`: `MAIL = { retryLimit: 8, retryDelay: 60, retryBackoff: true, expireInSeconds: 120 }`;
  - `ENTITY_KEY` → `reportId`.
- `ReportsService.dismissForAdmin(a: AccountPrincipal, contentId: string, requestId?: string): Promise<void>`: owner scope (else `404`); sets `adminDismissedAt = now()` on that item's `OPEN` reports where it is null; one audit `report.admin_dismiss` per report. Idempotent.
- Admin route `POST /content/{id}/reports/dismiss` → `204`.
- `GET /content/{id}` gains `reports` (`ModerationReads.openReports`).

- [ ] **Step 1: Write the failing tests** (`reports.e2e.spec.ts`; guests via `joinAsGuest`, links via `addLink`):
  - **Create:**
    - guest B reports guest A's photo on a `SHARED_GALLERY` link with `{reason:'PRIVACY', description:'Це я на фото', email:'r@stepler.test', locale:'en'}` → `201`;
    - the row has `reporterLocale 'en'` and `status OPEN`;
    - one `report.create` audit event whose `JSON.stringify(metadata)` contains neither the e-mail nor the description;
    - one queued `mail.report-received` job whose data is exactly `{reportId, requestId}`.
  - **Replays and duplicates:**
    - the same key and body → `200` with the same id, and still one row and one job;
    - the same key with `reason:'SPAM'` → `409 IDEMPOTENCY_CONFLICT`;
    - a new key on the same item from the same session → `200` with the same id;
    - two parallel identical requests → one row.
  - **Who can report what:**
    - a `CONTRIBUTE_ONLY` guest reporting another guest's item → `404`;
    - the guest's own item → `403`;
    - a hidden item, a deleted item, an item of another collection under this cookie's path → `404`;
    - no cookie → `401`;
    - a blocked collection → `410`.
  - **Limits:**
    - with `LIMIT_REPORTS_PER_GUEST_SESSION_PER_HOUR=2`, the 3rd report on a different item → `429`;
    - with `LIMIT_REPORTS_PER_IP_PER_HOUR=3`, the 4th from new sessions on one IP → `429` with `Retry-After`.
  - **Admin view:**
    - `GET /content/{id}` → `reports[0]` equals `{id, reason:'PRIVACY', description:'Це я на фото', createdAt}`, and the response body text does not contain `r@stepler.test`;
    - the list item has `moderation.openReports === 1`; `counts.reported === 1`; `?reported=true` returns exactly that item.
  - **Dismissal:**
    - `POST /content/{id}/reports/dismiss` → `204`; afterwards `openReports === 0`, `counts.reported === 0`, `reports: []`;
    - the report is still `OPEN` with `adminDismissedAt` set;
    - another admin or a non-owner operator → `404`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; `pnpm openapi:write`.
- [ ] **Step 4: Run** → PASS; `pnpm --filter @stepler/api test` (unit: policy, env).
- [ ] **Step 5: Commit** `feat(api): guest content reports and the admin's report view`.

### Task 6: Mail jobs in the worker, `opsUrl` and e-mail retention

**Files:**
- Create: `apps/api/src/config/ops-url.ts`, `apps/api/src/config/ops-url.spec.ts`, `apps/api/src/mail/templates/report-received.ts`, `apps/api/src/mail/templates/report-decision.ts`, `apps/api/src/mail/templates/reports.spec.ts`, `apps/api/src/worker/handlers/report-received-mail.handler.ts`, `apps/api/src/worker/handlers/report-decision-mail.handler.ts`, `apps/api/test/report-mail.e2e.spec.ts`
- Modify: `apps/api/src/mail/templates/messages.ts` (`REPORT_RECEIVED_COPY`, `REPORT_DECISION_COPY`, `REPORT_REASON_LABELS`), `apps/api/src/worker/worker-env.ts` + `worker-env.spec.ts`, `apps/api/src/worker/worker.module.ts` (imports `MailModule`, the handlers), `apps/api/src/worker/handlers/maintenance-sweep.handler.ts`

**Interfaces — produces:**
- `opsUrl(env: { APP_ORIGIN: string }, path: `/${string}`): string` → `${APP_ORIGIN}/ops${path}`. It is the only place a console URL is built.
- Worker env:
  - `SMTP_URL`, `MAIL_FROM` (same schemas as the API, required);
  - `APP_ORIGIN`;
  - `OPERATOR_EMAILS` (the same `emailList`);
  - `LEGAL_CONTACT_EMAIL: z.email().optional()`;
  - `REPORT_EMAIL_RETENTION_DAYS: positiveInt(90)`.
- `renderReportReceivedEmail({ reason, url }): RenderedEmail`, in uk only [P7]:
  - subject `Stepler: нова скарга (${REPORT_REASON_LABELS.uk[reason]})`;
  - text lines «Надійшла нова скарга на вміст.», «Причина: {label}», «Переглянути: {url}»;
  - nothing else: no title, no description, no e-mails.
- `renderReportDecisionEmail({ status, locale, contactEmail }): RenderedEmail`:
  - uk subject «Stepler: вашу скаргу розглянуто»;
  - uk `ACTIONED`: «Ми розглянули вашу скаргу і вжили заходів.»;
  - uk `DISMISSED`: «Ми розглянули вашу скаргу: порушення не підтвердилося.»;
  - plus «Якщо ви не згодні з рішенням, напишіть на {contactEmail}.» when it is set;
  - en equivalents. The HTML is escaped as in `renderMagicLinkEmail`.
- `ReportReceivedMailHandler.handle({reportId})`:
  1. load the report; if it is missing or `operatorNotifiedAt` is set → return;
  2. send one message per `OPERATOR_EMAILS` address (none configured → log `report.mail_skipped` once and stamp);
  3. `UPDATE … SET operatorNotifiedAt = now() WHERE id = $1 AND operatorNotifiedAt IS NULL`.
- `ReportDecisionMailHandler.handle({reportId})`:
  1. load the report; if `reporterEmail` is null, `reporterNotifiedAt` is set, or the status is `OPEN` → return;
  2. send;
  3. `UPDATE … SET reporterNotifiedAt = now(), reporterEmail = NULL, reporterLocale = NULL WHERE id = $1 AND reporterNotifiedAt IS NULL`.
- The maintenance sweep adds: `UPDATE "ContentReport" SET "reporterEmail" = NULL, "reporterLocale" = NULL WHERE "reporterEmail" IS NOT NULL AND "createdAt" < now() - make_interval(days => $retention)`, and logs the count only.

- [ ] **Step 1: Write the failing tests:**
  - **`ops-url.spec.ts`:** `opsUrl({APP_ORIGIN:'https://stepler.app'}, '/reports/x') === 'https://stepler.app/ops/reports/x'`.
  - **`reports.spec.ts`:** the received mail contains the URL and the uk label and does not contain the strings passed as `description`/`title` in a deliberately over-filled input object (the renderer must ignore unknown fields: assert by type and by output). The decision mail in `en` is in English. A `<script>` contact is escaped in the HTML. The contact line is absent without `contactEmail`.
  - **`worker-env.spec.ts`:** `SMTP_URL` is required; `REPORT_EMAIL_RETENTION_DAYS` defaults to 90.
  - **`report-mail.e2e.spec.ts`** (worker handlers against Mailpit and the test DB):
    - received with `OPERATOR_EMAILS='op1@stepler.test,op2@stepler.test'` → one message each, and `operatorNotifiedAt` is set; running the handler again → no new message;
    - with SMTP pointed at a closed port the handler throws and nothing is stamped; with Mailpit back, a rerun sends once;
    - decision for an `ACTIONED` report with an e-mail → one message to the reporter in their locale; afterwards `reporterEmail IS NULL`, `reporterLocale IS NULL` and `reporterNotifiedAt` is set; a rerun → nothing;
    - no e-mail → no message;
    - the sweep with a report backdated 91 days → the e-mail is nulled, and a report 89 days old keeps it;
    - the captured worker log lines contain no `@stepler.test` address.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Fix the worker env comment ("No SMTP…") and update the connection budget comment if needed.
- [ ] **Step 4: Run** → PASS; `pnpm --filter @stepler/api test -- report-mail worker env`.
- [ ] **Step 5: Commit** `feat(worker): report e-mails to the operator and the reporter, with e-mail retention`.

### Task 7: Operator module: guard, queue, detail, resolve, content and blocking actions

**Files:**
- Create: `apps/api/src/operator/operator.module.ts`, `operator.guard.ts`, `operator-scope.ts`, `operator-queries.ts`, `operator-dto.ts`, `operator-reports.controller.ts`, `operator-actions.controller.ts`, `apps/api/src/moderation/blocking.service.ts`, `apps/api/src/moderation/report-resolution.ts`, `apps/api/test/operator.e2e.spec.ts`
- Modify: `apps/api/src/moderation/moderation.module.ts` (exports), `apps/api/src/app.module.ts`, `apps/api/src/content/content-deletion.ts` (optional `reason` in the audit metadata), `apps/api/src/openapi/*` (the tag)

**Interfaces — produces:**
- `OperatorGuard implements CanActivate`: `req.principal?.kind === 'operator'`, else `AppError('NOT_FOUND', 404)`. It is applied at class level on both controllers (`@UseGuards(OperatorGuard)`, `@Controller({ path: 'operator', version: '1' })`).
- `OperatorScope`: `assertReportedContent(contentId)`, `assertReportedCollection(collectionId)`, `assertReportedOwner(userId)`. Each is one `EXISTS` query on `ContentReport` (owner: joined through `Collection.ownerId`) and throws `404` otherwise.
- `ReportResolution.resolve(op: OperatorPrincipal, reportId, { status, note }, requestId?)`, in one transaction (`jobs.ready()` first):
  1. load the report (`404`);
  2. if it is not `OPEN`: same status → return; else `409 REPORT_RESOLVED`;
  3. `updateManyAndReturn` every `OPEN` report with the same `contentId` → `status`, `resolvedByUserId`, `resolvedAt`, `resolutionNote`;
  4. audit `report.resolve` per row (`{status, note}`);
  5. enqueue `mail.report-decision` for rows with `reporterEmail` set.
- `BlockingService`:
  - `blockCollection(op, collectionId, reason)` / `unblockCollection(…)`: conditional `UPDATE … WHERE blockedAt IS NULL` / `IS NOT NULL`; audit `collection.block` / `collection.unblock` with `{reason}`; idempotent; `DELETING` or a missing collection → `404`.
  - `blockAccount(op, userId, reason)`: under the [C9] lock order (the `User` row only): `status='BLOCKED'`, `blockedAt`, `blockedReason`; `deleteMany` of `AuthSession` for the user; audit `account.block` (`collectionId` null, `targetType 'user'`).
  - `unblockAccount(…)` → `ACTIVE`, fields null, audit `account.unblock`.
- Routes, all `@ApiTags('Operator')`:
  - `GET /operator/session` → `{email}`;
  - `GET /operator/reports?status&cursor&limit` → `OperatorReportPage`: `(createdAt, id)` descending, cursor via `encodeCursor`;
  - `GET /operator/reports/{id}` → `OperatorReportDetail`. Media goes through `MediaUrls.forItem` and `original(row, { viewer: 'admin', own: false })` and is `null` for a deleted item. The text body is included. No `contributorName`, no `originalFilename`;
  - `PATCH /operator/reports/{id}` `ResolveReportRequest` → `OperatorReportDetail`;
  - `POST /operator/content/{id}/hide | /unhide` `{reason}` → `204`;
  - `POST /operator/content/{id}/delete` `{reason}` → `204`. It goes through `ContentDeletion.softDelete` with the operator principal and `reason`; the spec's `DELETE` becomes a `POST` because the reason is a body;
  - `POST /operator/collections/{id}/block | /unblock` `{reason}` → `204`;
  - `POST /operator/users/{id}/block | /unblock` `{reason}` → `204`.

- [ ] **Step 1: Write the failing tests** (`operator.e2e.spec.ts`; `OPERATOR_EMAILS='op@stepler.test'`; reports seeded through the guest route):
  - **Authorization matrix:** for every operator route, with ids that exist and are reported:
    - an admin, a user whose e-mail is in `OPERATOR_EMAILS` but who has `emailVerifiedAt = null` → `404`;
    - signed out → `401`;
    - an operator without legal acceptance → `403 LEGAL_ACCEPTANCE_REQUIRED`;
    - a cross-site `Origin` on unsafe methods → `403`.
  - **Scope ([P5]):** an unreported content id, an unreported collection, an owner without reported collections, a random report uuid → `404`, with no row changed and no audit event.
  - **Queue and detail:**
    - three reports at distinct times → the queue is newest first, `limit=2` gives `nextCursor`, and the second page has the third;
    - `status=DISMISSED` lists only dismissed;
    - the detail has `hasReporterContact: true`, the body text does not contain the reporter's address, and `owner.email` is the owner's.
  - **Resolve ([P2]):**
    - two open reports on one item; `PATCH` one with `ACTIONED` → both `ACTIONED` with the note, two `report.resolve` events, and `mail.report-decision` queued only for the one with an e-mail;
    - the same `PATCH` again → `200`, nothing new;
    - with `DISMISSED` → `409 REPORT_RESOLVED`.
  - **Content:**
    - hide `{reason:'Порушення приватності'}` → the item is `hiddenBy OPERATOR` with that reason, and a guest `GET` → `404`;
    - unhide → visible;
    - delete → `deletedAt` set, one `content.delete` event with `actorType OPERATOR` and `metadata.reason`, `content.purge` queued;
    - an empty reason → `400 VALIDATION_FAILED`.
  - **Blocking:**
    - block the collection → the guest `context` → `410`; the admin `GET /collections/{id}` → `blocked.reason`; unblock → `200` for the guest;
    - block the owner → their `AuthSession` rows are gone, their cookie → `401`, a magic-link verify for them → `403 ACCOUNT_BLOCKED`, and their collection's guest link resolve → `410`;
    - unblock → sign-in works again;
    - each is audited with the reason, and repeated calls are no-ops.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `OperatorModule` imports `ModerationModule`, `MediaLinksModule`, `AuditModule` and `ContentModule`'s exported `ContentDeletion` only. A unit test in `operator.module.spec.ts` reads the module's import graph through `Reflect.getMetadata('imports', OperatorModule)` and asserts that neither `CollectionsModule` nor `GuestAccessModule` is among them.
- [ ] **Step 4: Run** → PASS; `pnpm openapi:write`; `pnpm --filter @stepler/api test`.
- [ ] **Step 5: Commit** `feat(api): operator module with report queue, resolution, hiding and blocking`.

### Task 8: Docs, env wiring, batched minors, verification, PR M1

**Files:**
- Modify:
  - `docs/architecture/decisions/0013-abuse-reporting-and-operator.md`: status «Accepted, implemented in slice 9 (M1–M3)». Add R1–R8, [P1]–[P8], the console architecture table and the extraction notes (subdomain cookie and audience, CSRF origin list, CORS), and the service-account rule. Consequences: the operator e-mail list lives in the env of two services, and a reporter e-mail is kept for at most 90 days.
  - `docs/architecture/decisions/0009-*`: an addendum saying the worker sends mail.
  - `docs/architecture/mvp-architecture-spec.md`: §7.2, §7.3, §7.4 (as built), §8 rows, §9 routes, §11 jobs, §12 blocking, §13.1 rows, §14, §17 log events.
  - `apps/api/.env.example` (`OPERATOR_EMAILS` comment: "a dedicated service mailbox such as moderation@<domain>, never a personal account"; `LIMIT_REPORTS_*`).
  - The worker `.env.example` or the README worker section.
  - `render.yaml` (worker: `SMTP_URL`, `MAIL_FROM`, `APP_ORIGIN`, `OPERATOR_EMAILS` `sync: false`, `LEGAL_CONTACT_EMAIL` `sync: false`).
  - `turbo.json`, `e2e/playwright.config.ts` (API and worker: `OPERATOR_EMAILS: 'moderation@stepler.test'`; worker SMTP to Mailpit), `docker/scripts/verify-images.sh` (the worker gets the SMTP env).
  - `docs/deployment/staging.md` (the service account, owner actions O1–O3).
  - `docs/development/README.md` (the env table).

- [ ] **Step 1: Docs as listed.** In ADR 0013 the open legal items stay open: evidence hold and DSA.
- [ ] **Step 2: Batched minors** from the per-task reviews.
- [ ] **Step 3: Full verification:** `pnpm typecheck lint test`, `pnpm --filter @stepler/api test`, `pnpm db:check`, `pnpm --filter @stepler/api openapi:check`, `pnpm build`, `docker/scripts/verify-images.sh`. Every command must exit 0. Record the counts in the PR body.
- [ ] **Step 4: Commit** `docs: slice 9 moderation API, operator service account and the console seams`; push the branch; open the PR to `dev` with the owner actions O1–O3.

---

## PR M2 — The `/ops` console

### Task 9: Import boundary, ops API client, layout and shell

**Files:**
- Modify: `apps/web/eslint.config.js`, `apps/web/messages/uk.json` + `en.json` (namespace `ops`, appended)
- Create:
  - `apps/web/src/ops/api/client.ts`, `apps/web/src/ops/api/server.ts`, `apps/web/src/ops/api/operator.ts`;
  - `apps/web/src/ops/ops-shell.tsx`;
  - `apps/web/src/app/ops/layout.tsx`, `apps/web/src/app/ops/page.tsx`;
  - `apps/web/src/ops/boundary.test.ts`;
  - `e2e/tests/ops-access.spec.ts`.

**Interfaces — produces:**
- ESLint blocks, using `no-restricted-imports` patterns:
  - `files: ['src/app/ops/**', 'src/ops/**']`: group `['@/*', '!@/ops', '!@/ops/**', '!@/env', '!@/i18n/**', '!@/theme/**']`, plus relative patterns `['../**/app/app/**', '../**/guest/**']`, with the message "The ops console imports only @stepler/*, @/ops/** and shared infra (env, i18n, theme)";
  - `files: ['src/**']` with `ignores: ['src/app/ops/**', 'src/ops/**']`: group `['@/ops', '@/ops/**', '@/app/ops/**']`, with the message "The user app never imports the ops console".
- `opsRequest<T>(path: `/operator/${string}`, init: { method?; body?; schema: z.ZodType<T> }): Promise<T>`: a same-origin `fetch('/api/v1' + path)` with JSON and `credentials: 'same-origin'`. It throws `OpsApiError { status; code }` parsed with `problemDetailsSchema`. It is a deliberate duplicate of `@/api/client` (≈ 40 lines), so the folder moves alone.
- `getOperatorSession(): Promise<OperatorSession | null | 'signed-out' | 'unavailable'>`: a server-side `GET /api/v1/operator/session` with the request cookies via `API_INTERNAL_URL`. `401` → `'signed-out'`; `404` → `null`; other errors → `'unavailable'`. `403 LEGAL_ACCEPTANCE_REQUIRED` → `'signed-out'`, so the visitor goes through `/login` → `/accept-terms`.
- `operator.ts`: `fetchReports(query)`, `fetchReport(id)`, `resolveReport(id, body)`, `hideContent(id, reason)`, `unhideContent(id, reason)`, `deleteContent(id, reason)`, `blockCollection(id, reason)`, `unblockCollection(id, reason)`, `blockAccount(userId, reason)`, `unblockAccount(userId, reason)`, and query keys `opsKeys.reports(status)`, `opsKeys.report(id)`.
- `app/ops/layout.tsx` (RSC):
  - `'signed-out'` → `redirect('/login')` [P8];
  - `null` → `notFound()`;
  - `'unavailable'` → the shell with an error panel and «Спробувати ще»;
  - otherwise `<OpsShell email>`.
  - `metadata.robots = { index: false }`.
- `app/ops/page.tsx` → `redirect('/ops/reports')`.
- `OpsShell`:
  - a full-width header «Stepler · Модерація» on `--inverse`, the light text and a «Модерація» label chip, so it is visibly not the user app;
  - the signed-in service address and «Вийти» (`POST /api/v1/auth/logout`, then `/login`);
  - no sidebar and no collections links;
  - a `main` with `max-w-[1200px]`.
- Messages `ops.*`:
  - `title` «Stepler · Модерація»;
  - `signOut` «Вийти»;
  - `unavailable` «Не вдалося завантажити консоль.»;
  - `retry` «Спробувати ще»;
  - and the keys of Tasks 10–11.

- [ ] **Step 1: Write the failing tests:**
  - **`boundary.test.ts`** runs ESLint programmatically (`new ESLint({ cwd })`, `lintText` with `filePath`):
    - `import { x } from '@/app/app/admin-nav'` inside `src/ops/a.tsx` → 1 error;
    - `import { apiRequest } from '@/api/client'` inside `src/app/ops/page.tsx` → 1 error;
    - `import { opsRequest } from '@/ops/api/client'` inside `src/app/app/page.tsx` → 1 error;
    - `@stepler/ui/components/badge` and `@/i18n/locale` inside `src/ops/a.tsx` → 0.
  - **`ops-access.spec.ts`:**
    - a signed-in admin opening `/ops` and `/ops/reports/<uuid>` → the 404 page (status 404), with no ops header in the DOM;
    - signed out → it lands on `/login`;
    - `moderation@stepler.test` → the header «Stepler · Модерація», with no «Колекції» link.
- [ ] **Step 2: Run** `pnpm --filter @stepler/web test -- boundary` → FAIL; `pnpm e2e -- ops-access` → FAIL.
- [ ] **Step 3: Design pass, then implement.**
- [ ] **Step 4: Run** → PASS; `pnpm --filter @stepler/web typecheck lint` (the whole app passes the new rule).
- [ ] **Step 5: Commit** `feat(web): ops console shell behind the operator check, with an import boundary`.

### Task 10: The report queue

**Files:**
- Create: `apps/web/src/app/ops/reports/page.tsx`, `apps/web/src/ops/report-queue.tsx`, `apps/web/src/ops/report-labels.ts`, `apps/web/src/ops/report-labels.test.ts`
- Modify: messages `ops.queue.*`, `ops.reasons.*`, `ops.states.*`

**Interfaces — produces:**
- `?status=open|actioned|dismissed` (default `open`) ↔ the tabs «Нові» / «Розглянуті» / «Відхилені» (segmented `Tabs`, `ToggleGroup` on phones). `statusFromParam(value: string | null): ReportStatus` lives in `report-labels.ts`.
- `ReportQueue({ status })`: `useInfiniteQuery(opsKeys.reports(status), fetchReports)`.
  - **Desktop (≥ `md`):** a table with these columns:
    - «Отримано» (relative time + absolute in `title`, mono);
    - «Причина»;
    - «Вміст» (kind icon + `#086`, mono);
    - «Стан» (Badge: Видимий neutral / Прихований warning / Видалений danger);
    - «Колекція»;
    - «Скарг на кадр» (counter).
    - Each row is one link to `/ops/reports/{id}`.
  - **Phones:** stacked cards with the same fields.
  - **Paging:** «Показати ще» (button, not infinite scroll) while `nextCursor`.
  - **States:**
    - loading: skeleton rows;
    - empty per tab: `ops.queue.empty.open` «Нових скарг немає», `…actioned` «Розглянутих скарг ще немає», `…dismissed` «Відхилених скарг ще немає»;
    - error: an `Alert` with retry.
- `ops.reasons.*`: the five labels of [R1].

- [ ] **Step 1: Write the failing tests:** `report-labels.test.ts`: `statusFromParam('dismissed') === 'DISMISSED'`, `statusFromParam('x') === 'OPEN'`, and every `REPORT_REASONS` value has uk and en labels. In the e2e `ops-access.spec.ts`, append: a seeded report (via the guest API helper) appears first in «Нові» with its reason, `#frame` and collection title; «Відхилені» is empty with its copy; and at 360 px there is no horizontal scroll.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Design pass, then implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): ops report queue with status tabs and cursor paging`.

### Task 11: Report detail and every operator action

**Files:**
- Create: `apps/web/src/app/ops/reports/[id]/page.tsx`, `apps/web/src/ops/report-detail.tsx`, `apps/web/src/ops/reason-dialog.tsx`, `apps/web/src/ops/actions.ts`, `apps/web/src/ops/actions.test.ts`
- Modify: messages `ops.detail.*`, `ops.actions.*`

**Interfaces — produces:**
- `availableActions(detail: OperatorReportDetail): OpsAction[]`, where `type OpsAction = 'hide' | 'unhide' | 'delete' | 'dismiss' | 'action' | 'blockCollection' | 'unblockCollection' | 'blockAccount' | 'unblockAccount'`:
  - `hide` when the content exists, is not deleted and is not hidden by `OPERATOR`; `unhide` when it is hidden;
  - `delete` when the content exists and is not deleted;
  - `dismiss` / `action` when `report.status === 'OPEN'`;
  - the block or unblock pair follows `collection.blocked` and `owner.status`;
  - none for entities that are `null`.
- `ReasonDialog({ action, onConfirm(reason): Promise<void> })`:
  - `Dialog` with a title per action, e.g. «Приховати кадр», «Видалити кадр», «Заблокувати колекцію», «Заблокувати акаунт», «Відхилити скаргу», «Позначити: вжито заходів»;
  - a required `Textarea` «Причина» with the counter `n/500`;
  - React Hook Form + `moderationTextSchema`;
  - the confirm button is destructive for delete and block;
  - the error stays in the dialog; the dialog closes on success, then toasts e.g. «Кадр приховано».
- `ReportDetail({ id })`:
  - **Left (≥ `lg`, stacked on phones):** the content stage (preview image, video poster with a play link to the original, document type + «Відкрити», text card), «Вміст видалено» or «Кадр приховано: {reason}».
  - **Right:**
    - the report (reason, description, time, «Адміністратор відхилив» when `adminDismissedAt`, «Заявник залишив контакт» / «Без контакту»);
    - «Інші скарги на цей кадр (n)»;
    - the collection (title, status, the «Заблоковано: {reason}» badge);
    - the owner (e-mail, status);
    - the action buttons from `availableActions`, grouped «Кадр» / «Скарга» / «Колекція» / «Акаунт».
  - After any action, invalidate `opsKeys.report(id)` and `opsKeys.reports(*)`.
  - `404` → «Скаргу не знайдено» with a back link.

- [ ] **Step 1: Write the failing tests:**
  - **`actions.test.ts`:**
    - an open report on a visible item of an active collection → `['hide', 'delete', 'dismiss', 'action', 'blockCollection', 'blockAccount']`;
    - operator-hidden → contains `unhide`, not `hide`;
    - a deleted item → neither `hide` nor `delete`;
    - resolved → no `dismiss` / `action`;
    - a blocked collection → `unblockCollection`;
    - `collection: null` → no collection actions.
  - **e2e (`ops-access.spec.ts`):**
    - open the seeded report;
    - «Приховати» with the reason «Тест» → the state badge shows «Прихований»;
    - a guest `GET` of the item via the API → `404`;
    - an empty reason keeps the dialog open with the field error;
    - axe on the detail page and the dialog.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Design pass, then implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): ops report detail with reasoned actions`.

### Task 12: Screenshots, batched minors, verification, PR M2

- [ ] **Step 1: Screenshots** of the queue (each tab, empty, loading), the detail (photo, text, deleted, blocked collection) and the reason dialog, at the Global Constraints sizes → `$TMPDIR/stepler-reports-screens/M2/`.
- [ ] **Step 2: Batched minors.** Add a DESIGN-SYSTEM note: «§0.11 Консоль модерації» with the header, palette usage and the table and card pattern, stating that it is outside the admin shell.
- [ ] **Step 3: Verification:** `pnpm typecheck lint test build`, `pnpm e2e -- ops-access` → exit 0.
- [ ] **Step 4: Commit** `docs(design): ops console notes`; open the PR to `dev`.

---

## PR M3 — Guest reports, admin moderation, blocking UI, legal v2

### Task 13: `ReportDialog`, frame marks and moderation badges in `@stepler/ui`

**Files:**
- Create: `packages/ui/src/components/report-dialog.tsx`, `report-dialog.stories.tsx`
- Modify: `packages/ui/src/components/frame.tsx` (+ `marks`), `frame.stories.tsx`, `badge.stories.tsx`

**Interfaces — produces:**
- `ReportDialog` props:
  - `{ open; onOpenChange; title; reasonsLegend; reasons: { value: string; label: string }[]; descriptionLabel; descriptionHint; emailLabel; emailHint; submitLabel; cancelLabel; sentTitle; sentText; closeLabel; state: 'idle' | 'submitting' | 'sent'; error: string | null; maxDescription: number; onSubmit(values: { reason: string; description: string; email: string }): void }`.
  - The reasons are a `RadioGroup` (required; the submit button is enabled and its validation message shows on submit, per DESIGN-SYSTEM §9).
  - The description is a `Textarea` with a counter. The e-mail is an `Input type="email" autoComplete="email" inputMode="email"`.
  - `sent` swaps the body for the confirmation, with a ✓ icon, `sentTitle` and the «Закрити» button, and moves focus to the title.
  - Bottom-sheet behaviour below 640 px, as the existing `Dialog` mobile variant.
- `Frame` gains `marks?: ReactNode`, rendered top-right inside the tile above the scrim and announced through `accessibleName` (callers add «скарга» / «приховано»).
- Stories:
  - `ReportDialog`: Default, ValidationError (no reason picked), Submitting, Failed (error text), Sent, Phone (360 viewport), Dark;
  - `Badge`: «Moderation» showing «Скарга» warning, «Приховано» neutral, «Приховано модерацією» danger, «Заблоковано» danger;
  - `Frame`: Reported, Hidden, ModeratedText.

- [ ] **Step 1: Write the failing tests** (Storybook play functions):
  - submitting without a reason shows the reason error and `onSubmit` is not called;
  - 1001 characters in the description shows the counter in the destructive tone and blocks submit;
  - Sent focuses the heading;
  - axe passes on every story in light and dark.
- [ ] **Step 2: Run** `pnpm --filter @stepler/ui test` → FAIL.
- [ ] **Step 3: Design pass, then implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(ui): report dialog, frame marks and moderation badge stories`.

### Task 14: «Поскаржитися» in the guest viewer

**Files:**
- Create: `apps/web/src/guest/report-content.tsx`, `apps/web/src/guest/report-content.test.ts`
- Modify: `apps/web/src/guest/guest-viewer.tsx` (the «⋯» menu in `actions`), `apps/web/src/guest/api.ts` (`reportContent`), `apps/web/messages/uk.json` + `en.json` (`guest.report.*`, appended at the end of `guest`)

**Interfaces — produces:**
- `reportContent(collectionId: string, contentId: string, body: CreateReportRequest, idempotencyKey: string): Promise<{ id: string }>`.
- `GuestReport({ collectionId, call, item, open, onOpenChange })`:
  - holds one `idempotencyKey` per opening;
  - maps the form to `CreateReportRequest` (empty strings → omitted; `locale` from `useLocale()`);
  - maps errors with `reportErrorMessage(error): string`:
    - `RATE_LIMITED` → «Забагато скарг. Спробуйте пізніше.»;
    - `NOT_FOUND` → «Цей кадр уже недоступний.»;
    - anything else → «Не вдалося надіслати скаргу. Спробуйте ще.»;
  - page-ending errors (`isPageEndingError`) are passed up as today.
- In the viewer: a `DropdownMenu` trigger «⋯» (44 px, `aria-label` «Більше дій») on items where `!item.isOwn`. The item «Поскаржитися» opens `GuestReport`. Nothing is shown on own items.
- Copy (uk):
  - `title` «Поскаржитися»;
  - `reasonsLegend` «Що не так?»;
  - `descriptionLabel` «Опишіть, що не так»;
  - `descriptionHint` «Необов’язково»;
  - `emailLabel` «Ваш e-mail»;
  - `emailHint` «Необов’язково — щоб повідомити вам рішення»;
  - `submit` «Надіслати скаргу»;
  - `sentTitle` «Скаргу надіслано»;
  - `sentText` «Модерація Stepler розгляне її. Кадр поки залишається у галереї.»

- [ ] **Step 1: Write the failing tests:**
  - **`report-content.test.ts`:**
    - `toReportRequest({reason:'SPAM', description:'  ', email:''}, 'uk')` → `{reason:'SPAM', locale:'uk'}`;
    - `reportErrorMessage` maps the three cases.
  - **e2e** (`e2e/tests/reports.spec.ts`, phone and desktop projects):
    - guest B opens guest A's photo → «⋯» → «Поскаржитися» → picks «Порушує приватність», fills the e-mail → «Надіслати скаргу» → sees «Скаргу надіслано»;
    - the photo is still in «Усі кадри»;
    - guest B's own frame has no «⋯»;
    - on a 360 px phone the dialog fits with no horizontal scroll and the submit button is reachable.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Design pass, then implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): guests report another guest's frame from the viewer`.

### Task 15: Admin moderation in «Вміст»

**Files:**
- Create: `apps/web/src/app/app/collections/[id]/content/moderation-panel.tsx`, `moderation-marks.tsx`, `moderation.test.ts`
- Modify: `content-filters.ts` (+ `reported`), `content-filters.test.ts`, `content-tab.tsx` (the chip, the marks), `content-viewer.tsx` (the panel, hide/unhide/dismiss), `apps/web/src/api/content.ts`, messages `content.moderation.*`

**Interfaces — produces:**
- `reportedFromParam(value: string | null): boolean` (`?reported=1`).
- The chip «Скарги» with the mono count `counts.reported`, after the kind chips. It shows when `counts.reported > 0` or the filter is active. It is exclusive with the kind filter; selecting it clears `kind`.
- `moderationMarks(item: AdminContentItem, t): ReactNode`:
  - «Скарга» (warning) when `openReports > 0`;
  - «Приховано» (neutral) when `hidden?.by === 'ADMIN'`;
  - «Приховано модерацією» (danger) when `hidden?.by === 'OPERATOR'`.
  - It adds the matching words to the tile's accessible name.
- `ModerationPanel({ item: AdminContentDetail })`, in the viewer's details column:
  - **Hidden by the admin:** a note «Гості не бачать цей кадр» + «Показати гостям».
  - **Hidden by the operator:** an `Alert` (danger) «Приховано модерацією» + «Причина: {reason}» + «Якщо ви не згодні, напишіть на {LEGAL_CONTACT_EMAIL}». No show button.
  - **Not hidden:** «Приховати від гостей».
  - **Open reports:** the section «Скарги ({n})» lists each one (reason label, description or «Без опису», time), then «Відхилити скарги» behind `ConfirmDialog` «Відхилити скарги на цей кадр? Позначка зникне.»
  - The delete action stays as today.
  - `LEGAL_CONTACT_EMAIL` reaches the client as a prop from the collection page's server component.
- API helpers: `hideContent(id)`, `unhideContent(id)`, `dismissReports(id)`. On success, invalidate the item, the list and the counts. A `409 CONTENT_MODERATED` refetches the item and shows a toast «Кадр приховала модерація — показати його не можна».

- [ ] **Step 1: Write the failing tests:**
  - **`moderation.test.ts`:**
    - `moderationMarks` for the four combinations (none; reported; admin-hidden + reported; operator-hidden);
    - `reportedFromParam('1') === true`, `reportedFromParam('true') === false`.
  - **e2e (`reports.spec.ts`, continued):**
    - the admin opens «Вміст» → the chip «Скарги 1» → the tile has «Скарга»;
    - the viewer lists «Порушує приватність»;
    - the page text does not contain the reporter's e-mail;
    - «Приховати від гостей» → the tile shows «Приховано»; guest B's «Усі кадри» no longer has it (after «Оновити»), and guest A's own frames do not either;
    - «Показати гостям» → it is back;
    - «Відхилити скарги» → the chip disappears.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Design pass, then implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): admin sees reports, hides, shows and dismisses in «Вміст»`.

### Task 16: Blocked collection banner, dashboard badge and the blocked sign-in message

**Files:**
- Create: `apps/web/src/app/app/collections/[id]/blocked-banner.tsx`
- Modify: `apps/web/src/app/app/collections/[id]/page.tsx` (banner + contact prop), `collection-row.tsx` / `collection-card.tsx` (badge), `apps/web/src/app/login/sign-in-landing.tsx` / `login-form.tsx` (`ACCOUNT_BLOCKED` copy with the contact), `apps/api/src/auth/magic-link.service.ts` + `apps/api/src/mail/templates/account-blocked.ts` + `apps/api/src/config/env.ts` (optional `LEGAL_CONTACT_EMAIL`, wired per Global Constraints → Env) ([Q3]), messages `collections.blocked.*`, `errors.ACCOUNT_BLOCKED`

**Interfaces — produces:**
- `BlockedBanner({ reason, contactEmail })`:
  - an `Alert` (danger, `role="status"`) at the top of the collection page;
  - the title «Колекцію заблоковано модерацією»;
  - the text «Гості не можуть її відкрити. Причина: {reason}.»;
  - when the contact is set, «Якщо ви не згодні, напишіть на {email}» (a `mailto:` link);
  - no unblock control.
- The dashboard status cell shows a danger Badge «Заблоковано» before the collection status when `blocked !== null`.
- `errors.ACCOUNT_BLOCKED` → «Цей акаунт заблоковано. Якщо ви не згодні, напишіть на {email}.» (the contact from `LEGAL_CONTACT_EMAIL`; without it, the current sentence).
- [Q3] default: `MagicLinkService.request` for a `BLOCKED` user sends `renderAccountBlockedEmail({ locale, contactEmail })` instead of the link: «Ваш акаунт Stepler заблоковано, тому посилання для входу не надіслано. …». The HTTP response stays the same `202` as for everyone, so there is still no enumeration. This needs `LEGAL_CONTACT_EMAIL` as an optional API env.

- [ ] **Step 1: Write the failing tests:**
  - **API (`magic-link.e2e.spec.ts`, appended):** a blocked user's request → `202`, and Mailpit has one «заблоковано» message with no sign-in URL.
  - **e2e** (`e2e/tests/blocking.spec.ts`):
    - the operator blocks a reported collection via `/ops`;
    - the guest reloads → «Колекція недоступна»;
    - the admin's collection page shows the banner with the reason and the `mailto:`;
    - the dashboard shows «Заблоковано»;
    - the operator unblocks → the guest page loads again;
    - the operator blocks the owner's account → the admin's open tab redirects to `/login` on the next navigation, and a Google or magic-link verify attempt shows the blocked message;
    - the guest gets «Колекція недоступна».
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Design pass, then implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): blocked collection banner, dashboard badge and blocked sign-in message`.

### Task 17: Terms and Privacy v2 drafts with re-acceptance

**Files:**
- Create: `apps/web/content/legal/terms.uk.v2.md`, `terms.en.v2.md`, `privacy.uk.v2.md`, `privacy.en.v2.md`
- Modify: `packages/contracts/src/legal.ts` (both entries `version: 'v2'`, `effectiveDate` = the merge date, `draft: true`, `requireReacceptance: true`), `packages/contracts/src/legal.test.ts`, the API/e2e tests that hard-code `'v1'` (grep), `docs/legal/README.md` (a "v2 changes" list)

**Content changes** (copy v1, then edit only these. Each changed paragraph keeps or gains `[ПЕРЕВІРИТИ ЮРИСТОМ]`, the leading draft line stays, the en files mirror the uk ones, and every other section stays word for word):
- **Terms §7 «Скарги на контент»:**
  - Reports are made in the app (the viewer's «Поскаржитися» on someone else's item) or by e-mail to `[LEGAL_CONTACT_EMAIL]`.
  - An e-mail address is optional and is used only to send the decision.
  - The collection administrator is told about reports in the app, without the reporter's contact.
  - The Stepler operator may hide or delete content and block a collection or an account.
  - The administrator cannot undo an operator's hide or block.
  - **Removed:** «Ми підтверджуємо отримання скарг», because no acknowledgement is sent. «повідомляємо заявнику про ухвалене рішення» becomes «якщо заявник залишив адресу». «…ми повідомляємо адміністратора колекції» becomes «…в застосунку».
- **Terms §12:**
  - A blocked collection is unavailable to guests, and its administrator sees the reason in the app.
  - A blocked account cannot sign in, and its collections are unavailable to guests.
  - The «Оскарження» contact is unchanged.
- **Privacy «Дані зі скарг»:**
  - The data collected: the category, an optional description, an optional e-mail with the interface language, the ids of the content and the collection, the time, the request id and the technical guest-session id. **No IP address.**
  - The e-mail is deleted after the decision is sent, or 90 days after the report at the latest.
  - The administrator never sees it.
  - The «У поточній версії сервісу скарги надсилаються електронною поштою» sentence is replaced: both channels exist.
- **Privacy §9 retention list:** adds «скарги (без адреси заявника): [СТРОК ЗБЕРІГАННЯ]» and «адреса заявника: до надсилання рішення, не довше 90 днів».
- **Privacy §14:** in-app reports, and the operator's actions.

- [ ] **Step 1: Write the failing tests:**
  - `legal.test.ts`: both entries are `v2` with `requireReacceptance: true`;
  - the existing `documents.test.ts` covers the files for both locales (the draft line, no raw HTML, no `# `);
  - a new assertion: every v2 file contains `[ПЕРЕВІРИТИ ЮРИСТОМ]` / `[LAWYER TO CONFIRM]` (en, as in `terms.en.v1.md`);
  - the uk terms v2 does not contain «підтверджуємо отримання».
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Write the four files and the registry change.** Run `rg "'v1'" apps e2e packages` and update the tests that meant "current version" to use `currentLegalVersion(...)`.
- [ ] **Step 4: Run** `pnpm --filter @stepler/contracts --filter @stepler/web test`, `pnpm --filter @stepler/api test -- legal`, and `pnpm e2e -- legal auth` → PASS (an existing account is sent to `/accept-terms` once).
- [ ] **Step 5: Commit** `feat(legal): Terms and Privacy v2 drafts for in-app reports and moderation (re-acceptance)`.

### Task 18: The full journey

**Files:**
- Modify: `e2e/tests/reports.spec.ts`, `e2e/tests/blocking.spec.ts`, `e2e/support/mailpit.ts` (+ `waitForMail(to, subjectPart)`)

- [ ] **Step 1: Write the journey:**
  1. The admin creates a collection with a shared-gallery link.
  2. Guest A uploads a photo; guest B reports it with an e-mail.
  3. Mailpit: `moderation@stepler.test` gets «нова скарга (Порушує приватність)» whose body has `/ops/reports/` and does not contain the reporter's e-mail or the collection title.
  4. The admin sees the mark and the reason, with no e-mail.
  5. The operator opens the e-mail link → the detail → «Приховати» (reason) → «Позначити: вжито заходів» (note).
  6. Mailpit: the reporter gets «вашу скаргу розглянуто … вжили заходів».
  7. Guest A no longer sees the photo in own frames; guest B no longer sees it in «Усі кадри».
  8. The admin sees «Приховано модерацією» + the reason and no «Показати гостям».
  9. The «Розглянуті» tab lists the report.
  - Desktop project only, per the CI budget; `blocking.spec.ts` runs on both projects at 360 and 1440.
- [ ] **Step 2: Run** `pnpm e2e -- reports blocking` → PASS on 3 consecutive runs (flake check).
- [ ] **Step 3: Commit** `test(e2e): report, moderation and blocking journeys`.

### Task 19: Screenshots, docs, verification, PR M3

**Files:**
- Modify:
  - `BOOTSTRAP.md`: the slice 9 status paragraph (M1–M3, the plan path, ADR 0013, owner actions O1–O4);
  - `docs/architecture/decisions/0013-abuse-reporting-and-operator.md`: status «Implemented»;
  - `docs/design/DESIGN-SYSTEM.md`: §5.9 marks as built, §5.12 «⋯», the report dialog;
  - `docs/ux/design-system.md`: the inventory (`ReportDialog`, `Frame.marks`);
  - `docs/product/mvp.md` / `acceptance-criteria.md`, only where they state report or hide behaviour that differs.

- [ ] **Step 1: Screenshots:**
  - the guest dialog (each state, phone and desktop);
  - the admin chip, marks, viewer panel (reported, admin-hidden, operator-hidden);
  - the blocked banner and the dashboard badge;
  - the `/accept-terms` v2;
  - all saved to `$TMPDIR/stepler-reports-screens/M3/`, with the owner's remarks as a numbered status table.
- [ ] **Step 2: Docs and batched minors.**
- [ ] **Step 3: Verification:** `pnpm typecheck lint test build`, `pnpm --filter @stepler/api test`, `pnpm --filter @stepler/ui test`, and `pnpm e2e` → exit 0. Record the counts.
- [ ] **Step 4: Commit** `docs: slice 9 implemented`; open the PR to `dev` with owner action O4.

---

## Open questions for the owner (recommended default first; tasks follow the default)

1. **[Q1] Does the admin's «Відхилити скарги» also close the report for the operator?**
   - **Default: no.** The admin's dismissal only clears the admin's mark (`adminDismissedAt`). The operator still reviews every report, labelled «Адміністратор відхилив».
   - **Why:** ADR 0013 exists because the owner may be the source of abuse. If the owner could close reports on their own content, that safeguard would be gone.
   - **Alternative:** the admin's dismissal sets `DISMISSED` for everyone. It is simpler, but defeats the operator.
2. **[Q2] What can the admin do with a blocked collection?**
   - **Default: everything except unblocking it.** They can view, delete content, hide, archive, edit settings, manage links and delete the collection.
   - **Why:** the block is enforced at the one guest choke point ([P6]), so nothing the admin does can reach guests. Making the collection read-only would add a check to about 25 admin mutation routes and buy no safety. Letting the admin delete is also their data right; see [Q7] for evidence.
   - **Alternative:** read-only except deletions (`409 COLLECTION_BLOCKED` on every other mutation), which is a new error code and a table-driven test over all admin routes.
3. **[Q3] How does a blocked account learn why the magic link never arrives?**
   - **Default:** the request still answers `202` for everyone (no enumeration), but a blocked address gets a short «акаунт заблоковано, напишіть на …» e-mail instead of the link. Google sign-in and a stale link's verify already show `ACCOUNT_BLOCKED`.
   - This is one e-mail to the account's own mailbox. It is not a report e-mail, so R6 is not affected.
   - **Alternative:** stay silent as today, which is weaker on R7's «clear message».
4. **[Q4] What about a media link fetched just before a hide?**
   - **Default:** accept it and document it. A presigned URL handed out before the hide keeps working for at most 2 × `MEDIA_URL_WINDOW_SECONDS` (2 h by default), and nothing new is ever signed for a hidden item. For urgent illegal content the operator deletes: the purge removes the objects, so old links die once it runs.
   - **Alternative:** move the objects on hide (a copy to a new key and the reverse on unhide). That makes hide a storage job with its own failure modes.
5. **[Q5] What about frames already copied into the guest-page cover or background before the hide?**
   - **Default:** the copies are untouched; they are independent objects with no link to the frame. «From frame» refuses hidden frames from now on. If the cover itself is the problem, the operator blocks the collection.
   - **Alternative:** record each copy's source frame and swap the image out on hide. That needs a new column and an image job.
6. **[Q6] How long are reports kept?**
   - **Default:** the reporter e-mail and locale are deleted right after the decision e-mail, or after 90 days at the latest (`REPORT_EMAIL_RETENTION_DAYS`). The report rows themselves are kept without a fixed term as abuse history, like audit events; Privacy v2 shows `[СТРОК ЗБЕРІГАННЯ]` for them.
   - **Alternative:** delete the rows N days after resolution (a sweep line and a number to choose).
7. **[Q7] Evidence hold for content reported as illegal.**
   - **Default:** none; the normal purge applies (spec §14 default until a lawyer decides). The report row keeps the ids, reason, description and decision. A delete by the admin or the operator purges the files.
   - **Alternative:** an operator "preserve" action that defers the purge. That is post-MVP and needs legal input.

## Checkpoints

- **After Task 3:** the guest-route enumeration test is green. That proves the hidden and blocked rules before any feature depends on them.
- **After Task 7:** the operator authorization matrix is green and M1 is reviewed as a whole before M2 starts.
- **After Task 12:** the owner reviews the console screenshots before M3's UI work.
- **After Task 18:** the journey passes 3 times in a row before the M3 PR.

## Out of scope

Pre-moderation or `pending/approved` states (D10), automatic actions, reports by admins, appeal handling in the app, an evidence hold, a report counter on the dashboard, `returnTo` for magic links, an `OPS_ORIGIN`, a subdomain or separate deployment, a second root layout, and reporting the guest page cover itself.
