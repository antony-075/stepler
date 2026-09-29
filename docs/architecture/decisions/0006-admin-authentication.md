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
| 3 | Scanner-safe magic-link verification as POST | **fail.** `/magic-link/verify` is `GET` only (`POST` → 404). A cross-site `GET` with an attacker's token (`Origin: https://evil.test`, `Sec-Fetch-Site: cross-site`) returns 200 and sets a session cookie: login CSRF, the attack our Origin rule blocks |
| 5 | Custom send-email hook | pass (`sendMagicLink` receives the token; our Mailer port could be used) |
| 7 | Cookie name and attributes | partly observed: `st.session_token` via `cookiePrefix`, `Max-Age=604800; Path=/; HttpOnly; SameSite=Lax` |
| 2, 4, 6, 8 | Schema mapping, principal in our guard, Turnstile pre-hook, web proxy | not evaluated (decision already made) |

What we keep from the spike:
- Magic-link tokens: Better Auth's plugin offers `storeToken: "hashed"`, the same design as ours (SHA-256 of a random token).
- Security advisories published for better-auth packages in 2026-04 to 2026-09 include issues in exactly the flows we build: "OAuth sign-in can link to an account an attacker registered in advance", "OAuth callback accepts a forged state value when state is kept in a cookie". Our tests must cover these cases for the in-house code in Task 14: a pre-registered email is linked to Google only with `email_verified`, and `state` is bound to the `st_oauth` cookie and compared in constant time. The password advisory does not apply, because Stepler has no passwords. Whether each advisory is fixed in 1.7.6 was not checked, because the decision does not depend on it.
