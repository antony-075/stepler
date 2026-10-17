# ADR 0016 — Legal Documents and Their Acceptance

Status: Accepted (owner decisions L1–L4, 2026-10-04)
Date: 2026-10-04

## Context

Before guest contribution can reach production ([C20]), Stepler needs public Terms of Service and a Privacy Policy (uk/en), a privacy/abuse contact (F2, F6), and a record that every admin accepted both (F8: acceptance "at registration", versioned, without forcing re-acceptance on every change). Guests see a short notice with links, not a checkbox (spec §15). No legal texts exist yet (owner, 2026-10-04): the mechanism has to work on placeholder texts that are clearly drafts, and the real texts must replace them without code changes to the mechanism. Accounts already exist on staging from before this work.

## Decision

1. **Registry in code, texts in the repository.** `@stepler/contracts` holds `LEGAL_DOCUMENTS`: one entry per document (`TERMS`, `PRIVACY`) with its current `version` (`v1`, `v2`, …), `effectiveDate`, `draft` and `requireReacceptance`, and the pure `legalStatus()` the API and the web share. The bodies are Markdown files `apps/web/content/legal/<slug>.<locale>.<version>.md`, rendered on the server at `/legal/terms` and `/legal/privacy`. Publishing a version is a new file pair plus a registry change in one commit (`docs/legal/README.md`).
2. **Acceptance on the sign-in card (L1).** A required checkbox («Я приймаю Умови використання та Політику конфіденційності», links in new tabs) for everyone; «Отримати посилання для входу» and «Продовжити з Google» stay disabled until it is ticked. The card sends the current versions (`GET /auth/methods.legal`) back:
   - magic link: `POST /auth/magic-link` requires `legal: {terms, privacy}`; the API validates them against the registry and stores them on the `MagicLinkToken` row (two nullable columns with a format CHECK);
   - Google: `GET /auth/google/start?terms=&privacy=` puts them into the HMAC-signed `st_oauth` transaction next to `state`, `codeVerifier` and `returnTo`, so they are as tamper-proof as those.
   Magic-link verify and the Google callback write the `LegalAcceptance` rows in the same transaction that completes the sign-in (email verification, account upsert), for the user they create or find, idempotently (`createMany … skipDuplicates` on `(userId, document, version)`), and only for versions that are current at that moment. One function (`LegalService.recordAcceptance`) serves every path.
   **Requester and mailbox owner (security review I1, owner decision 2026-10-04).** On the magic-link path the person who ticks the card is the requester, who may type someone else's address. The acceptance is therefore given by the requester on the card **and confirmed by the mailbox owner**: the e-mail and the verify page («Увійти як …») both carry the line «Продовжуючи, ви приймаєте Умови використання та Політику конфіденційності» with links to both documents (absolute `APP_ORIGIN` URLs in the e-mail, new tabs on the page), and the rows are written only when the mailbox owner presses «Увійти» on the verify page. On the Google path the requester and the account holder are the same browser; `GET /auth/google/start` additionally refuses `Sec-Fetch-Site: cross-site`, so a start launched from another site cannot carry a tick.
3. **Server-side enforcement.** A magic-link request without versions → `400 VALIDATION_FAILED`; with versions that are not current → `400 LEGAL_VERSION_OUTDATED` (before the per-IP counter, no row, no mail). A Google start without valid versions → `302 /login?error=LEGAL_ACCEPTANCE_REQUIRED` (stale: `…LEGAL_VERSION_OUTDATED`) and no `st_oauth` cookie, so Google is never contacted. The disabled buttons are UX, not the control.
4. **The gate.** `AuthGuard` resolves the session together with the user's acceptance rows (one `include`, no second query) and answers `403 LEGAL_ACCEPTANCE_REQUIRED` on every account route, operator routes included, until both documents are satisfied; exempt are `@Public()` routes and `@SkipLegalGate()` on exactly `GET /me`, `PATCH /me` (the language switch: before acceptance only `locale` may change, a `displayName` gets the same 403) and `POST /me/legal-acceptances`.
5. **The fallback page.** `/accept-terms` (not indexed) shows the current documents, the same checkbox and «Прийняти і продовжити» (`POST /me/legal-acceptances`, idempotent; a stale version → `400 LEGAL_VERSION_OUTDATED` and nothing written). The web redirects there from `/app`, `/` and `/login` when `GET /me` says `legal.accepted: false`. It serves accounts created before the checkbox (once), a link or OAuth transaction whose versions went stale before it was used (the sign-in succeeds and records nothing), and a forced re-acceptance.
6. **What a row stores (L2):** `userId, document, version, acceptedAt, requestId` — no IP address; the request id correlates the row with the request log.
7. **Re-acceptance (L3):** a new version is satisfied by any earlier acceptance unless its registry entry sets `requireReacceptance: true` (a separate product/legal decision, in the same commit as the text); then everyone passes the fallback once.
8. **Contact and readiness (L4):** the contact e-mail is configuration (`LEGAL_CONTACT_EMAIL`), rendered into both pages. The web server refuses to start while a current document is a draft or the contact is unset, unless `LEGAL_ALLOW_DRAFT=true` (CI, the image check, staging; never production); `next dev` always allows drafts.

## Alternatives considered

- **The interstitial as the primary path** (recommended by engineering, not chosen by the owner): every new account lands on `/accept-terms` once after its first sign-in. One code path, no token columns and no transport. Rejected by the owner because the acceptance should be given at the moment registration starts, as F8 describes. Cost of the chosen design: two transport paths and two token columns to keep in step with the registry.
- **Documents stored in the database** with an editor: no editor, reviewer or diff exists for MVP; a pull request gives review, history and a diff for free.
- **MDX or TSX content:** needs a developer to convert a lawyer's text and fights the "no literal UI strings" lint rule; Markdown does neither.
- **A build-time gate** for drafts: needs the flag plumbed into the build, the Dockerfile and CI; a start-up check has one place and fails Render's health check the same way.
- **Storing the IP address** (or its HMAC, like `MagicLinkToken.requestIpHash`): nothing in the product needs it yet; reversible later without a backfill if a lawyer decides otherwise.

## Consequences

- Texts are a pull request; a version bump is one commit. The registry test, the readiness check and `verify-images.sh` keep placeholder texts out of production.
- Two sign-in transport paths must carry the versions; both validate against the registry, and the callback/verify re-check that the versions are still current before recording.
- Session resolution reads the acceptance rows with the session (one `include`); there is no denormalized flag to keep in sync.
- A stale link signs in but records nothing and lands on the fallback; pre-slice accounts see the fallback once.
- Tests create accounts with acceptances by default (`signInAs(…, legal = true)`); the e2e helpers tick the card's checkbox and accept on the fallback if it ever appears.
- Open (legal, spec §21): DSA/GDPR review, whether the IP is ever needed, the real wording of the checkbox and the guest notice (placeholders in `messages/*.json`).

## Addendum 2026-10-16 — e-mail + password (ADR 0019)

The magic-link transport (decision 2, the `MagicLinkToken` columns) is gone with the magic link. The checkbox is now on `/register`, not on the sign-in card:

- `POST /auth/register` requires `legal: {terms, privacy}` (without it `400 VALIDATION_FAILED`, stale `400 LEGAL_VERSION_OUTDATED`, checked before any mail or row) and records the acceptance in the transaction that creates the unverified account. The mailbox owner confirms the address afterwards; the requester is the person who ticks the box, as on the Google path.
- The Google button on `/register` carries the versions as before. The one on `/login` does not, so a new account created from `/login` meets `/accept-terms` once.
- The gate (decision 4) and the fallback page (decision 5) are unchanged.
