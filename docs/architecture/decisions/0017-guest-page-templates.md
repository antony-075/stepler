# ADR 0017 — Guest Page Templates

Status: Proposed (owner decisions 2026-10-04/05, D1–D5 confirmed; plan `docs/superpowers/plans/2026-10-05-guest-page-templates.md`)
Date: 2026-10-05

This ADR covers the parts in place after PR H (the package, its contract, fonts and contrast) and
the decisions the later PRs build on. The storage parts (images per slot, published and draft
versions) are added in plan Task 11 (PR I).

## Context

The owner moved guest page appearance into the MVP (PRODUCT §24.3 listed "themes, custom colours,
typography" as post-MVP): the admin picks one of six ready-made templates (Класика, На весь
екран, Журнал, Листівка, Вечірка, Мінімалізм) and tunes it with bounded tweaks — background,
accent, heading font, cover placement, alignment and corners — in an editor with a live preview.
Guests see changes only after «Зберегти».

Three things make this more than styling:

1. **Six layouts, not six colour schemes.** The templates differ in structure (a full-screen cover,
   a postcard, a bento grid), so they are code, and they must stay away from the app's data,
   state and routing to remain swappable and testable on their own.
2. **Any admin choice must stay readable.** Free accents (lime on a light background reads at
   1.2:1) and background images (pure white or black) must never produce unreadable text.
3. **Fonts.** Twelve families with Cyrillic are offered; ADR 0015 forbids build- or run-time font
   downloads, and a guest page must not pay for fonts it does not use.

## Decision

### A workspace package, `apps/templates` (`@stepler/templates`)

- **`./core`**: plain TypeScript, built to `dist` like `@stepler/contracts`. Template definitions
  (defaults, allowed options, locks, palette, `migrate`), WCAG contrast maths, token derivation,
  `resolveTheme`, `applyTemplate`, the registry and the font list. The API validates drafts with
  it (PR I) and the web derives tokens with it.
- **`./react`**: TSX sources transpiled by Next, like `@stepler/ui`. One `Layout` and one
  `Thumbnail` per template, and `GuestTemplateRoot`, which resolves the stored template and
  settings (never throwing: an unknown template or invalid settings fall back to defaults) and
  scopes the theme's CSS variables under `[data-template=<id>]`.
- **Boundary, enforced by lint** (`apps/templates/eslint.boundaries.js`, tested): templates import
  only `@stepler/contracts`, `@stepler/ui`, `react`, `lucide-react` (the icon set the UI kit
  already uses, for the templates' own buttons) and `zod`; never Next,
  next-intl, TanStack Query, the web app's `@/*` or a relative path out of the package. The core
  and every `definition.ts` import no React or UI kit. Templates contain no literal UI strings
  (ADR 0011): copy arrives in the model.
- Relative imports in the package name the `.ts` file: Turbopack does not map `.js` to `.ts`, and
  the core's build rewrites them to `.js` (`rewriteRelativeImportExtensions`).
- The theme vocabulary (`themeSettingsSchema`, `FONT_IDS`, `ACCENT_PRESETS`) is API contract and
  lives in `@stepler/contracts`; which values a template allows is the core's.

### The contract between the app and a template

- `model: GuestPageModel` (title, description, welcome, counts line, cover and background images,
  phase), `actions: TemplateActions | null` (labels and callbacks; the template draws its own
  buttons; `onSelect` runs synchronously in the click so iOS opens the file picker), and
  `slots: TemplateSlots` (brand, language switch, legal notice, footer, own and shared frames).
- The app keeps everything interactive it already has: data fetching, the uploader, the frames
  and viewer, the name prompt, the wish composer, the legal notice and the language switch.
  Dialogs portal outside the template root and keep the Stepler look.
- Invariants every template keeps: the legal notice (ADR 0016) directly after the actions, in a
  sticky bar too; the footer always rendered and never covered; no sideways scroll at
  320/360/390; touch targets of at least 44px; nothing critical on hover only; motion only under
  `prefers-reduced-motion: no-preference`; every selector in a template sheet scoped to its
  `[data-template]` (tested).
- Each template is checked in its own Storybook (`pnpm templates:dev`, port 6007) against fixture
  models at 360/390/768/1440, with play checks and axe.

### Readable by construction [D3]

- The admin's accent is kept as the *fill*. Every text colour is derived until it reads at ≥ 4.5:1
  on every surface it can sit on: the label on the accent is ink or white (pure black or white
  as a last resort, which always reaches ≥ 4.58:1); accent-coloured text is the accent mixed
  toward black or white in 2 % steps.
- Over a background image, the least veil that keeps text readable over a pure-white *and* a
  pure-black picture is computed (`minVeil`); the dimming range starts there.
- The API recomputes the same function; its `422 THEME_CONTRAST_TOO_LOW` is a safety net against a
  broken definition only. A test checks every definition over all its options, the six presets
  and 200 random accents.

### Fonts

- Twelve families (latin + cyrillic, OFL 1.1) are committed as woff2 in `apps/templates/fonts`,
  built from google/fonts at a pinned commit with the ADR 0015 recipe
  (`apps/templates/scripts/build-fonts.sh`, not run in CI); sources, licences and sizes in
  `fonts/CREDITS.md`. Four families declare a Reserved Font Name (Playfair Display, Lora,
  Comfortaa, PT Serif); a subset is a Modified Version (OFL-FAQ 2.6), so their subsets and CSS
  family names carry Stepler names instead.
- The web loads them with `next/font/local`, `preload: false`. The page's CSS declares all of
  them (about 1.3 KB compressed), but a file downloads only when the template root carries its
  class and text uses it: one or two families per page. Classic uses the interface's Geologica
  and downloads nothing extra. This amends ADR 0015's "two font files", which still holds for
  everything but a guest page with a template that uses its own fonts.
- The font tweak sets the heading font; body text stays in the template's body face [D4].

### Rendering and preview

- The guest page renders the published template client-side after the session exchange, as
  before ([C3], ADR 0007) [D2]. Template components use no hooks, so a later server render
  changes nothing in the package.
- Each template has a fixed scheme (T2 and T5 dark, the rest light); the guest page stops
  following the visitor's light/dark setting for redesigned templates [D5]. Until PR K, `classic`
  is the previous guest page ported unchanged and still follows it.
- The editor's live preview (PR J) is a same-origin iframe (`/preview/collections/[id]`,
  `frame-ancestors 'self'`, noindex) fed by `postMessage`: templates use viewport media queries,
  `svh` and fixed bars that only a real viewport renders faithfully, and their CSS and fonts stay
  isolated from the admin shell. It reads admin endpoints only and never creates a guest session.

## Alternatives considered

- **Templates inside apps/web.** Simpler wiring, but nothing would stop a template from reaching
  into routing, queries or i18n, and the API could not validate with the same definitions.
- **Themes as CSS variables only.** Cannot express six different layouts.
- **Reject low-contrast choices** (the API refuses an accent under 4.5:1). Would make Абрикос,
  Лайм and Електрик unusable on every light template.
- **Fonts from Google at runtime.** Contradicts ADR 0015 (privacy, availability, build failures).
- **One font for headings and body.** Display faces at 15–17px body sizes hurt reading on phones.
- **An inline preview instead of an iframe.** Viewport units and media queries would answer to
  the admin's window, not the previewed device, and template CSS would leak into the admin.

## Consequences

- One more workspace package to build, lint and test; its Storybook runs in CI with the others.
- Adding a template is a folder, two registry lines, messages and stories
  (`apps/templates/README.md`).
- Guest page weight after PR H, first view of a contributing link at 390px (production build,
  transferred bytes): JavaScript 355 415 → 360 509 B (+5.1 KB for the core, the root and
  classic), CSS 18 945 → 20 328 B (+1.4 KB, mostly the `@font-face` declarations), fonts unchanged
  at 70 048 B (only Geologica and Geist Mono load), the document 17 047 → 16 356 B.
- `apps/web`'s tsconfig allows `.ts` import specifiers (`allowImportingTsExtensions`; it never
  emits), because it type-checks the templates' sources.
