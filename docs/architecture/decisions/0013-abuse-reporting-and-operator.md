# ADR 0013 — Content Reports and Platform Operator Role

Status: Implemented (slice 9, M1–M3, 2026-10-06; plan `docs/superpowers/plans/2026-10-06-content-reports-and-operator.md`; slice 9b appeals and quarantine, 2026-10-07, addendum below); legal specifics open (evidence hold, DSA)
Date: 2026-09-29, updated 2026-10-07

## Context

Open registration means the collection owner may themselves be the source of illegal content, so reports cannot go only to the owner. No full moderation system or internal admin panel in MVP.

## Decision

- `ContentReport` is created by a guest who can see another guest's frame (R1). The collection admin sees reports on their content in the app (a mark, a filter, the reasons), never the reporter's contact and never by e-mail (R2). The Stepler operator sees and decides them.
- Operator = a **dedicated service account**: a user with a verified e-mail listed in `OPERATOR_EMAILS` (e.g. `moderation@<domain>`), never a personal account (R4). The variable lives on the API and on the worker.
- Operator actions (R5), each with a reason (1–500 characters) and audited: hide or unhide a frame, delete a frame, dismiss a report or mark it actioned (the decision covers every open report on the frame, [P2]), block or unblock a collection, block or unblock an account. Content actions never change a report's status ([P3]).
- The operator reaches only reported scope, enforced in SQL ([P5]): a frame with a report, a collection with a report, an account owning such a collection. Anything else is `404`, as for a non-operator.
- Hidden frames vanish from every guest path through one filter (`GUEST_VISIBLE`); a blocked collection or a blocked owner closes every guest route at one choke point (`assertLinkUsable`, [P6]). The admin hides and shows their own frames; the admin cannot undo the operator's hide or block.
- E-mails (R6, [P1]) are pg-boss jobs sent by the worker: one «нова скарга» per report to each operator address (the reason and a console link only), and the decision to a reporter who left an address. The admin never gets report e-mail.
- Reports keep no IP. The reporter's address is kept only until the decision mail, 90 days at most (`REPORT_EMAIL_RETENTION_DAYS`, [Q6]); it never appears in an admin or operator DTO, a log line, an audit event or a job payload.
- Public abuse contact published in the legal documents: the `LEGAL_CONTACT_EMAIL` variable, rendered as the «Контакти» block of `/legal/terms` and `/legal/privacy` (slice 10, PR F1; `docs/legal/README.md`), and used as the appeal contact in the decision mail.

### Console architecture (extraction seams, owner addition to R4)

The console is `/ops` in the same Next app and API, built so it can later become `apps/ops` or `ops.<domain>` with little rework:

| Seam | Now | What extraction changes |
|---|---|---|
| API | `/api/v1/operator/*` in `OperatorModule` with its own `OperatorGuard`, `@ApiTags('Operator')` and contracts file `packages/contracts/src/operator.ts`. It imports `ModerationModule` and `ContentDeletionModule` only, never a user-app controller module (a unit test checks the import graph). | Mount `OperatorModule` in a second Nest app, or route `ops.<domain>/api` to it; no code moves. |
| Guard | `AuthGuard` decides `kind: 'operator'`; `OperatorGuard` turns anyone else into `404`. No operator check in user-app guards or the web proxy. | A separate session audience is a change inside session resolution only. |
| Web | `apps/web/src/app/ops/**` + `apps/web/src/ops/**`, its own client and `ops` message namespace, a nested layout under the shared root. An ESLint boundary keeps it apart from the user app both ways. | Copy the root layout and the two folders into `apps/ops`. |
| Links | Console URLs in e-mail come from `opsUrl()` only. | Add `OPS_ORIGIN` and change `opsUrl`. |
| Auth/CSRF | The same host-only `st_session` cookie and `Origin === APP_ORIGIN` check. | A subdomain needs its own sign-in (a cookie scoped to `ops.<domain>` and an audience claim on the session) or a parent-domain cookie (wider exposure, not recommended), plus `CsrfGuard` accepting the ops origin and CORS if the API host differs. |
| Data/audit | The same database, `AuditService`, `ContentDeletion`, `MediaUrls`. | Unchanged (a modular monolith deployed twice). |

## Alternatives considered

- Reports only to the collection admin — misses owner-originated abuse.
- Role table / RBAC — premature for one operator group.
- The admin's dismissal closing the report for everyone ([Q1]) — the owner could close reports on their own content.
- Fire-and-forget mail from the API (as sign-in links) — loses a report mail on any SMTP hiccup; an outbox polled by the API would add a second queue mechanism.

## Consequences

- Operator membership changes require a config change and deploy, on two services (API and worker).
- The worker now needs the SMTP settings, `APP_ORIGIN` and `OPERATOR_EMAILS` (ADR 0009 addendum).
- A reporter's address is kept at most 90 days; report rows are kept as abuse history without a fixed term (`[СТРОК ЗБЕРІГАННЯ]` in Privacy v2).
- Media URLs signed just before a hide stay valid for at most 2 × `MEDIA_URL_WINDOW_SECONDS` ([Q4]); copies of a frame made earlier as a guest page image are untouched ([Q5]).
- Open legal decisions: evidence preservation for content reported as illegal ([Q7]), DSA applicability.

## Addendum 2026-10-07 — appeals, the moderation quarantine and the ops split (slice 9b)

Plan: `docs/superpowers/plans/2026-10-06-appeals-and-quarantine.md`.

**Context.** Trying slice 9, the owner asked that the collection admin can contest the operator's measures in the app, that an operator mistake be recoverable, and that the console keep guest reports and admin appeals apart.

**Decision.**
- *Quarantine (Q-A1).* The operator's «Видалити» is a quarantine, not a soft delete: `ContentItem.quarantinedAt / quarantinedByUserId / quarantineReason / purgeAfter` (`purgeAfter` = now + `MODERATION_QUARANTINE_DAYS`, default 90, an API variable). `deletedAt` stays `NULL`, so `content.purge` cannot take it early. Guests lose it at once (`GUEST_VISIBLE` gains `quarantinedAt: null`); the admin still sees it, greyed, with the reason and the purge date, without a download link, and cannot hide or show it (`409 CONTENT_MODERATED`); the admin's own delete still works. A quarantine replaces an operator hide (CHECK `ContentItem_quarantine_not_operator_hidden`); an admin hide is kept. The operator restores it (`POST /operator/content/{id}/restore`) until the hourly sweep soft-deletes it past `purgeAfter` through `ContentDeletion` (actor `SYSTEM`, reason `quarantine_expired`), and the usual purge removes the files. Admin and guest deletions keep the prompt purge.
- *Quota.* Quarantined bytes do not count toward the owner's quota or the collection size (`UsageService`); they stay in storage until the purge.
- *Appeals (Q-A2–Q-A5).* `ModerationAppeal` (no FKs, so it survives purges; one `OPEN` per target by a partial unique index). Only the collection's admin appeals, on a frame the operator hid or quarantined, or on a blocked collection; a target in no appealable state is `409 APPEAL_NOT_APPLICABLE`, a second open one `409 APPEAL_OPEN`, `LIMIT_APPEALS_PER_ACCOUNT_PER_DAY` (20) per rolling day. The operator upholds (the measure is reversed in the same transaction through its own use case: restore, unhide or unblock, each audited) or rejects with a note the admin reads. Decisions never touch guest reports. The admin learns the outcome in the app only; the operator gets one `mail.appeal-received` per appeal (target type and console link only). Audit: `appeal.create`, `appeal.uphold`, `appeal.reject`, `content.quarantine`, `content.restore`.
- *Scope.* The operator's reach ([P5]) widens to «reported or appealed» targets.
- *Ops split (Q-A6).* The console has two sections, «Скарги гостей» (`/ops/reports`) and «Апеляції адміністраторів» (`/ops/appeals`), API `/api/v1/operator/appeals…` in `OperatorModule`.

**Alternatives considered.** A general user trash (all deletions restorable): a separate feature, rejected for now. Appeals by e-mail only: not traceable in the console and invisible to the admin. Hard-deleting on the operator's decision with backups as the safety net: no in-product recovery.

**Consequences.** Quarantined files cost storage for up to 90 days outside the owner's quota. A frame may outlive `purgeAfter` by up to an hour (the sweep's interval). Two new optional API variables (`MODERATION_QUARANTINE_DAYS`, `LIMIT_APPEALS_PER_ACCOUNT_PER_DAY`). Blocked accounts still appeal by e-mail (they cannot sign in). Legal v2 drafts describe the in-app appeal and the quarantine (unreleased, edited in place).
