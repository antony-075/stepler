# ADR 0011 — Internationalization

Status: Accepted (languages accepted in discovery Q4; library pending spike S8)
Date: 2026-09-29

## Context

Ukrainian (default) and English. Guest links and QR codes must be identical for all users. No hardcoded user-facing strings.

## Decision

- No locale segment in URLs. Resolution: admin profile locale → locale cookie → `Accept-Language` → `uk`.
- Web: per-locale message catalogs; next-intl in no-prefix mode if S8 confirms; lint rule against literal JSX strings.
- API: error codes only; emails rendered by the API in the recipient's locale.
- Legal documents versioned per locale.

## Alternatives considered

- Locale-prefixed routes — SEO-friendly, but pointless for app screens and breaks the "one QR for everyone" requirement.

## Consequences

- Marketing/SEO pages, if added later, may use prefixed routes separately.
