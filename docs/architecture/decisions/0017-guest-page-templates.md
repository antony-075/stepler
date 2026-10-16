# ADR 0017 — Guest Page Templates

Status: Accepted (owner decisions 2026-10-04/05, D1–D5 confirmed; plan `docs/superpowers/plans/2026-10-05-guest-page-templates.md`; PR H and PR I reviewed; contract step done in PR L)
Date: 2026-10-05

This ADR covers the package, its contract, fonts and contrast (PR H), the storage model, the
editor's draft and publish semantics and the image lifecycle (PR I), and the decisions the later
PRs build on.

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
- Each template has a fixed scheme (T2 and T5 dark, the rest light); the guest page no longer
  follows the visitor's light/dark setting [D5]. The root sets `data-scheme` and `color-scheme`, and
  a zero-specificity bridge in `@stepler/templates/styles.css` sets the app's tokens for that scheme
  and maps surface, text, accent, link and focus to the template's own tokens, so the app's slots
  (frames, the notice, the footer) follow the template (PR K; `followsSystemScheme` is gone).
- The editor's live preview (PR J) is a same-origin iframe (`/preview/collections/[id]`,
  `frame-ancestors 'self'`, noindex) fed by `postMessage`: templates use viewport media queries,
  `svh` and fixed bars that only a real viewport renders faithfully, and their CSS and fonts stay
  isolated from the admin shell. It reads admin endpoints only and never creates a guest session.

### Storage: published and draft versions, slot-typed images (PR I)

- **`GuestPageVersion`:** one `PUBLISHED` row per collection (what guests see) and at most one
  `DRAFT` (the editor's), each with `templateId`, `templateVersion`, validated `settings` (jsonb),
  `welcomeMessage`, `coverImageId` and `backgroundImageId`. Settings are validated by the
  template's definition before they are stored and resolved again on every read
  (`resolveTheme`: a removed template or settings it no longer accepts read as the defaults,
  never an error). Guests get only the published version, inside `GuestContext.page`; no guest
  DTO carries a draft, a revision or an image status.
- **`CollectionImage`:** a row per image with its `slot` (`COVER`, `BACKGROUND`,
  `COLLECTION_IMAGE`), status, source, verified type, sizes and dimensions. Rows are referenced,
  not unique per slot: a published and a draft cover can both exist. Keys come from ids only:
  `collections/{cid}/{cover|background|collection-image}/{imageId}/{original|thumbnail.webp|preview.webp|large.webp}`.
  Renditions per slot: cover 480 + 1600, background 480 + 1600 + 2400, collection image 480.
- **`Collection.imageId`:** «Картинка колекції», the owner's own image for the dashboard and the
  share dialog; it is never in a guest response (tested over every guest body).
- **Same-collection references** use composite keys `(id, collectionId)` with `ON DELETE NO
  ACTION`, so a version or a collection can never point at another collection's image, and
  deleting a collection still cascades in one statement.
- **The image slot of a reference is enforced by the application, not the database.** Every write
  takes the row's slot, the upload's purpose and the reference column from one `ImageTarget`, so
  a cover column only ever points at a `COVER` image (unit and integration tests). A generated
  column plus a three-column foreign key would enforce it in PostgreSQL; that was judged not worth
  the schema weight (review M4).

### Editing: draft, publish, reset and revisions (PR I)

- Everything in the editor, cover and welcome included, reaches guests only on «Зберегти»
  [D1]. `PUT …/guest-page/draft` saves the whole working copy (template, settings, welcome);
  `POST …/publish {revision}` copies the draft over the published version and deletes it;
  `DELETE …/draft` resets. Draft images change through their own routes.
- **Optimistic concurrency.** Revisions come from a per-collection counter
  (`Collection.lastPageRevision`): a new draft and every save take the next number, and the
  published version keeps the revision it was published at, so a revision names one draft state
  for the life of the collection. A save must name the draft's current revision, else
  `409 GUEST_PAGE_DRAFT_CONFLICT`; `baseRevision: null` means "no draft yet" and is also accepted
  while the draft has never been saved (`savedAt IS NULL`: an image change created it, so it holds
  only what was published). A publish names the draft's revision; without a draft it is `200`
  only for the published revision (a repeat), else `409`. Image changes never bump the revision
  (they do not conflict with autosave); changes through the slice 8a routes do (review I1, I2, M2).
- **Locks.** Every write locks the collection row first, then the draft row (lock order: owner →
  collection → draft row), so saves, publishes, resets and image changes of one collection run one
  at a time. The editor's `GET` is a single repeatable-read read and never writes.

### Image lifecycle: references and garbage collection (PR I)

- An image row lives while a guest page version or the collection references it. The transaction
  that drops the last reference (a replaced image, a publish that supersedes the old published
  images, a reset, a removal) deletes the row in the same transaction, so usage drops at once, and
  queues `collection-image.purge` for its prefix. The purge job skips a row that still exists.
- Usage counts every image of every slot (original and renditions) plus open upload
  reservations. The upload flow is the guest one (ADR 0008 addenda), with `purpose` = slot and
  `imageTarget` fixed at initiation.
- The hourly sweep marks `FAILED` an image still `PENDING` an hour after it was set with no
  rendition job left.

### Expand and contract

- **PR I (expand):** the migration copies every `CollectionCover` into a `COVER` image with the
  same id (its keys stay valid) and every collection's welcome and cover into a published
  `classic` v1 version. The slice 8a cover routes and `PATCH welcomeMessage` keep their contract as
  a "publish now" adapter (they change the published version and the draft's, and move the draft
  to a new revision), so the old «Гостьова сторінка» tab works until PR J. The slice 8a job names
  stay served by the new handlers.
- **PR J** removes the adapter routes with the old tab. **PR L (contract)** was planned to drop
  `CollectionCover`, `CoverStatus`, `CoverSource`, `Collection.welcomeMessage` with its CHECK, the
  legacy job names, `Collection.cover` in the contract and the `LEGACY_COVER` upload target.
- **Contraction done (PR L, 2026-10-05).** The migration `20261005130030_drop_slice_8a_cover`
  drops the table, both enums, the column and its CHECK. Before anything is dropped, it checks
  that the backfill covered the database and refuses otherwise, leaving it untouched:
  - every collection has a published version;
  - every cover that still has an image was copied with its id, collection and slot;
  - nothing wrote the old table or column after PR I's migration started (`_prisma_migrations`);
  - no `media.cover-derivatives` or `cover.purge` job is still waiting.

  The worker and the job registry no longer know the two slice 8a names, and the collection DTO
  no longer carries `cover`. **`LEGACY_COVER` stays:** every cover upload from before PR I keeps
  it, because upload rows live as long as their collection. Dropping the value would mean
  relabelling those rows with a target they never had. The value is never written and costs
  nothing.
- **«Картинка колекції» (PR L).** The dashboard card and the share dialog show
  `Collection.image` (its 480 px thumbnail), else the initials, and never the guest page's cover
  (owner 2026-10-05). It is set, picked from frames or removed in «Параметри колекції».
  Guests never get it.
- **Deploy (PR I):** the worker is suspended while the API migrates, then deployed before the web
  (runbook: `docs/deployment/staging.md`, release notes).

## Alternatives considered

- **Templates inside apps/web.** Simpler wiring, but nothing would stop a template from reaching
  into routing, queries or i18n, and the API could not validate with the same definitions.
- **Themes as CSS variables only.** Cannot express six different layouts.
- **Reject low-contrast choices** (the API refuses an accent under 4.5:1). Would make Абрикос,
  Лайм and Електрик unusable on every light template.
- **Fonts from Google at runtime.** Contradicts ADR 0015 (privacy, availability, build failures).
- **One font for headings and body.** Display faces at 15–17px body sizes hurt reading on phones.
- **One versions table with history.** More than published plus draft is out of scope; two
  states with a unique key keep "what guests see" a single row.
- **Covers and backgrounds as columns of the version** (no image table). Reference counting would
  then live in application code across columns and the collection image; one image table with
  explicit references and one collector is simpler to reason about.
- **Per-draft revisions starting at 1.** Rejected after review: a draft created after a publish or
  a reset reused numbers an old tab still held (review I1).
- **An inline preview instead of an iframe.** Viewport units and media queries would answer to
  the admin's window, not the previewed device, and template CSS would leak into the admin.

## Consequences

- One more workspace package to build, lint and test; its Storybook runs in CI with the others.
- Adding a template is a folder, two registry lines, messages and stories
  (`apps/templates/README.md`).
- The six templates (PR K): `classic` T1 «Класика», `fullscreen` T2 «На весь екран»,
  `journal` T3 «Журнал», `postcard` T4 «Листівка», `party` T5 «Вечірка», `minimal` T6
  «Мінімалізм»; their definitions and locks are DESIGN-SYSTEM.md §13. The locks of T3, T4 and T6
  are a proposal the owner confirms at the PR K review. T4 rotates its frames (ADR 0015 amendment).
- Guest page weight after PR K, first view of a contributing link at 390×844 (production build,
  Playwright with 1.6 Mbit/s, 150 ms latency and 4× CPU throttling, a fresh cache; not Lighthouse):
  about 530–610 KB transferred, of which fonts 69 KB (classic: Geologica and Geist Mono) to 151 KB
  (party: plus Unbounded and Manrope); LCP 3.1–3.3 s. Each template loads only the families it
  uses.
- Guest page weight after PR H, first view of a contributing link at 390px (production build,
  transferred bytes): JavaScript 355 415 → 360 509 B (+5.1 KB for the core, the root and
  classic), CSS 18 945 → 20 328 B (+1.4 KB, mostly the `@font-face` declarations), fonts unchanged
  at 70 048 B (only Geologica and Geist Mono load), the document 17 047 → 16 356 B.
- `apps/web`'s tsconfig allows `.ts` import specifiers (`allowImportingTsExtensions`; it never
  emits), because it type-checks the templates' sources.

## Addendum 2026-10-16: two views on phones and tablets, uploads in a sheet

Status: accepted (owner, billing M4 remarks round).

**Context.** On phones the guest page put the actions, the guest's frames, everyone's frames and
the upload progress on one long screen; the owner found it overcrowded («перенасичення контенту,
тексту, кнопок»). On a computer the page looked fine.

**Decision.**
- The contract gains `model.view: 'add' | 'frames'` (replacing `model.phase`) and `slots.tabs`,
  the app's «Додати» / «Кадри» switch (`apps/web/src/guest/view-tabs.tsx`; `null` on a view-only
  link). A template places the tabs under its bar in a `.tpl-view-tabs` wrapper and spreads
  `viewRegionProps('add')` on its intro (cover, title, welcome, count, actions; a
  `display: contents` `.tpl-region` wrapper where the intro is several elements) and
  `viewRegionProps('frames')` on its sections.
- Below 1024px the shared stylesheet shows one region by `data-view`; from 1024px both show in
  the template's own layout and the tabs are hidden: the desktop layouts are unchanged.
- The phone-only «after an upload» modes (T3's compact title and sticky action bar, T4's strip
  and sticky stamps) are gone: the tabs replace them. T2's glass action bar and action card belong
  to the intro.
- Uploads run in the app's own sheet («Завантаження», `upload-sheet.tsx`) on every width, opened
  by the pick and folded into a pill at the bottom; `actions.note` is no longer used by the app.
  «Ваші кадри» lists this visit's uploads from the server at once, so a video shows the worker's
  poster as soon as it exists (the list polls), not a type tile until a reload.
- The editor's preview gains «Екран» («Додати» / «Кадри») beside «Доступ» and «Вміст»; «Вміст:
  Завантаження» draws the sheet over the page.

**Alternatives considered.** Tabs at every width (rejected by the owner: the desktop layout was
fine); a separate route for the frames (a reload and a lost upload state for no gain); keeping one
screen with the batch moved into a sheet only (the actions and both grids still crowd a phone).

**Consequences.** Six templates gained a few lines each, no new dependency. The guest's own
frames are no longer hidden while a batch is on screen; the sheet shows the batch instead.
