# ADR 0006 — Admin Authentication

Status: Accepted (implementation: in-house, decided by spike S1)
Date: 2026-09-29

## Context

Owner decisions: magic link + Google OAuth, no passwords, open registration with configurable limits, future OAuth providers without remodeling users. Web and API are served same-origin.

## Decision

- Opaque random session token in an `HttpOnly; Secure; SameSite=Lax` cookie; only a SHA-256 hash is stored; server-side revocation.
- CSRF: SameSite=Lax plus `Origin` / `Sec-Fetch-Site` validation on unsafe methods.
- Model: `User` + `AuthAccount(provider, providerAccountId)`; Google identity links to an existing user only when Google reports the email as verified.
- Magic link tokens: single-use, short-lived, hashed; per-email and per-IP limits; Turnstile required (ADR 0012).
- Magic link verification: the email links to a web page, which shows "Sign in as <email>" (read-only `POST /auth/magic-link/preview`) and signs in only on a button click (`POST /auth/magic-link/verify`). This is scanner-safe, and a victim who opens an attacker's link sees a foreign address before signing in.
- Email sending through a `Mailer` port; Mailpit locally; provider chosen later.
- Implementation: a small in-house implementation using the model above (spike S1 rejected Better Auth, see below).

## Alternatives considered

- JWT access/refresh tokens — harder revocation, token storage in the browser, no benefit for a same-origin web app.
- Auth.js — Next-centric; the API must be the authority.
- Hosted IdP (Clerk/Auth0/Supabase) — fastest, but frontend SDKs conflict with ADR 0002, adds vendor cost and data-residency questions.

## Consequences

- Email provider becomes a foundation-level dependency.
- Security of the auth flow is owned by the project (tests required for token reuse, expiry, account linking).

## Spike S1 result (2026-09-29)

Question: does Better Auth meet the hard criteria of the Phase 2 plan (Task 3), or do we build auth in-house?

Setup: `better-auth` 1.7.6 (latest, 2026-09-24) with the magic-link plugin and `storeToken: "hashed"`, memory adapter, `basePath: /api/v1/auth`, telemetry disabled, driven through `auth.handler(Request)`. `@thallesp/nestjs-better-auth` 2.8.0 declares NestJS `^12` and TypeScript `^6` peers. It was not mounted, because two hard criteria had already failed at the library level.

**Decision: in-house.** Better Auth wins only if all hard criteria hold, and two fail with runtime evidence.

| # | Hard criterion | Result |
|---|---|---|
| 1 | Session tokens stored hashed | **fail.** `createSession` stores `token: generateId(32)` and `findSession` looks up the raw cookie value. There is no session hashing option (session options: `expiresIn`, `updateAge`, `disableSessionRefresh`, `deferSessionRefresh`, `storeSessionInDatabase`, `cookieCache`, `freshAge`). At runtime, the cookie token equals `session.token` in the database. A `databaseHooks.session.create.before` hook that hashes the token only moves the hash into the cookie, so the database again holds exactly the value the browser presents. In addition, `GET /get-session` returns `session.token` in its JSON body, exposing the token to page JavaScript |
| 3 | Scanner-safe magic-link verification as POST | **fail.** `/magic-link/verify` is `GET` only (`POST` → 404). A cross-site `GET` with an attacker's token (`Origin: https://evil.test`, `Sec-Fetch-Site: cross-site`) returns 200 and sets a session cookie: login CSRF. Our design verifies by POST with an Origin check, which blocks the cross-site form. An attacker can still mail the victim a genuine `/auth/verify` link carrying the attacker's token; against that, the verify page first shows the email the link signs in to, read through a non-consuming preview endpoint (owner decision, 2026-09-29) |
| 5 | Custom send-email hook | pass (`sendMagicLink` receives the token; our Mailer port could be used) |
| 7 | Cookie name and attributes | partly observed: `st.session_token` via `cookiePrefix`, `Max-Age=604800; Path=/; HttpOnly; SameSite=Lax` |
| 2, 4, 6, 8 | Schema mapping, principal in our guard, Turnstile pre-hook, web proxy | not evaluated (decision already made) |

What we keep from the spike:
- Magic-link tokens: Better Auth's plugin offers `storeToken: "hashed"`, the same design as ours (SHA-256 of a random token).
- Security advisories published for better-auth packages in 2026-04 to 2026-09 include issues in exactly the flows we build: "OAuth sign-in can link to an account an attacker registered in advance", "OAuth callback accepts a forged state value when state is kept in a cookie". Our tests must cover these cases for the in-house code in Task 14: a pre-registered email is linked to Google only with `email_verified`, and `state` is bound to the `st_oauth` cookie and compared in constant time. The password advisory does not apply, because Stepler has no passwords. Whether each advisory is fixed in 1.7.6 was not checked, because the decision does not depend on it.

## Implemented design (Phase 2, 2026-09-30)

- **Tokens:** sessions and magic links use 32 random bytes (base64url, 43 characters); only SHA-256 hashes are stored. Sessions last `SESSION_TTL_DAYS` (30); `lastUsedAt` is refreshed at most hourly.
- **Cookies:** `st_session` (`HttpOnly; SameSite=Lax; Path=/`, `Secure` when `COOKIE_SECURE`), `st_oauth` (HMAC-signed `{state, codeVerifier, returnTo}`, `Path=/api/v1/auth/google`, 10 minutes). HMAC and IP-hash keys are HKDF-derived from `APP_SECRET` with distinct `info` values.
- **Guards:** global `CsrfGuard` (Origin must equal `APP_ORIGIN` on unsafe methods, public routes included), then `AuthGuard` (default deny, `@Public()` opt-out). An operator is a verified user whose email is in `OPERATOR_EMAILS`.
- **Magic link:** Turnstile first; a per-email hourly limit counted from `MagicLinkToken` rows and per-IP limits (`@nestjs/throttler`, in memory). Unknown, existing and blocked addresses get the same 202, and mail is sent after the response so timing does not differ. Preview is read-only; verify consumes atomically (`UPDATE … RETURNING`), so concurrent verifies create one session; a blocked user gets 403. Signing in replaces the current session.
- **Google:** arctic (OIDC code flow + PKCE). An existing Google `sub` signs in to its user; otherwise a **verified** Google email links to or creates the user with that email (case-insensitive). An unverified Google email never creates or links an account (stricter than the Phase 2 plan): otherwise an attacker could pre-register a victim's address. `returnTo` is limited to `/app` paths. The real Google flow is unverified until OAuth credentials exist.
- **Web:** `/login`, `/auth/verify` (preview first, `Referrer-Policy: no-referrer`) and the `/app` shell. Covered by API integration tests and Playwright journeys on WebKit and Chromium.
