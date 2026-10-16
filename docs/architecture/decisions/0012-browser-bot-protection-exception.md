# ADR 0012 — Cloudflare Turnstile as a Browser-Side Integration Exception

Status: Accepted (accepted in discovery F7)
Date: 2026-09-29

## Context

ADR 0002 keeps third-party integrations on the backend. Bot protection for open registration requires a browser-side widget.

## Decision

- Turnstile widget in the browser produces a token; the backend verifies it with Cloudflare's verification API. Presence of a client token is never treated as verification.
- Required on magic-link requests. Guest flow: disabled by default, switchable by configuration (for example, on detected abuse).
- Secret key stays server-side; only the site key is public.

## Alternatives considered

- No challenge, rate limits only — weak against distributed signup abuse.
- reCAPTCHA / hCaptcha — heavier privacy footprint or no advantage.

## Consequences

- A third-party script on the login page (not on guest pages by default).
- Documented exception to ADR 0002.

## Addendum 2026-10-16 — e-mail + password (ADR 0019)

The magic link is gone. Turnstile is now required on every request that sends mail: `POST /auth/register`, `POST /auth/verification` (resend) and `POST /auth/password/forgot`. `POST /auth/login` has no challenge; it is bounded by the per-IP and per-address failure windows of ADR 0019 instead. The widget is therefore on `/register`, `/forgot-password` and the «Надіслати лист ще раз» form on `/login`.
