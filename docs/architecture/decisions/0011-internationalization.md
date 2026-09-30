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

## Spike S8 result (2026-09-29)

next-intl 4.14 works in "without i18n routing" mode with Next.js 16.3 App Router. All pass criteria were met:
- `next build` succeeds;
- `/g/abc` without a cookie renders Ukrainian, and the URL stays `/g/abc` (200, no redirect);
- `Accept-Language: en-US` renders English;
- the `st_locale=uk` cookie beats `Accept-Language: en`;
- client components are translated through `NextIntlClientProvider`.

Setup:
- `next-intl/plugin` in `next.config.ts` pointing to `src/i18n/request.ts`;
- `getRequestConfig` reads the `st_locale` cookie and the `accept-language` header and loads `messages/<locale>.json`;
- the root layout sets `<html lang>` from `getLocale()` and wraps children in `NextIntlClientProvider`;
- no middleware, no `[locale]` segment.

Caveats:
- Every route that reads the locale is dynamic (`ƒ`), because locale depends on cookies/headers. Legal pages are therefore server-rendered on demand; acceptable for MVP.
- next-intl depends on `@parcel/watcher` and `@swc/core` (message extractor tooling). `@parcel/watcher`'s install script is denied in `allowBuilds`; `@swc/core`'s is allowed because the API's test runner needs it (ADR 0005).

## Language switch (Phase 3, 2026-09-30)

- The switch (Українська / English) lives on `/app/settings`, so only a signed-in admin has one. Public pages (`/`, `/login`, `/auth/verify`) have no switch: anonymous visitors get the locale from the cookie or `Accept-Language` as above. (Owner decision, 2026-09-30: no language or theme switch in the header.)
- It writes `st_locale` (1 year, `path=/`, `SameSite=Lax`, `Secure` on https; not `HttpOnly`, the client writes it), sends `PATCH /api/v1/me { locale }` so emails follow the choice, and re-renders with `router.refresh()`, which keeps client state. A failed save shows an error toast; the page still switches.
- "Profile locale first" without middleware: after `/me` loads, the app shell compares the profile locale with the page locale once per visit; if they differ it writes the cookie and refreshes.
