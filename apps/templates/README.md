# @stepler/templates

The guest page templates (ADR 0017; plan `docs/superpowers/plans/2026-10-05-guest-page-templates.md`).
A template is a ready-made layout for a collection's guest page that the admin picks and tunes
with bounded tweaks (background, accent, heading font, cover placement, alignment, corners).

```
pnpm templates:dev          # the gallery: Storybook on http://localhost:6007
pnpm --filter @stepler/templates test
```

## The templates

| id | name | scheme | heading / body | notes |
|---|---|---|---|---|
| `classic` | T1 «Класика» | light | Geologica | the light table, a 472px white aside on desktop |
| `fullscreen` | T2 «На весь екран» | dark | Manrope | the cover is the first screen and the background; a glass action bar |
| `journal` | T3 «Журнал» | light | Cormorant / Lora | a printed album; centred, a matted 3:4 print |
| `postcard` | T4 «Листівка» | light | Comfortaa / Nunito | an airmail card, polaroid frames (rotation: ADR 0015 amendment) |
| `party` | T5 «Вечірка» | dark | Unbounded / Manrope | a round emblem with the title around it, bento grids |
| `minimal` | T6 «Мінімалізм» | light | Golos Text | white space, a ruled action row; cover none, top or side |

Each template has a fixed scheme [D5]: the root sets `data-scheme`, and `src/styles.css` bridges the
app's tokens to the template's (`--tpl-*`) so the app's slots follow it.

## Two entry points

- **`@stepler/templates/core`**: plain TypeScript, built to `dist` (like `@stepler/contracts`).
  Template definitions, WCAG contrast maths, token derivation (`themeTokens`), `resolveTheme`,
  `applyTemplate`, the registry and the font list. The API validates drafts with it; it has no
  React and no UI kit (lint enforces it).
- **`@stepler/templates/react`**: TSX sources, transpiled by Next like `@stepler/ui`. One
  `Layout` and one `Thumbnail` per template, and `GuestTemplateRoot`, which resolves the stored
  template and settings and scopes the theme's CSS variables under `[data-template=<id>]`.
- `@stepler/templates/styles.css` (every template's scoped sheet) and `@stepler/templates/fonts/*`
  (the committed woff2 files; `fonts/CREDITS.md`).

## The contract

The app (apps/web) owns data, state and copy; a template owns only the page around them.

- `model: GuestPageModel`: title, description, welcome, the counts line, the cover and background
  images (`TemplateImage`), and the phase (`first-visit` or `contributed`).
- `actions: TemplateActions | null`: the primary action (`files` or `text`), the quieter
  secondary one and the «keep the page open» note, as labels and callbacks. The template draws
  its own buttons; `onSelect` runs synchronously inside the click (iOS file picker). `null` on a
  view-only link.
- `slots: TemplateSlots`: the brand, the language switch, the legal notice, the footer, and the
  own and shared frames sections. Rules: the legal notice comes directly after the actions,
  wherever they are drawn (a sticky bar too); the footer always renders and is never covered.
- `settings` (resolved and valid) and `def` (the definition).

Templates contain no literal UI strings: copy comes from the model or `apps/web/messages`
(ADR 0011; lint enforces it). They may import only `@stepler/contracts`, `@stepler/ui`, `react`,
`lucide-react` and `zod`: never Next, next-intl, TanStack Query, `@/*` or a path outside this
package (`eslint.boundaries.js`).

Styling rules: every selector in a template's `styles.css` starts with `[data-template='<id>']`
(`src/styles.test.ts`); no `vh`/`dvh` in template sheets (use `svh`); motion only under
`prefers-reduced-motion: no-preference` (stories tagged `reduced-motion` run in a second Vitest
project that emulates `reduce`); touch targets at least 44px; nothing critical on hover only; no
sideways scroll at 320/360/390. Text colours always come from the theme tokens (`--tpl-text`,
`--tpl-body`, `--tpl-muted`, `--tpl-link`, `--tpl-accent-text`, `--tpl-on-accent`), so the contrast
auto-adjustment [D3] works whatever the admin chooses. A sticky action bar comes before the footer
in the DOM, so at the end of the page it rests above the footer instead of covering it. The app's
frames are restyled through their slots (`[data-slot=guest-own-frames]`,
`[data-slot=frame-grid] > ul`, `li > div` (the app's wrapper), `[data-slot=frame-media]`,
`[data-kind]`).

## Add a template

1. A folder `src/templates/<id>/` (the id is a stable slug; the folder name is the id).
2. `definition.ts`: the `TemplateDefinition` (defaults, options, palette, `migrate`). The palette
   test (`src/core/palettes.test.ts`) must pass for every option.
3. `layout.tsx`, `thumbnail.tsx`, `styles.css` (scoped), `index.ts` (the `GuestTemplate`).
4. Register it in both registries: `src/core/registry.ts` and `src/react/registry.ts`; import its
   `styles.css` in `src/styles.css`.
5. Messages in `apps/web/messages/{uk,en}.json`: `templates.<id>.name` and any
   `templates.<id>.locks.*` reasons.
6. `<id>.stories.tsx` with every fixture at 360/390/768/1440 (`storyAt` in `src/fixtures`).
7. A row in DESIGN-SYSTEM's templates section (Appendix A style), and screenshots at 390 and 1440
   next to the artboard for the owner's review.
