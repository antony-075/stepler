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
