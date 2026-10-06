# ADR 0013 — Content Reports and Platform Operator Role

Status: Implemented (slice 9, M1–M3, 2026-10-06; plan `docs/superpowers/plans/2026-10-06-content-reports-and-operator.md`); legal specifics open (evidence hold, DSA)
Date: 2026-09-29, updated 2026-10-06

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
