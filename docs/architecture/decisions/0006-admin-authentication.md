# ADR 0006 — Admin Authentication

Status: Accepted (product constraints accepted; implementation pending spike S1)
Date: 2026-09-29

## Context

Owner decisions: magic link + Google OAuth, no passwords, open registration with configurable limits, future OAuth providers without remodeling users. Web and API are served same-origin.

## Decision

- Opaque random session token in an `HttpOnly; Secure; SameSite=Lax` cookie; only a SHA-256 hash is stored; server-side revocation.
- CSRF: SameSite=Lax plus `Origin` / `Sec-Fetch-Site` validation on unsafe methods.
- Model: `User` + `AuthAccount(provider, providerAccountId)`; Google identity links to an existing user only when Google reports the email as verified.
- Magic link tokens: single-use, short-lived, hashed; per-email and per-IP limits; Turnstile required (ADR 0012).
- Email sending through a `Mailer` port; Mailpit locally; provider chosen later.
- Implementation: Better Auth mounted in NestJS if S1 confirms NestJS compatibility, schema control with Prisma and maintenance; otherwise a small in-house implementation using the model above.

## Alternatives considered

- JWT access/refresh tokens — harder revocation, token storage in the browser, no benefit for a same-origin web app.
- Auth.js — Next-centric; the API must be the authority.
- Hosted IdP (Clerk/Auth0/Supabase) — fastest, but frontend SDKs conflict with ADR 0002, adds vendor cost and data-residency questions.

## Consequences

- Email provider becomes a foundation-level dependency.
- Security of the auth flow is owned by the project (tests required for token reuse, expiry, account linking).
