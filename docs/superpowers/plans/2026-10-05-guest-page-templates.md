# Stepler Slice 8b: Guest-Page Templates and Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin gives the guest page one of six ready-made templates (T1 «Класика», T2 «На весь екран», T3 «Журнал», T4 «Листівка», T5 «Вечірка», T6 «Мінімалізм») and tunes it with bounded tweaks: cover, welcome, background, accent, heading font, cover placement, alignment and corners. Editing happens in the «Гостьова сторінка» tab with a live preview. Changes are a draft that guests see only after «Зберегти». The page stays readable (≥ 4.5:1 by construction) and mobile-first whatever the admin picks. Separately, an admin-only «Картинка колекції» replaces the cover on the dashboard card.

**Architecture:**
- **`apps/templates` (`@stepler/templates`)** is a new workspace package. It has two entry points:
  - `./core` is pure TypeScript, built to `dist` like `@stepler/contracts`. It holds template definitions (defaults, allowed options, locks, palette, `migrate`), WCAG contrast, token derivation, `resolveTheme` and `applyTemplate`, plus the font registry. The API validates with it and web derives tokens with it.
  - `./react` is TSX source, transpiled by Next like `@stepler/ui`. It holds one `Layout` and one `Thumbnail` per template, and `GuestTemplateRoot`, which scopes CSS variables under `[data-template=…]`.
  - Each template is a folder. Its own Storybook (`pnpm templates:dev`) renders every template against fixtures.
  - Templates get a typed `GuestPageModel`, an actions model (labels and callbacks) and ReactNode slots. Data fetching, the uploader, the viewer, the name prompt, the wish composer, the legal notice and the language switch all stay in `apps/web`.
- **API (NestJS):**
  - `CollectionCover` generalizes into `CollectionImage`, with a `slot` of `COVER | BACKGROUND | COLLECTION_IMAGE`. Rows are referenced, not unique per slot.
  - A new `GuestPageVersion` holds one `PUBLISHED` row and at most one `DRAFT` row per collection. Each row has `templateId`, `templateVersion`, validated `settings jsonb`, `welcomeMessage`, `coverImageId` and `backgroundImageId`. The draft carries a `revision` for optimistic concurrency.
  - `Collection.imageId` points at the admin-only image.
  - An image no row references is deleted in the same transaction and purged by the worker.
  - Guests get only the published version, inside `GuestContext.page`.
- **Web:**
  - The guest page renders the published template client-side after the session exchange, as today ([C3]).
  - The editor tab has a settings panel on the left and an iframe live preview on the right. The iframe is a same-origin admin route that gets the draft by `postMessage`. On phones the preview is a centred scaled card, and the settings open in a bottom sheet behind «Налаштувати».
  - The draft autosaves to the server. «Зберегти» publishes it and «Скинути зміни» deletes it.

**Tech Stack:**
- As slice 8a: NestJS 12 ESM, Prisma 7, Zod 4 contracts, Next.js 16 + next-intl, TanStack Query 5, React Hook Form, Tailwind 4 + shadcn/Radix, Storybook 10 + Vitest browser + axe, Playwright, pg-boss, and sharp + libheif in the worker.
- **No new npm dependency.** The Slider comes from the existing `radix-ui` package. Fonts are committed woff2 files built with fontTools, as in ADR 0015.

**Spec:**
- **Owner decisions 2026-10-04/05** (the brief for this plan, and the memory note `guest-page-templates`): templates plus bounded tweaks, six templates that differ by layout, `apps/templates` as a workspace package, the editor with live preview and draft/save/reset, the tweak list, locks with visible reasons, accent reset on template switch, T2 = Manrope + apricot, and «Картинка колекції» admin-only.
- **Design source:** the Claude Design canvas https://claude.ai/artifact/Yb2spDGP6qMpj7zrutxNzJ. Artboards: T1–T6 phone and desktop, `E-editor-desktop` and `E-editor-phone`. Their values are condensed in Appendix A and Appendix B. Accepted designer deviations:
  - T3's first frame is 4:3 on phones.
  - T4 uses polaroids.
  - T2's sheet is always dark.
  - T5 is dark-only.
  - T6 has a solid background only.
- **Repo docs:**
  - `docs/product/PRODUCT.md` §5.3–§5.4, §6.2 and §24.3;
  - `docs/architecture/mvp-architecture-spec.md` §3, §4, §7.2, §8, §9, §10.6–§10.7, §11 and §13.2;
  - ADRs 0001, 0003, 0005, 0008 (addenda), 0009, 0011, 0015 and 0016 (legal; the guest notice);
  - `docs/design/DESIGN-SYSTEM.md` §2, §3, §6.1, §6.6, §7 and §9;
  - plans `2026-10-04-collection-appearance.md` (A1–A10, conventions) and `2026-10-03-phase-4-guest-content.md` (C1–C20).

## Prerequisites

- **Merged into `dev`:**
  - `feat/phase-4-legal-pages` and `feat/phase-4-legal-acceptance`, which bring `GuestLegalNotice`, `SiteFooter` with legal links and ADR 0016;
  - `fix/tab-names`, with the labels «Гостьова сторінка» and «Параметри колекції».
- **Owner answers** to decisions **[D1]–[D5]**: all recommendations confirmed 2026-10-05. The tasks are written against the recommendations. A different answer changes only the steps tagged with that id.
- **Branch flow:** each PR is cut from the then-current `dev` and opened against `dev` (rule 15). Nothing here touches `apps/*/.env`, the owner's dev servers (3000/4010) or `stage`/`main`.
- **Artboard copies:** the local artboard copies live in a session scratchpad. Task 1 copies them into the repo before anything else relies on them.

## Decisions for the owner (recommendation first)

1. **[D1] Cover and welcome are part of the draft.**
   - Everything in the editor, cover and welcome included, reaches guests only on «Зберегти». The viewer's «Зробити обкладинкою» also sets the *draft* cover, and its toast offers «Відкрити гостьову сторінку».
   - Why: one save button with half the page already live would contradict the status line «Чернетка — гості бачать попередню версію». The background image needs reference-counted images anyway, so the cover costs one more column.
   - Alternative: cover and welcome stay immediate, as in slice 8a. That keeps `PATCH welcomeMessage` and the cover routes, saves about half a task, and the editor shows «Обкладинка й привітання змінюються одразу».
2. **[D2] The guest page renders client-side after the session exchange (as today), not server-side.**
   - Today the guest page has no server-side session: [C3]'s cookie is path-scoped and the resolve rate limit counts the client IP. The published page therefore arrives inside `GuestContext.page` in the same call.
   - The loading skeleton is neutral (no themed background), so a dark template does not flash a light page.
   - Template components are isomorphic (no hooks, no `'use client'`), so a later SSR path changes nothing in `apps/templates`.
   - Alternative: a new public `GET /guest/links/{token}/page` fetched by the Next server. That needs trusted client-IP forwarding from web to API and amends ADR 0007.
3. **[D3] Contrast is auto-adjusted, never rejected.**
   - The admin's accent is kept as the *fill* (buttons, glows, quote marks).
   - Every text token is derived to reach ≥ 4.5:1 against every surface it can sit on:
     - the label on the accent is ink `#141614` or white, whichever is better, with pure black or white as a last resort, which mathematically guarantees ≥ 4.58;
     - accent-coloured text (links, the T3 outline label) is the accent mixed toward black or white until it reaches 4.5:1.
   - Over an image, the minimum veil or scrim is computed so that a pure-white or pure-black image still gives 4.5:1. The dimming slider cannot go below it.
   - The API recomputes all of this with the same function. Its `422 THEME_CONTRAST_TOO_LOW` is only a safety net against a broken template definition.
   - Why: rejecting below 4.5:1 would make Абрикос, Лайм and Електрик unusable on every light template (1.2–3.7:1 on `#F0F1EE`).
   - Alternative: the API rejects any accent below 4.5:1 against the template background, and the editor disables those swatches with the reason.
4. **[D4] The font tweak sets the heading font. Body text stays in the template's body face.**
   - Body faces: Geologica for T1, Manrope for T2 and T5, Lora for T3, Nunito for T4, Golos Text for T6.
   - The editor summary reads «Заголовки — X, текст — Y», as the E-editor artboard does for T5.
   - Why: Unbounded, Cormorant, Comfortaa or Montserrat Alternates in 15–17 px body text hurts readability on phones.
   - Alternative: one font for everything.
5. **[D5] Design-source conflicts**, resolved as below; confirmed by the owner 2026-10-05.
   - **T2:** Manrope 800 headings with accent `#F2A65A` (owner, matching the editor), not the artboard's Montserrat Alternates with `#E9C17A`.
   - **T5:** default accent Лайм `#C5F04A` (editor; it is a preset) instead of the artboard's violet `#A56BFF`. The glow derives from the accent.
   - **Fixed scheme per template:** T2 and T5 are dark, the rest light. The guest page stops following the visitor's system dark mode, because a template with an admin-chosen background cannot be auto-inverted.
   - **T1 in PR H is the current page ported as is** (no visual change, still light/dark by system). It becomes the artboard's T1 in PR K.

## Settled by this plan (low risk; override if you disagree)

- **Package boundary.**
  - `apps/templates` may import only `@stepler/contracts`, `@stepler/ui`, `react`, `lucide-react` (the icon set `@stepler/ui` already uses; added in PR H for the templates' own buttons) and `zod`. `src/core` may not import `react` or `@stepler/ui`. Lint enforces both (`no-restricted-imports`).
  - Templates contain no literal UI strings: names, lock reasons and copy come from `apps/web/messages` or the model (ADR 0011). Fixtures carry their own strings.
  - Template ids are stable slugs: `classic`, `fullscreen`, `journal`, `postcard`, `party`, `minimal`.
- **Theme vocabulary lives in contracts.** `themeSettingsSchema`, `FONT_IDS` and `ACCENT_PRESETS` are API contract, so they sit in `@stepler/contracts`. The per-template refinement (allowed values, locks) lives in `@stepler/templates/core`.
- **Live preview is an iframe, not inline.** The route is `/preview/collections/[id]`: same origin, admin session, `X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'` and noindex. Why an iframe:
  - templates use viewport media queries, `svh` (T2's full-screen hero) and fixed sticky bars, and only a real 390/1440 viewport renders those faithfully;
  - template CSS and `@font-face` are isolated from the admin shell.
  - The preview never calls guest endpoints and never creates a guest session. It reads admin endpoints only (the collection, the editor state, the first 12 frames) and renders inert slots.
- **Frames keep one implementation.** Web's `GuestFrames` and `@stepler/ui` `Frame`/`FrameGrid` render every tile. Templates restyle them only through scoped CSS on the stable `data-slot` hooks: `frame-grid`, `frame`, `frame-picture`, `frame-number`, `guest-own-frames`, `guest-all-frames`. That covers T3's large first frame, T4's polaroids and T5's bento spans.
- **Actions are data, not slots.** Templates render their own buttons (T4 stamps, T2 glass bar, T6 underlined text button) from `{ label, icon, onSelect }`. `onSelect` is called synchronously in the click handler, so iOS still opens the file picker.
- **Dialogs keep the Stepler look.** The name prompt, wish composer and viewer portal to `body`, outside the template root, and follow the system theme as today.
- **Background image derivatives:** thumbnail 480 (editor), preview 1600 (phones) and large 2400 (≥ 1024 px), all WebP. There is no extra 64 px placeholder: the template background colour plus the veil shows while the image loads. The collection image gets a thumbnail 480 only.
- **Storybook for `templates:dev`,** not a custom Vite gallery. It uses the same setup as `packages/ui` (axe, Vitest browser, viewports) on port 6007.
- **Template switch.** `applyTemplate(next, current)` resets accent, background and heading font to the new template's defaults. It keeps alignment, corners and cover placement when the new template allows them, and otherwise uses its defaults. Cover, background image and welcome are kept.
- **Locks are shown as text.** An option the template does not allow stays in place, `aria-disabled` and focusable, with a dashed border. One visible helper line under its group gives the template's reason (`guestPage.locks.{templateId}.{setting}`), linked by `aria-describedby`. This deliberately replaces the artboard's hover-only tooltip «Цей шаблон не підтримує».
- **Expand/contract migration.**
  - PR I creates `CollectionImage` and `GuestPageVersion`, copies covers (same ids, so the storage keys stay valid) and welcome texts, and stops using `CollectionCover` and `Collection.welcomeMessage`.
  - The legacy cover routes and `PATCH welcomeMessage` keep working in PR I as "publish now" adapters, so the slice 8a tab still works. PR J removes them.
  - PR L drops the old table, column, enums and job names.
- **No new environment variable.**
  - The admin image routes keep the existing `LIMIT_ADMIN_COVER_CALLS_PER_*` throttlers.
  - Draft autosave is debounced to 800 ms with at most one request in flight, and has no throttler of its own.
  - The cap on open uploads (3 per collection per purpose) stays a named constant.
- **Archived collections:** the editor and the collection image are read-only, and every mutation returns `409 COLLECTION_ARCHIVED` (as [A6]).

## Pre-implementation gate (rule 19)

- **Similar code:**
  - API: `CoversService`, `CoverUploadsService`, `UploadInspector`, `CoverDerivativesHandler`, `PurgeCoverHandler`, `CoverUrls`, `UsageService`, `guest-sessions.service.ts#buildContext`.
  - Web: `guest-page.tsx`, `guest-cover.tsx`, `own-frames.tsx`, `appearance/*` (cover card, picker, uploads), `collection-cover-image.tsx`, `fonts.ts`.
  - Packages: `packages/ui/.storybook`, `packages/ui/src/fonts`.
- **Data:**
  - new: `CollectionImage`, `GuestPageVersion`, `Collection.imageId`, enums `ImageSlot`, `ImageStatus`, `ImageSource`, `GuestPageVersionState`, and `UploadPurpose += BACKGROUND, COLLECTION_IMAGE`;
  - later dropped: `CollectionCover`, `Collection.welcomeMessage`, `CoverStatus`, `CoverSource`.
- **API:**
  - `GET /collections/{id}/guest-page`;
  - `PUT …/guest-page/draft`;
  - `DELETE …/guest-page/draft`;
  - `POST …/guest-page/publish`;
  - `POST|DELETE …/guest-page/draft/{cover|background}…` (uploads, parts, complete, cancel, from-frame, remove);
  - `POST|DELETE /collections/{id}/image…` (the same six);
  - `GuestContext.page`, `Collection.image`.
- **Permissions:**
  - owner only (`ownerId = principal.userId AND status <> 'DELETING'`, else `404`);
  - guests read the published version only;
  - the collection image is never in a guest DTO;
  - the operator has no role here.
- **Third parties:** R2/S3 only, as in slice 8a: multipart, `CopyObject`, presigned GET. Fonts are committed, with no runtime Google request.
- **Retry, partial failure, deletion, expiry, mobile:** see Review Focus.
- **Tests:**
  - templates core unit tests (contrast, tokens, resolve, apply, exhaustive palette checks);
  - Storybook play + axe at 360/390/768/1440 per template;
  - API integration (authorization, draft isolation, validation per template, revision, image GC, quota, migration backfill);
  - worker tests;
  - web unit tests (editor reducer, preview protocol);
  - Playwright (editor journeys, the template matrix).
- **Scope:** MVP by owner decision 2026-10-04/05 (PRODUCT §24.3 "themes, custom colours, typography" move in). Still out of scope: a free builder, custom CSS, custom fonts, per-guest-link themes, upload instructions, and more than the six templates.

## Global Constraints

- **Branches:** each from `dev`, PR to `dev`, merge commit, one commit per task, never pushed directly to `dev`, `stage` or `main`.
  - PR H `feat/templates-foundation`
  - PR I `feat/templates-api`
  - PR J `feat/templates-editor`
  - PR K `feat/templates-t2-t6`
  - PR L `feat/collection-image`
- **Pace over polish:** per-task review raises only correctness, security, data-integrity and accessibility blockers. Minors are batched into each PR's last task.
- **Authorization:** admin routes reach rows only through `collection.ownerId = principal.userId AND status <> 'DELETING'`; otherwise `404 NOT_FOUND`. Guests read only `PUBLISHED`. Every unsafe method keeps the CSRF origin check.
- **Contracts:** strict Zod objects, no `.transform()`, no `z.date()`.
  - Hex colours are `^#[0-9A-F]{6}$`; the web normalizes to uppercase before sending.
  - New error codes are appended to `ERROR_CODES` with uk/en messages: `GUEST_PAGE_DRAFT_CONFLICT` (409) and `THEME_CONTRAST_TOO_LOW` (422).
  - Invalid settings for a template → `400 VALIDATION_FAILED`, with `errors[].path` starting `['settings', …]`.
- **Database:** `prisma migrate dev --create-only`, with named raw-SQL CHECKs appended. `pnpm db:check` passes. Ids are `uuidv7()`. Bytes are `bigint`. Same-collection references use composite FKs `ON DELETE NO ACTION` (the `GuestSession` precedent, spec §7.2).
- **Storage:** keys come from ids only: `collections/{cid}/{cover|background|collection-image}/{imageId}/{original|thumbnail.webp|preview.webp|large.webp}`. Existing cover keys stay valid. No file bytes pass through Node except in the worker.
- **Templates:**
  - Every selector in a template stylesheet starts with `[data-template="<id>"]` (a test checks this).
  - No `vh`/`dvh`: use `svh`, which is correct inside the iframe.
  - Motion is wrapped in `@media (prefers-reduced-motion: no-preference)`.
  - Touch targets are ≥ 44 px, and nothing critical is hover-only.
  - When `actions !== null`, `slots.legalNotice` renders directly after the actions, in the sticky bar too.
  - `slots.footer` always renders. On phones, a sticky action bar leaves the footer reachable.
  - The page never scrolls horizontally at 320/360/390.
- **Fonts:** only committed woff2 (latin + cyrillic, OFL) loaded through `next/font/local` with `preload: false`, except Geologica as today. No request to Google Fonts at build, test or runtime (ADR 0015).
- **Web:**
  - TanStack Query for server state; the editor's working copy stays local (`useReducer`).
  - No literal UI strings (uk default, en parity).
  - Destructive actions go through `ConfirmDialog`.
  - No horizontal scroll at 320/360/390.
- **Design pass (every UI task):**
  - Before the task, apply the frontend-design, ui-ux-pro-max, web-design-guidelines and responsive-design skills.
  - Write the decisions as a 5–10 line header comment in the main file.
  - Afterwards, take screenshots at 360×780, 390×844 and 1440×900 (and 768×1024 for templates), next to the matching artboard. Save them to `$TMPDIR/stepler-templates-screens/` (not committed) for the owner's review before the PR.
- **Never** start or stop the owner's dev servers, and never touch `apps/*/.env`. `pnpm e2e` uses 3100/4100.

## Review Focus

1. **Draft leakage and image lifecycle.**
   - Case: the admin uploads a new background and switches to T5 in the draft, without saving. A guest reloads, then the admin presses «Скинути зміни».
   - Expected: the guest still sees the published T1 and cover. The context carries no draft URL, template or setting. Reset deletes only images that no version references; the published cover survives. After «Зберегти», the old published images that are now unreferenced are purged.
   - Tests in Task 9 (API) and Task 16 (journey).
2. **Two tabs, one draft.**
   - Case: tab A and tab B edit the same collection. Tab B autosaves after tab A did; tab A uploads a cover while its own autosave is in flight.
   - Expected: tab B gets `409 GUEST_PAGE_DRAFT_CONFLICT` and the editor offers «Показати останню версію». No silent overwrite. Image operations never bump the revision and never conflict with autosave.
   - Tests in Task 9 and Task 13.
3. **Crafted settings and template edge cases.**
   - Cases: a request with T2 + `coverPlacement: 'top'`, T6 + `background.kind: 'image'`, an accent `'red'`, an unknown `templateId`, `dim` below the template minimum; a database row with a removed template or an older `templateVersion`; T2 with no cover; T6 with a cover.
   - Expected: requests → `400 VALIDATION_FAILED`. The stored rows resolve to `classic` defaults, or migrate. T2 renders a dark hero with the title. T6 shows the cover only when the placement asks for it.
   - Tests in Tasks 1, 9 and 18–22.
4. **Worst-case readability.**
   - Cases: Лайм on T1 white, `#777777` as a custom accent, a pure-white and a pure-black background image at the minimum dimming, a 100-character title of one unbroken word, a 160-character welcome, at 320 px.
   - Expected: every text token ≥ 4.5:1 (computed), no horizontal overflow, axe clean.
   - Tests in Task 1 (exhaustive and fuzz), Task 3 and Task 23.
5. **Phones.**
   - Cases: in every template, the sticky action bar never covers the footer or legal links; the primary action is in the first viewport; the file picker opens from the template's own button; T5's animations stop under reduced motion; the phone editor's sheet and preview fit 360×640.
   - Tests in Task 23 (matrix) and Task 16 (editor at phone width).

---

## PR H — `apps/templates` foundation, fonts, contrast and T1 as today

### Task 1: Theme vocabulary (contracts) and templates core

**Files:**
- Create `docs/design/guest-templates/`: copy the 14 artboards `T{1..6}-{phone,desktop}.dc.html` and `E-editor-{desktop,phone}.dc.html` from the session scratchpad, plus a `README.md` that links the canvas URL and lists the Appendix A deviations.
- Create in `packages/contracts/src/`: `guest-page.ts` and `guest-page.test.ts`. Modify `index.ts`.
- Create in `apps/templates/`:
  - package files: `package.json`, `tsconfig.json`, `tsconfig.build.json` (`src/core` + `src/templates/*/definition.ts` only), `eslint.config.js`, `vitest.config.ts`;
  - in `src/core/`: `contrast.ts`, `tokens.ts`, `definition.ts`, `resolve.ts`, `apply-template.ts`, `registry.ts`, `index.ts`, with tests `contrast.test.ts`, `tokens.test.ts`, `resolve.test.ts`, `apply-template.test.ts`, `registry.test.ts`, `palettes.test.ts`;
  - `src/templates/classic/definition.ts`.
- Modify `pnpm-workspace.yaml` only if `apps/*` does not already cover it (it does).

**Interfaces — produces:**
- **contracts:**
  - `FONT_IDS = ['geologica','manrope','unbounded','playfair-display','cormorant','lora','nunito','rubik','montserrat-alternates','comfortaa','pt-serif','golos-text'] as const`; `FontId`.
  - `ACCENT_PRESETS = [{id:'pencil',hex:'#B83E26'},{id:'apricot',hex:'#F2A65A'},{id:'plum',hex:'#5A4A8C'},{id:'emerald',hex:'#2C7350'},{id:'electric',hex:'#8B5CF6'},{id:'lime',hex:'#C5F04A'}] as const`.
  - `hexColorSchema`; `templateIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)`.
  - `themeSettingsSchema` (strict):

    ```ts
    {
      background: discriminatedUnion('kind', [
        { kind: 'solid', color: hex },
        { kind: 'gradient', preset: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/) },
        { kind: 'image', dim: int 0..90 },
      ]),
      accent: hex,
      headingFont: z.enum(FONT_IDS),
      coverPlacement: z.enum(['top', 'full', 'side', 'none']),
      align: z.enum(['start', 'center']),
      corners: z.enum(['sharp', 'soft', 'round']),
    }
    ```

    with types `ThemeSettings`, `CoverPlacement`, `Align`, `Corners`, `BackgroundKind`.
- **templates core:**
  - `interface TemplateDefinition`:

    ```ts
    {
      id: string;
      version: number;
      scheme: 'light' | 'dark';
      bodyFont: FontId;
      defaults: ThemeSettings;
      options: {
        backgroundKinds: readonly BackgroundKind[];
        swatches: readonly Hex[];
        gradients: readonly { id: string; stops: readonly [Hex, Hex]; angle: number }[];
        imageDim: { min: number; max: number };
        backgroundImageSource: 'own' | 'cover';
        coverPlacements: readonly CoverPlacement[];
        aligns: readonly Align[];
        corners: readonly Corners[];
      };
      palette: {
        text: Hex;
        body: Hex;
        muted: Hex;
        surfaces: readonly Hex[];
        veil: Hex;
        onImageText: Hex;
      };
      migrate(fromVersion: number, settings: unknown): unknown;
    }
    ```

  - `isLocked(def, key): boolean` (one allowed value).
  - `settingsSchemaFor(def): z.ZodType<ThemeSettings>`: `themeSettingsSchema` plus a `superRefine` for membership in `options` and `dim ∈ imageDim`, with paths like `['background', 'color']`.
  - **contrast.ts:**
    - `relativeLuminance(hex)`, `contrastRatio(a, b)`;
    - `composite(color, alpha, base): Hex`;
    - `bestTextOn(fill, candidates = ['#141614', '#FFFFFF']): Hex`, which falls back to `#000000`/`#FFFFFF` so the result is always ≥ 4.5;
    - `readableOn(color, backgrounds: readonly Hex[], min = 4.5): Hex`, which mixes toward black or white in 2 % sRGB steps (direction by the backgrounds' mean luminance) and returns the first mix that passes against all backgrounds;
    - `minVeil(text: Hex, veil: Hex): number`: the smallest alpha in 0.01 steps such that `contrastRatio(text, composite(veil, α, '#FFFFFF'))` and `…'#000000'` are both ≥ 4.5;
    - `MIN_RATIO = 4.5`.
  - **tokens.ts:** `themeTokens(def, settings): ThemeTokens`, a `Record<\`--tpl-${string}\`, string>` with:
    - `--tpl-bg`, `--tpl-bg-image-veil` (alpha);
    - `--tpl-text`, `--tpl-body`, `--tpl-muted` (each `readableOn(palette.x, effectiveBackgrounds)`);
    - `--tpl-accent`, `--tpl-on-accent`, `--tpl-accent-text`, `--tpl-accent-soft` (22 % alpha), `--tpl-accent-glow` (55 %);
    - `--tpl-radius-tile|btn|card|bar` (Appendix B corners table);
    - `--tpl-align` (`start|center`);
    - `--tpl-gradient` (CSS `linear-gradient(...)` when the background is a gradient).
    - `effectiveBackgrounds`: the solid colour, both gradient stops, or for an image the two worst-case composites of the veil at `max(dim/100, minVeil(text, veil))`, plus `palette.surfaces`.
  - `accentContrast(def, settings): { ratio: number; level: 'good' | 'small-text' | 'merges'; direction: 'lighter' | 'darker' }`. The ratio is the accent against the template background. The levels are ≥ 4.5, ≥ 3 and below. Direction is `lighter` when the background luminance is below 0.2. The editor hint uses it.
  - `assertReadable(def, settings): void`. It throws `ContrastError` if any text token is below 4.5, which can only happen through a broken definition.
  - **resolve.ts:** `resolveTheme(templateId: string, templateVersion: number, settings: unknown): { def: TemplateDefinition; settings: ThemeSettings; fellBack: boolean }`.
    - An unknown id gives `classic` defaults with `fellBack: true`.
    - An older version runs `def.migrate` and then parses.
    - A failed parse gives `def.defaults` with `fellBack: true`.
    - It never throws.
  - **apply-template.ts:** `applyTemplate(next, current): ThemeSettings` (rules under "Settled").
  - **registry.ts:** `TEMPLATE_DEFINITIONS: readonly TemplateDefinition[]`, ordered as the editor shows them; `definitionOf(id): TemplateDefinition | undefined`; `DEFAULT_TEMPLATE_ID = 'classic'`.
- **`classic` v1:** Appendix A row T1, except that in PR H `scheme` is `'light'` while the port still follows the system theme [D5].

- [ ] **Step 1: Copy the artboards** into `docs/design/guest-templates/` and write its README.
- [ ] **Step 2: Failing tests.**
  - `themeSettingsSchema` rejects `accent: '#b83e26'` (lowercase), `'red'`, an extra key and `dim: 91`.
  - `contrastRatio('#FFFFFF','#000000') === 21`. `contrastRatio('#B83E26','#F0F1EE')` is ≈ 4.9 and `contrastRatio('#C5F04A','#F0F1EE')` ≈ 1.2 (±0.05, the editor artboard's table).
  - `bestTextOn` over 2 000 seeded random fills is always ≥ 4.5.
  - `readableOn('#C5F04A', ['#F0F1EE'])` ≥ 4.5 and darker.
  - `minVeil('#FFFFFF', '#000000')` is about 0.55 (±0.02), and over a white base the result passes.
  - `resolveTheme('gone', 1, {})` → classic defaults with `fellBack`. A fake definition v2 whose `migrate` renames a key upgrades a v1 object, and a garbage object falls back.
  - `applyTemplate(fullscreen, classicWithCenterSoft)` keeps `center`/`soft` and forces `full` and `image`.
  - **palettes.test.ts:** for every registered definition, every swatch, gradient, `dim ∈ {min, max}`, all six presets plus 200 seeded random accents, every corners value, and both aligns, `assertReadable` passes and `imageDim.min / 100 ≥ minVeil(palette.text, palette.veil)`.
  - **registry.test.ts:** ids are unique and match the folder names under `src/templates/`, read with `fs.readdirSync`.
- [ ] **Step 3:** `pnpm --filter @stepler/contracts test && pnpm --filter @stepler/templates test` → FAIL.
- [ ] **Step 4:** Implement.
  - `package.json` `exports` are:
    - `"./core"`: `{ types: "./dist/core/index.d.ts", import: "./dist/core/index.js" }`;
    - `"./react"`: `"./src/react/index.ts"`;
    - `"./styles.css"`: `"./src/styles.css"`;
    - `"./fonts/*"`: `"./fonts/*"`.
  - Scripts: `build`, `typecheck`, `lint`, `test`, `storybook`, `build-storybook`. Dependencies: `@stepler/contracts`, `zod`. React is a peer dependency.
  - eslint `no-restricted-imports`:
    - for `src/**`: `next`, `next/*`, `next-intl`, `@tanstack/*`, `@/*`, and any relative path that leaves the package;
    - for `src/core/**`: additionally `react` and `@stepler/ui/*`.
  - A test in `registry.test.ts` lints one fixture file per rule via the ESLint Node API and expects the errors.
- [ ] **Step 5:** Tests → PASS. `pnpm turbo run build typecheck lint --filter @stepler/templates --filter @stepler/contracts` → PASS.
- [ ] **Step 6:** Commit `feat(templates): theme vocabulary, template definitions, contrast and token derivation`.

### Task 2: Curated fonts (12 families, self-hosted)

**Files:**
- Create in `apps/templates/fonts/`:
  - `{id}.woff2` for the 12 `FONT_IDS`. Variable `wght` where upstream has it. `montserrat-alternates-{500,700}.woff2` and `pt-serif-{400,700}.woff2` are static.
  - `OFL-{Family}.txt` for each family.
  - `CREDITS.md`, with the upstream path in google/fonts, the commit hash and the size of each file.
  - `fonts.css`, the `@font-face` rules for Storybook.
- Create `apps/templates/scripts/build-fonts.sh`. It is not run in CI. It uses the ADR 0015 recipe: `fonttools varLib.instancer` pins extra axes, then `pyftsubset --unicodes=<latin+cyrillic as ADR 0015> --flavor=woff2 --layout-features+=kern,liga,tnum,pnum`, then a cmap check for `і ї є ґ ’ « » №`. The script fails if any is missing.
- Create `apps/templates/src/core/fonts.ts` with `fonts.test.ts`.
- Create `apps/web/src/guest/template-fonts.ts` with `template-fonts.test.ts`.
- Modify `apps/web/next.config.ts`: `transpilePackages += '@stepler/templates'`.

**Interfaces — produces:**
- `FONTS: Record<FontId, { family: string; files: readonly { file: string; weight: string; style: 'normal' }[]; fallback: 'sans-serif' | 'serif' }>`; `fontCssVar(id) = \`--font-tpl-${id}\``.
- **web:** `TEMPLATE_FONTS: Record<FontId, { variable: string; className: string }>`. These are 12 literal `localFont({ src: '../../../templates/fonts/…', variable: '--font-tpl-<id>', display: 'swap', preload: false })` calls, because next/font needs literals. Geologica reuses `packages/ui`'s file through its existing declaration and maps `--font-tpl-geologica` to `var(--font-geologica)`.
- **web:** `fontVariables(...ids: FontId[]): string`, the class list for the root.

- [ ] **Step 1: Failing tests.**
  - `fonts.test.ts`: every `FONT_IDS` entry has files, and each file exists on disk with size > 0 and < 160 KB.
  - `template-fonts.test.ts`: the keys of `TEMPLATE_FONTS` equal `FONT_IDS`.
- [ ] **Step 2:** Run the script locally with fontTools 4.60. Commit the outputs and record each size in `CREDITS.md`. Implement both maps.
- [ ] **Step 3:** Tests → PASS.
  - `pnpm --filter @stepler/web build` → PASS, with no network fetch (`NEXT_TELEMETRY_DISABLED=1`, offline is fine).
  - Record in the commit body the total woff2 bytes and the guest page's transfer for its first view with the default template. It must equal today's (only Geologica loads).
- [ ] **Step 4:** Commit `feat(templates): twelve curated Cyrillic fonts, self-hosted (OFL)`.

### Task 3: React contract, `classic` as today's page, Storybook gallery

**Files:**
- Create in `apps/templates/src/react/`: `model.ts`, `root.tsx`, `registry.ts`, `index.ts`.
- Create in `apps/templates/src/templates/classic/`: `layout.tsx`, `thumbnail.tsx`, `styles.css`, `classic.stories.tsx`, `index.ts`.
- Create `apps/templates/src/styles.css` (imports each template's css) and `apps/templates/src/styles.test.ts`.
- Create `apps/templates/src/fixtures/models.tsx`: fixture models and fake slots. Images use `samplePhoto` from `@stepler/ui` stories, copied as a fixture helper.
- Create `apps/templates/.storybook/main.ts` and `preview.tsx`, copied from `packages/ui` with port 6007. `preview` imports `@stepler/ui/styles.css`, `../src/styles.css` and `../fonts/fonts.css`.
- Create `apps/templates/README.md`: what a template is, the contract, and the **"Add a template" checklist** (folder, `definition.ts`, both registries, messages `templates.{id}.*`, stories, Appendix-style row in DESIGN-SYSTEM, screenshots).
- Modify the root `package.json` (`"templates:dev": "pnpm --filter @stepler/templates storybook"`), `README.md` (the runnable-tools table row) and `turbo.json` if `build-storybook` needs the package listed.

**Interfaces — produces:**
- `GuestPageModel`:

  ```ts
  {
    title: string;
    description: string | null;
    welcomeMessage: string | null;
    countsLabel: string | null;
    cover: TemplateImage | null;
    background: TemplateImage | null;
    phase: 'first-visit' | 'contributed';
  }
  ```

- `TemplateImage = { src: string; srcSet: string; sizes: string; width: number; height: number }`.
- `TemplateActions`:

  ```ts
  {
    primary: { label: string; icon: 'files' | 'text'; onSelect: () => void };
    secondary: { label: string; onSelect: () => void } | null;
    note: string | null;
  }
  ```

- `TemplateSlots = { brand: ReactNode; languageSwitch: ReactNode; legalNotice: ReactNode; footer: ReactNode; ownFrames: ReactNode | null; allFrames: ReactNode | null }`.
- `TemplateLayoutProps = { model: GuestPageModel; actions: TemplateActions | null; slots: TemplateSlots; settings: ThemeSettings; def: TemplateDefinition }`.
- `GuestTemplate = TemplateDefinition & { Layout: ComponentType<TemplateLayoutProps>; Thumbnail: ComponentType }`.
- `TEMPLATES: Record<string, GuestTemplate>`. A test asserts it has the same ids as `TEMPLATE_DEFINITIONS`.
- `GuestTemplateRoot` takes `templateId: string`, `templateVersion: number`, `settings: unknown`, `fontClassName: (heading: FontId, body: FontId) => string`, `model`, `actions: TemplateActions | null`, `slots` and `inert?: boolean`. It:
  - runs `resolveTheme`;
  - nulls `model.cover` when `coverPlacement === 'none'`;
  - nulls `model.background` unless the background is `image`; with `backgroundImageSource === 'cover'` the background is the cover;
  - renders `<div data-template={id} data-scheme={scheme} style={{ ...themeTokens(…), colorScheme: scheme }} className={fontClassName(heading, body)} inert={inert}>` around `<Layout/>`.
- `classic` v1 Layout:
  - **today's guest page markup moved verbatim** from `guest-page.tsx` `GuestCollection`, with the header sheet, `GuestCover` usage now `model.cover`, the welcome, the actions block and the phone dock (`UploadDock` from `@stepler/ui` with `actions.note`);
  - `slots.legalNotice` right after the actions, and `slots.footer` last;
  - the existing Stepler tokens (`bg-background`, …), so there is no visual change in PR H.
- `styles.test.ts`: every rule in every `src/templates/*/styles.css` has selectors starting with `[data-template="<folder>"]`. It parses with a 20-line regex walker, with no new dependency.

- [ ] **Step 1: Failing stories with play + axe.** For `classic`:
  - **fixtures:** `FirstVisit`, `Contributed`, `ViewOnly` (actions `null`, no `ownFrames`), `TextOnly` (primary `text`), `NoCover`, `LongTitle` (100 characters, one word), `LongWelcome` (160 characters);
  - **viewports:** 360, 390, 768, 1440 via `page.viewport()`;
  - **assertions:**
    - `document.documentElement.scrollWidth <= innerWidth`;
    - axe has no violations;
    - `[data-slot="guest-legal-notice"]` follows the primary action in DOM order when actions exist;
    - a `footer` exists;
    - the primary button is ≥ 44 px tall;
    - clicking it calls `onSelect` once.
- [ ] **Step 2:** `pnpm --filter @stepler/templates test` → FAIL → implement → PASS. `pnpm templates:dev` serves on 6007 (check it, then stop it). `pnpm --filter @stepler/templates build-storybook` → PASS.
- [ ] **Step 3:** Commit `feat(templates): template contract, classic template (today's page), templates:dev gallery`.

### Task 4: Guest page renders through the template (no visual change)

**Files:**
- Modify `apps/web/src/guest/guest-page.tsx`. `GuestCollection` builds the model, actions and slots and renders `GuestTemplateRoot` with `templateId: 'classic'`, `templateVersion: 1`, `settings: classic.defaults` (PR I swaps these for `context.page`).
- Create `apps/web/src/guest/template-model.ts` with `template-model.test.ts`. Create `apps/web/src/guest/template-slots.tsx`, which holds the frames sections with headings, `GuestNameLine`, `RefreshGallery`, `UploadBatch` inside `ownFrames`, the brand, the language switch, `GuestLegalNotice` and `SiteFooter`.
- Modify `apps/web/src/app/g/[token]/page.tsx`. It renders only `<GuestPage token>`, and `generateMetadata` keeps `robots: noindex` and the neutral title. The state pages and the loading skeleton keep `SiteHeader`, `SiteFooter` and the container, moved into `GuestPage`'s non-ready branch.
- Modify `apps/web/src/app/globals.css`: `@import '@stepler/templates/styles.css'`, and `@source '../../../templates/src'` for Tailwind class scanning.
- Modify `apps/web/src/guest/guest-cover.tsx`. It becomes `coverImage(context): TemplateImage | null` (preview `src`, `srcSet` of thumbnail 480w and preview 1600w).
- Create `docs/architecture/decisions/0017-guest-page-templates.md` (Status: Proposed; package boundary, contract, fonts, contrast, iframe preview; the storage parts are added in Task 11).

**Interfaces — produces:**
- `buildGuestPageModel(context: GuestContext, opts: { countsLabel: string | null; contributed: boolean }): GuestPageModel`.
- `buildGuestActions(permissions, labels, handlers, note): TemplateActions | null`, with the same rules as `primaryContribution`, `uploadLabelKey` and `acceptFor`.
- `phase = 'contributed'` when the own-frames query has at least one item or this visit added a file.

- [ ] **Step 1: Failing unit tests.**
  - `buildGuestActions`:
    - a view-only link gives `null`;
    - a text-only link gives a primary `text` with no secondary;
    - files plus text gives a primary `files` with a secondary;
    - the label switches to «Додати ще» after a batch.
  - `buildGuestPageModel` maps `welcomeMessage`, cover dimensions and `srcSet`.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Regression.**
  - `pnpm e2e` → all existing guest journeys green, unchanged (they assert today's DOM and copy).
  - Screenshots at 360/390/1440, light and dark, are identical to `dev`'s by eye; keep a before/after pair.
- [ ] **Step 4: Full verification:** `pnpm format:check && pnpm turbo run lint typecheck test build build-storybook && pnpm e2e`.
- [ ] **Step 5:** Commit `feat(web): the guest page renders through the template registry`; open PR H → `dev`.

---

## PR I — Images, theme storage and API

### Task 5: Contracts for the editor, images and the guest page

**Files:**
- Modify in `packages/contracts/src/`: `guest-page.ts` (+ test), `cover.ts`, `collections.ts`, `guest.ts`, `errors.ts`, `index.ts`.
- Modify `apps/web/messages/{uk,en}.json` (errors).

**Interfaces — produces:**
- `imageSlotParamSchema = z.enum(['cover', 'background'])`, the path segment.
- `adminImageSchema`: the slice 8a `collectionCoverSchema` shape plus `largeUrl: z.url().nullable()`. `collectionCoverSchema` stays as an alias until PR L.
- `guestImageSchema = guestCoverSchema.extend({ largeUrl: z.url().nullable() })`.
- `guestPageVersionSchema` (strict):

  ```ts
  {
    templateId: templateIdSchema;
    templateVersion: int ≥ 1;
    settings: themeSettingsSchema;
    welcomeMessage: z.string().nullable();
    cover: adminImageSchema.nullable();
    background: adminImageSchema.nullable();
    updatedAt: z.iso.datetime();
  }
  ```

- `guestPageEditorSchema = { published: guestPageVersionSchema, draft: guestPageVersionSchema.extend({ revision: int ≥ 1 }).nullable() }`.
- `saveGuestPageDraftRequestSchema = { baseRevision: int ≥ 1 | null, templateId, settings: themeSettingsSchema, welcomeMessage: collectionWelcomeMessageSchema.nullable() }`. `null` means there is no draft yet.
- `publishGuestPageRequestSchema = { revision: int ≥ 1 }`.
- `guestPageSchema` (the guest side; strict): `{ templateId, templateVersion, settings, welcomeMessage, cover: guestImageSchema.nullable(), background: guestImageSchema.nullable() }`.
- `guestContextSchema.collection` loses `welcomeMessage` and `cover`, and the context gains `page: guestPageSchema`.
- `collectionSchema` gains `image: adminImageSchema.nullable()`. `cover` stays until PR L (built from the *published* cover).
- `ERROR_CODES` gains:
  - `GUEST_PAGE_DRAFT_CONFLICT` (409). uk «Цю сторінку щойно змінили в іншій вкладці.» / en "This page was just changed in another tab."
  - `THEME_CONTRAST_TOO_LOW` (422). uk «Ці кольори погано читаються разом.» / en "These colours are hard to read together."

- [ ] **Step 1: Failing tests.**
  - `guestPageSchema` rejects a `draft` key, a `revision` key and a `background.status`.
  - `guestContextSchema` rejects `collection.cover`.
  - `saveGuestPageDraftRequestSchema` accepts `baseRevision: null`, and rejects `welcomeMessage` with 161 code points.
- [ ] **Step 2:** FAIL → implement → PASS. Update the web compile errors only where they are type-level (the guest page reads `context.page` from Task 10).
- [ ] **Step 3:** Commit `feat(contracts): guest page versions, editor state, image slots, new error codes`.

### Task 6: Data model, migration and backfill

**Files:**
- Modify `apps/api/prisma/schema.prisma`.
- Create `apps/api/prisma/migrations/<ts>_guest_page_templates/migration.sql` (`--create-only` plus raw SQL).
- Modify `apps/api/package.json` (dependency `@stepler/templates: workspace:*`), `apps/api/test/support/database.ts` (`MODEL_TABLES`) and `apps/api/test/database.e2e.spec.ts`.
- Create `apps/api/test/migration-guest-page.e2e.spec.ts`, which applies the migrations up to the previous one, seeds, then applies this one.

**Schema:**
- `enum ImageSlot { COVER BACKGROUND COLLECTION_IMAGE }`, `enum ImageStatus { PENDING READY FAILED }`, `enum ImageSource { UPLOAD FRAME }`, `enum GuestPageVersionState { PUBLISHED DRAFT }`, and `UploadPurpose += BACKGROUND, COLLECTION_IMAGE`.
- `CollectionImage { id uuidv7, collectionId → Collection (Cascade), slot ImageSlot, status ImageStatus @default(PENDING), source ImageSource, mimeType, originalSizeBytes BigInt, derivedSizeBytes BigInt @default(0), width Int?, height Int?, createdAt; @@unique([id, collectionId]); @@index([collectionId, slot]) }`.
- `GuestPageVersion { id uuidv7, collectionId → Collection (Cascade), state GuestPageVersionState, templateId String, templateVersion Int, settings Json, welcomeMessage String?, coverImageId String? @db.Uuid, backgroundImageId String? @db.Uuid, revision Int @default(1), createdAt, updatedAt @updatedAt; @@unique([collectionId, state]) }`.
  - The relations `(coverImageId, collectionId)` and `(backgroundImageId, collectionId)` → `CollectionImage (id, collectionId)` use `onDelete: NoAction`.
- `Collection.imageId String? @db.Uuid`, relation `(imageId, id)` → `CollectionImage (id, collectionId)` with `NoAction`.
- `CollectionCover` and `Collection.welcomeMessage` stay untouched (expand/contract).

**Raw SQL (named):**
- `CollectionImage_sizes`, `CollectionImage_ready_dimensions` (as the cover's);
- `GuestPageVersion_template_id` CHECK `"templateId" ~ '^[a-z][a-z0-9-]{0,39}$'`;
- `GuestPageVersion_numbers` CHECK `("templateVersion" >= 1 AND "revision" >= 1)`;
- `GuestPageVersion_settings_object` CHECK `(jsonb_typeof("settings") = 'object')`;
- `GuestPageVersion_welcome_length` (as `Collection_welcome_length`);
- `UploadSession_purpose_actor` and `UploadSession_cover_is_photo` replaced by `…_purpose_actor` `((purpose = 'CONTENT') = (guest columns NOT NULL) AND (purpose <> 'CONTENT') = ("uploaderUserId" IS NOT NULL))` and `UploadSession_admin_image_is_photo` `(purpose = 'CONTENT' OR kind = 'PHOTO')`.
- **Backfill, in the same migration:**
  - `INSERT INTO "CollectionImage" SELECT id, "collectionId", 'COVER', status::text::"ImageStatus", source::text::"ImageSource", … FROM "CollectionCover"`;
  - one `PUBLISHED` `GuestPageVersion` per collection with `templateId 'classic'`, `templateVersion 1`, settings = the literal of `classic.defaults`, `welcomeMessage` from `Collection`, and `coverImageId` = the cover's id.

- [ ] **Step 1: Failing tests.**
  - Every new CHECK is violated once and named.
  - A second `PUBLISHED` row is refused (unique).
  - A version pointing at another collection's image is refused (composite FK).
  - Deleting a collection that has images and both versions cascades in one statement (NO ACTION, not RESTRICT).
  - A `BACKGROUND` upload without `uploaderUserId` is refused.
  - **Migration test:** two collections, one with a `READY` cover and a welcome, one bare. After the migration, each has exactly one `PUBLISHED` row. The settings deep-equal `definitionOf('classic').defaults`, imported from `@stepler/templates/core`. Ids and welcome are carried over, and the cover image has the same id and status.
- [ ] **Step 2:** FAIL → schema → `prisma migrate dev --create-only --name guest_page_templates` → append the SQL → `pnpm db:migrate` → PASS. `pnpm db:check` → PASS.
- [ ] **Step 3:** Commit `feat(api): collection images, guest page versions and their backfill`.

### Task 7: Collection images generalized (API side) and the legacy cover adapter

**Files:**
- Move and rename: `apps/api/src/collections/cover-keys.ts` → `apps/api/src/images/image-keys.ts`. In the same folder:
  - `cover-urls.ts` → `image-urls.ts`;
  - `covers.service.ts` → `collection-images.service.ts`;
  - `cover-uploads.service.ts` → `image-uploads.service.ts`.
- Create `apps/api/src/images/images.module.ts` and `apps/api/src/guest-page/guest-page.repository.ts`.
- Modify `apps/api/src/collections/cover.controller.ts`. It becomes the **legacy adapter**: the same routes, target `BOTH`, response `Collection`.
- Modify `apps/api/src/limits/usage.service.ts` (sum over `CollectionImage`) and `apps/api/src/jobs/job-names.ts` (+ spec):
  - `'media.collection-image': { collectionId; imageId }`;
  - `'collection-image.purge': { collectionId; imageId; slot }`;
  - the old names stay registered.
- Move and rename `apps/api/test/cover-uploads.e2e.spec.ts` → `collection-images.e2e.spec.ts`, and `covers.e2e.spec.ts` → `collection-images-frame.e2e.spec.ts`. Keep the old assertions through the legacy routes.

**Interfaces — produces:**
- `ImageSlotKey = 'COVER' | 'BACKGROUND' | 'COLLECTION_IMAGE'`.
- `imagePrefix(cid, slot, imageId)` uses the segments `cover`, `background` and `collection-image`.
- `imageKey(cid, slot, imageId, role: 'original' | 'thumbnail' | 'preview' | 'large')`.
- `RENDITIONS: Record<ImageSlotKey, readonly ('thumbnail' | 'preview' | 'large')[]>`:
  - `COVER`: `['thumbnail', 'preview']`;
  - `BACKGROUND`: `['thumbnail', 'preview', 'large']`;
  - `COLLECTION_IMAGE`: `['thumbnail']`.
- `ImageTarget`:
  - `{ slot: 'COLLECTION_IMAGE' }`;
  - `{ slot: 'COVER' | 'BACKGROUND'; version: 'DRAFT' }`;
  - `{ slot: 'COVER'; version: 'BOTH' }` (legacy, PR I only).
- **GuestPageRepository** (tx functions; no dependencies other than Prisma):
  - `readVersions(tx, cid): { published: Row; draft: Row | null }`;
  - `ensureDraft(tx, cid): Row`, which copies published into a `DRAFT` row with `revision 1`;
  - `setImageRef(tx, cid, state, slot, imageId | null): string | null`, which returns the replaced id;
  - `referencedImageIds(tx, cid): Set<string>`.
- **CollectionImagesService:**
  - `set(tx, cid, target, image: NewImage, reserve?)`: insert `PENDING`, update the reference(s), `collectGarbage(tx, cid, replacedIds)`, enqueue `media.collection-image`;
  - `unset(tx, cid, target)`;
  - `collectGarbage(tx, cid, candidateIds)`: delete the candidate rows that are not referenced by any version or by `Collection.imageId`, and enqueue `collection-image.purge` for each;
  - `setFromFrame(a, cid, target, contentItemId)`;
  - `lockMutable` (unchanged).
- **ImageUploadsService:** `initiate`, `presignParts`, `complete` and `cancel` take `(a, cid, purpose: 'COVER' | 'BACKGROUND' | 'COLLECTION_IMAGE', …)`. `complete` takes the `target`. The open-upload cap counts per `(collectionId, purpose)`.
- **Legacy adapter:** `BOTH` sets the published reference *and*, when a draft exists, the draft's. `PATCH /collections/{id}` with `welcomeMessage` writes the published version (and the draft's when present) instead of the column.

- [ ] **Step 1: Failing tests.**
  - The slice 8a cover suites pass unchanged through the legacy routes, now backed by `CollectionImage` and the published version.
  - A replaced published cover is purged only when no draft references it.
  - Quota counts every slot.
  - `PATCH welcomeMessage` shows up in the guest context's `page.welcomeMessage`.
- [ ] **Step 2:** FAIL → implement → PASS; `pnpm openapi:write`.
- [ ] **Step 3:** Commit `refactor(api): covers become slot-typed collection images referenced by guest page versions`.

### Task 8: Worker — renditions per slot and image purge

**Files:**
- Rename `apps/api/src/worker/handlers/cover-derivatives.handler.ts` → `collection-image-derivatives.handler.ts`, and `purge-cover.handler.ts` → `purge-collection-image.handler.ts`.
- Modify `apps/api/src/worker/media/images.ts` (`renderRenditions`), `job-runner.ts` (the old names map to the new handlers with `coverId` → `imageId`, slot `COVER`) and `worker.module.ts`.
- Modify `apps/api/test/worker-media.e2e.spec.ts` and `worker-handlers.e2e.spec.ts`.

**Interfaces — produces:**
- `LARGE_PX = 2400`, `LARGE_QUALITY = 72`.
- `renderRenditions(input, roles, opts): Promise<Record<Role, Rendition>>`. `renderDerivatives` for content stays unchanged.
- The derivatives handler renders `RENDITIONS[slot]`, then `updateMany` where the row is still `PENDING`. If the count is 0, it deletes what it wrote, as today.
- The purge handler skips when the row exists, and otherwise deletes the prefix.

- [ ] **Step 1: Failing tests.**
  - `BACKGROUND` `photo.jpg` → three WebP objects (longest sides 480, ≤ 1600, ≤ 2400). `derivedSizeBytes` is their sum.
  - `COLLECTION_IMAGE` → the thumbnail only.
  - A legacy-named job `media.cover-derivatives {coverId}` still completes a `COVER` row.
  - The **Review Focus 1** part: a purge job for an image that a draft still references keeps the objects.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Commit `feat(worker): renditions per image slot (2400px backgrounds) and image purge`.

### Task 9: Guest page editor API

**Files:**
- Create in `apps/api/src/guest-page/`: `guest-page.module.ts`, `guest-page.service.ts`, `guest-page.controller.ts`, `guest-page-dto.ts`.
- Create `apps/api/test/guest-page.e2e.spec.ts`.
- Modify `app.module.ts`.

**Interfaces — produces (routes under the admin session, `@ApiTags('Guest page')`):**
- `GET /collections/:id/guest-page` → `GuestPageEditor`. Image URLs are presigned per window. Settings go through `resolveTheme`; if it fell back, the editor gets the fallback and a log line carries `{collectionId, templateId}`.
- `PUT /collections/:id/guest-page/draft` → `GuestPageEditor`:
  - `definitionOf(templateId)` is required, else `400 VALIDATION_FAILED` at path `['templateId']`;
  - `settingsSchemaFor(def).safeParse`, else 400 with the paths;
  - `assertReadable`, else `422 THEME_CONTRAST_TOO_LOW`;
  - in a transaction: `lockMutable` (archived → 409), then `SELECT … FOR UPDATE` on the draft;
    - `baseRevision === null` with a draft present → `409 GUEST_PAGE_DRAFT_CONFLICT`;
    - `baseRevision` ≠ the draft's revision → 409;
    - no draft yet → `ensureDraft`;
  - updates `templateId`, `templateVersion = def.version`, `settings`, `welcomeMessage`, and `revision + 1`.
- `POST /collections/:id/guest-page/publish` (`{ revision }`) → `GuestPageEditor`:
  - no draft → `200`, unchanged (idempotent);
  - a revision mismatch → 409;
  - otherwise, in a transaction: copy the draft's columns into `PUBLISHED`, delete the draft, and `collectGarbage` over the old published plus the draft's image ids;
  - logs `guest page published {collectionId, templateId}`.
- `DELETE /collections/:id/guest-page/draft` → `204`. It deletes the draft and runs `collectGarbage` over its image ids. With no draft it is a no-op.
- Draft image routes (`:slot` ∈ `cover|background`, target `{slot, version: 'DRAFT'}`; each creates the draft if absent; **the revision is not bumped**; responses are `GuestPageEditor`):
  - `POST …/guest-page/draft/:slot/uploads`
  - `…/uploads/:uploadId/parts`
  - `…/uploads/:uploadId/complete`
  - `DELETE …/uploads/:uploadId`
  - `POST …/guest-page/draft/:slot/from-frame`
  - `DELETE …/guest-page/draft/:slot`

- [ ] **Step 1: Failing tests:**
  - **Draft isolation.** Save a T-classic draft with `accent '#5A4A8C'` and upload a background into it. The guest context's `page` is still the published one: no `background`, the old accent, and no key named `draft` or `revision` anywhere in the body.
  - **Publish.** After publish, the context shows it. `DELETE draft` after that is a no-op.
  - **Review Focus 1.** Published cover A, draft cover B, then reset: B's row is gone and a purge is queued, and A remains. Published A, draft B, publish: A is purged and B is published. A frame-copied cover survives the frame's deletion and purge.
  - **Review Focus 2.**
    - Tab 1 `PUT` with `baseRevision: null` → `revision 2`. Tab 2 `PUT` with `null` → 409. Tab 2 `PUT` with 1 → 409. With 2 → 200 (`revision 3`).
    - A draft cover upload completing between two `PUT`s does not change the revision.
    - `Promise.all` of two `PUT`s with the same base → one 200 and one 409.
  - **Review Focus 3** (one request each, 400 with the paths):
    - `classic` + `coverPlacement: 'full'`;
    - `classic` + `background: { kind: 'gradient', preset: 'nope' }`;
    - an unknown template;
    - `dim` 10 on `classic`;
    - `accent 'red'`.
  - A row with `templateId 'gone'`, seeded by SQL → `GET` returns classic defaults, and the guest context renders classic.
  - **Authorization:**
    - admin B → `404` on all 9 routes;
    - a guest cookie → `401`;
    - archived → every mutation 409 `COLLECTION_ARCHIVED`, while `GET` still works.
  - **Quota:** a draft background that does not fit → `409 QUOTA_EXCEEDED`, with no object left under `background/`.
- [ ] **Step 2:** FAIL → implement → PASS; `pnpm openapi:write`.
- [ ] **Step 3:** Commit `feat(api): guest page draft, publish and reset with optimistic concurrency`.

### Task 10: Published page for guests, the collection image API, and the guest page reading it

**Files:**
- Modify `apps/api/src/guest-access/guest-sessions.service.ts` (`buildContext` → `page` from `PUBLISHED`, via `resolveTheme`, guest image URLs only when `READY`) and `apps/api/src/collections/collection-dto.ts` (`image`, and `cover` from the published cover).
- Create `apps/api/src/images/collection-image.controller.ts`. It has the six routes under `/collections/:id/image…`, target `{slot: 'COLLECTION_IMAGE'}`, and response `Collection`.
- Modify `apps/web/src/guest/guest-page.tsx` and `template-model.ts`, which now use `context.page` (template, settings, welcome, cover, background).
- Modify `apps/api/test/guest-sessions.e2e.spec.ts`. Create `apps/api/test/collection-image.e2e.spec.ts`.

- [ ] **Step 1: Failing tests.**
  - The guest context has `page.templateId 'classic'` and the backfilled welcome and cover.
  - `page.background.largeUrl` is present for a `READY` background and `null` before.
  - **The collection image never appears in any guest response.** Set a `READY` collection image, then recursively search the context, the content list, the resolve response and the session JSON for its id and for `/collection-image/`. Neither is found.
  - The collection image routes: the upload-to-`READY` flow, from-frame, remove, admin B → 404, archived → 409.
  - `GET /collections` items carry `image`.
  - The web `template-model.test.ts` reads `context.page`.
- [ ] **Step 2:** FAIL → implement → PASS. `pnpm e2e` stays green: the old tab works through the legacy adapter, and guests see no change.
- [ ] **Step 3:** Commit `feat(api): published guest page in the guest context; admin-only collection image`.

### Task 11: Docs, verification and PR I

- Docs:
  - **ADR 0017.** Add the storage model, draft/publish/revision, garbage collection, the legacy adapter and the PR L contraction. Status: Accepted.
  - **Spec:**
    - §3 monorepo (`apps/templates`);
    - §7.2 (`CollectionImage`, `GuestPageVersion`, `Collection.imageId`);
    - §8 (admin images, guests read published only);
    - §9 resource map;
    - §10.6 keys and a §10.7 rewrite for all slots;
    - §11 jobs;
    - §13.2 usage.
  - **ADR 0008** addendum (purposes `BACKGROUND`, `COLLECTION_IMAGE`) and **ADR 0009** notes (renditions per slot).
  - `BOOTSTRAP.md`.
- [ ] **Step 1:** Batched minors (one commit).
- [ ] **Step 2: Full verification:** `pnpm format:check && pnpm turbo run lint typecheck test build && pnpm db:check && pnpm e2e`. Report as is.
- [ ] **Step 3:** Commit `docs: guest page templates storage (ADR 0017, spec, ADR 0008/0009 addenda)`; open PR I → `dev`.

**Checkpoint (after Task 9):** one independent review of Tasks 6–9 focused on Review Focus 1–3, lock order (owner → collection → draft row), and GC under concurrency (two publishes, a publish during an upload completion).

---

## PR J — The editor with live preview

### Task 12: Preview route and message protocol

**Files:**
- Create `apps/web/src/app/preview/collections/[id]/page.tsx`. It is a server component: `getSessionUser()`, signed out → `redirect('/login')`, `robots: noindex`.
- Create in `apps/web/src/app/preview/collections/[id]/`: `layout.tsx` (minimal, with `QueryProvider` and `NextIntlClientProvider`) and `preview-client.tsx`.
- Create `apps/web/src/guest-page/preview-protocol.ts` with `preview-protocol.test.ts`.
- Modify `apps/web/next.config.ts` (headers for `/preview/:path*`: `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy: frame-ancestors 'self'`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`).

**Interfaces — produces:**
- `PREVIEW_MESSAGE = 'stepler:guest-page-preview'`, `PREVIEW_READY = 'stepler:guest-page-preview-ready'`.
- `previewMessageSchema = z.object({ type: z.literal(PREVIEW_MESSAGE), version: z.literal(1), page: guestPageVersionSchema }).strict()`.
- `acceptPreviewMessage(event: MessageEvent, expectedSource: Window | null): GuestPageVersion | null` checks `origin === location.origin`, the source, and the schema.
- `PreviewClient({ collectionId })`:
  - posts `PREVIEW_READY` to `window.parent` on mount;
  - renders `GuestTemplateRoot` with `inert` from the last accepted message, `fetchCollection` (title, description, counts) and `listContent(id, { limit: 12 })` (admin) for an «Усі кадри» slot (a static `FrameGrid`, no viewer);
  - `ownFrames` is an empty «Ваші кадри» block;
  - the actions use the real labels and no-op handlers;
  - with no frames, there are 6 placeholder tiles (`Frame kind="pending-preview"`);
  - no guest API module is imported (a lint `no-restricted-imports` of `@/guest/api` in this folder, plus a test).

- [ ] **Step 1: Failing tests** (`preview-protocol.test.ts`):
  - another origin → `null`;
  - the right origin with a different `source` → `null`;
  - a malformed `page` → `null`;
  - a valid message → the page.
- [ ] **Step 2:** FAIL → implement → PASS. Manual check: signed out, `/preview/collections/{id}` redirects. Another admin's id renders the not-found state (the admin API says 404).
- [ ] **Step 3:** Commit `feat(web): same-origin guest page preview driven by postMessage`.

### Task 13: Editor state — working copy, autosave, publish, reset, conflict

**Files:**
- Create in `apps/web/src/app/app/collections/[id]/guest-page/`: `editor-state.ts` (with `editor-state.test.ts`) and `use-guest-page-editor.ts`.
- Modify `apps/web/src/api/collections.ts`: `fetchGuestPage`, `saveGuestPageDraft`, `publishGuestPage`, `discardGuestPageDraft`, and `draftImageApi(id, slot): UploadApi<GuestPageEditor>`, `setDraftImageFromFrame`, `removeDraftImage`.

**Interfaces — produces:**
- `EditorWorking = { templateId; settings: ThemeSettings; welcomeMessage: string | null }`.
- `editorReducer(state, action)`. The actions are:
  - `{type:'template', id}` → `applyTemplate`;
  - `{type:'settings', patch}`;
  - `{type:'welcome', value}`;
  - `{type:'server', editor}`, which rebases onto the server state when nothing is pending;
  - `{type:'reset'}`.
- `editorStatus(…)` is one of `'saved' | 'draft' | 'saving' | 'error' | 'conflict'`.
- `useGuestPageEditor(collectionId)` returns `{ editor, working, dispatch, status, previewPage: GuestPageVersion, save(): Promise<void>, reset(): Promise<void>, reloadLatest(): void }`.
  - Autosave runs 800 ms after the last change with one request in flight, always sending the latest `baseRevision`.
  - `save` flushes the autosave, then publishes.
  - `409` → `conflict` (no retry).
  - Image operations set the editor from their response without touching `working`.
  - A `beforeunload` guard is active only while a save or an upload is pending.

- [ ] **Step 1: Failing unit tests.**
  - `editorReducer` takes `definitionOf` as a parameter. With a fake two-template lookup, switching template resets the accent and keeps `align` when allowed.
  - `status`:
    - published only and no draft → `saved`;
    - a local change → `draft`;
    - a request in flight → `saving`;
    - a 409 → `conflict`.
  - **Review Focus 2:** a 409 never re-sends.
  - `previewPage` merges `working` over the server draft's images.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Commit `feat(web): guest page editor state with autosaved drafts`.

### Task 14: Editor UI — desktop panel, sections and save bar

**Files:**
- Create in `apps/web/src/app/app/collections/[id]/guest-page/`:
  - `guest-page-tab.tsx`, which replaces `appearance/appearance-tab.tsx` in `collection-overview.tsx` (`?tab=appearance` stays);
  - `preview-pane.tsx`: the device toggle, the iframe at 390×844 or 1440×900 scaled by `min(paneW/W, paneH/H)`, and «Відкрити як гість» (the default guest link, new tab, SR text «(нова вкладка, збережена версія)»);
  - `save-bar.tsx`;
  - `sections/template-section.tsx`, `sections/cover-section.tsx` (adapted from `appearance/cover-card.tsx` and `cover-picker.tsx` to `draftImageApi('cover')`), `sections/welcome-section.tsx`, `sections/background-section.tsx`, `sections/accent-section.tsx`, `sections/font-section.tsx`, `sections/layout-section.tsx`;
  - `locked-option.tsx`.
- Create `packages/ui/src/components/slider.tsx` and `slider.stories.tsx` (Radix Slider from `radix-ui`, 44 px touch track, the value read out).
- Move `appearance/use-cover-upload.ts` → `guest-page/use-image-upload.ts`, generic over `UploadApi<GuestPageEditor>`.
- Delete `appearance/appearance-tab.tsx`, `appearance/welcome-form.tsx`, `appearance/cover-card.tsx`, `appearance/cover-picker.tsx` (once moved) and `appearance/cover-state.ts`. Move their tests.
- Modify `apps/web/messages/{uk,en}.json` (`guestPage.*`, `templates.{id}.name`, `templates.{id}.locks.*`; copy from Appendix B).

**Behaviour** (Appendix B):
- **Layout:** a 380 px panel with the save bar fixed at its bottom; the preview pane fills the rest at `#E6E7E2`, using the `--muted` token.
- **Sections in order:** Шаблон, Обкладинка, Привітання, Фон, Акцент, Шрифт, Розташування.
  - **Шаблон:** a 3-column grid of `Thumbnail`s, `aria-pressed`, names from messages.
  - **Фон:**
    - a segmented control of the allowed kinds (the rest are `LockedOption`s);
    - swatches 32 px;
    - gradients as 32 px swatches with their gradient;
    - for image: upload or pick from frames or remove, plus the «Затемнення» `Slider` (`imageDim`). For `backgroundImageSource 'cover'`, the line «У цьому шаблоні фоном є обкладинка…» replaces the picker.
  - **Акцент:**
    - 6 presets at 34 px;
    - «Свій колір» as an `Input` with a chip, accepting `#?[0-9a-fA-F]{6}`, uppercased; an invalid value shows a field error and is never sent;
    - the hint from `accentContrast`, with the footnote.
  - **Шрифт:** a `Select` listing the 12 fonts, each name in its own face. The fonts load on open only, by rendering the list; the trigger shows the current one. The summary reads «Заголовки — X, текст — Y».
  - **Розташування:** cover placement (2×2 with pictograms), alignment and corners. Locked options use `LockedOption` with the template's reason line.
- **Save bar:** the status dot and line (Appendix B), «Скинути зміни» (outline; `ConfirmDialog` «Скинути всі зміни? Гості й далі бачитимуть збережену версію.») and «Зберегти» (ink, with the dirty dot). Both buttons are `aria-disabled` when nothing changed.
  - Saving shows a spinner and «Зберігаємо…».
  - An error shows «Не вдалося зберегти» with «Повторити».
  - A conflict shows an `Alert` «Сторінку змінили в іншій вкладці» with «Показати останню версію».
- **Archived:** the panel is read-only with one `Alert`, and the preview still works.

- [ ] **Step 1: Design pass**, with the header comment in `guest-page-tab.tsx`.
- [ ] **Step 2:** Implement. `pnpm --filter @stepler/web lint typecheck test` and `pnpm --filter @stepler/ui test` (Slider story + axe) → PASS.
- [ ] **Step 3:** Screenshots at 1440×900 and 1024×768, of every section, `classic`'s locked cover placements and the save-bar states, next to `E-editor-desktop`.
- [ ] **Step 4:** Commit `feat(web): guest page editor with live preview (desktop)`.

### Task 15: Editor on phones; the legacy paths go

**Files:**
- Create `apps/web/src/app/app/collections/[id]/guest-page/phone-editor.tsx`:
  - below `lg`, the preview card is centred at 390 px scaled to the available width (max 0.7) with a status chip;
  - the «Налаштувати» FAB opens a `Sheet` (bottom, 544 px / `max-h-[85svh]`) with an accordion where one section is open at a time (`h3 > button[aria-expanded]`, min height 56, summaries from Appendix B), and a footer save bar with 48 px buttons;
  - the scrim closes the sheet;
  - no device toggle.
- Modify `content/content-viewer.tsx` and `content-tab.tsx`. «Зробити обкладинкою» calls `setDraftImageFromFrame(id, 'cover', itemId)`; the toast reads «Обкладинку додано в чернетку» with the action «Відкрити гостьову сторінку» (`?tab=appearance`) [D1].
- API: delete `apps/api/src/collections/cover.controller.ts` (the legacy adapter), the `BOTH` target and `welcomeMessage` in `updateCollectionRequestSchema`. Their tests go too, as do `appearance/use-set-cover.ts` and `welcome-schema.ts`. Run `pnpm openapi:write`.

- [ ] **Step 1: Design pass**, with the header comment in `phone-editor.tsx`.
- [ ] **Step 2:** Implement. `pnpm turbo run lint typecheck test --filter @stepler/web --filter @stepler/api --filter @stepler/contracts` → PASS.
- [ ] **Step 3:** Screenshots at 360×780 and 390×844: closed, open on each section, and a conflict. Compare with `E-editor-phone`.
- [ ] **Step 4:** Commit `feat(web): phone editor in a bottom sheet; remove the immediate cover and welcome paths`.

### Task 16: Editor journeys, product docs and PR J

**Files:**
- Rewrite `e2e/tests/appearance.spec.ts` as `e2e/tests/guest-page-editor.spec.ts`.
- Modify `e2e/support/collections.ts`: add `saveGuestPageDraftViaApi`, `publishGuestPageViaApi`, `setDraftCoverFromFrameViaApi`, `waitForImageReady`; remove the cover and welcome helpers.
- Docs:
  - `docs/product/PRODUCT.md`: §5.3/§5.4 (the guest page: template plus tweaks, draft and save), §6.2, and §24.3 (themes, custom colours and typography move into MVP by owner decision 2026-10-05; the remainder is branding and upload instructions);
  - `docs/product/mvp.md` (a Must-have row) and `post-mvp.md`;
  - `docs/design/DESIGN-SYSTEM.md` §6.6 (the «Гостьова сторінка» tab, the editor) and §5 (`Slider`);
  - `docs/ux/design-system.md`;
  - `BOOTSTRAP.md`.

- [ ] **Step 1: Failing journeys.**
  - `@desktop`:
    - open `?tab=appearance`, change the accent to «Слива» → the iframe's `[data-template]` style has `--tpl-accent: #5A4A8C` within 1 s, and nothing is saved;
    - the status reads «Чернетка…»;
    - a guest in a second context still sees the old accent;
    - «Зберегти» → the status reads «Збережено…» and the guest reloads to the new accent;
    - «Скинути зміни» after another change → confirm → the preview reverts.
  - `@desktop`, a draft cover from the viewer: the toast, the editor shows the cover in the preview, and the guest has no hero until saved. **Review Focus 1.**
  - `@desktop`, conflict: two pages, both edit → the second shows «Сторінку змінили в іншій вкладці». **Review Focus 2.**
  - All projects at phone width: «Налаштувати» opens the sheet, there is no horizontal overflow, the sheet buttons are ≥ 44 px, and «Зберегти» works. **Review Focus 5.**
- [ ] **Step 2:** `pnpm e2e` → PASS on all projects.
- [ ] **Step 3:** Batched minors. Full verification: `pnpm format:check && pnpm turbo run lint typecheck test build build-storybook && pnpm db:check && pnpm e2e`.
- [ ] **Step 4:** Owner design review of the screenshots from Tasks 14–15. Feedback goes in one `fix(web): … after design review` commit.
- [ ] **Step 5:** Commit `docs: guest page editor; themes move into MVP`; open PR J → `dev`.

---

## PR K — Templates T1–T6 as designed

Each template task has the same shape:
- `definition.ts` (Appendix A row);
- `layout.tsx`, `thumbnail.tsx` and `styles.css` (scoped);
- `<id>.stories.tsx` with the fixtures `FirstVisit`, `Contributed`, `ViewOnly`, `TextOnly`, `NoCover`, `LongTitle`, `LongWelcome` and `ImageBackground` (where allowed), at 360/390/768/1440, with the Task 3 assertions;
- registration in both registries;
- messages `templates.<id>.name` and `templates.<id>.locks.*`.

For every task:
- [ ] **Step 1:** Design pass, reading the artboard HTML in `docs/design/guest-templates/`.
- [ ] **Step 2:** Failing stories.
- [ ] **Step 3:** Implement → PASS.
- [ ] **Step 4:** Screenshots of the story at 390×844 and 1440×900, side by side with the artboard.
- [ ] **Step 5:** Commit.

The tasks:
- **Task 17: `classic` to the artboard.**
  - Changes: the 472 px white aside on desktop, 16:10 cover on phones, 6-column grids, the green status box, light-only [D5], and gradients.
  - `version` stays 1: the settings shape did not change.
  - The `palettes.test.ts` row is updated.
  - Commit `feat(templates): classic as designed`.
- **Task 18: `fullscreen` (T2).**
  - The 100svh cover hero under a scrim; the alpha at the text band is `max(var(--tpl-bg-image-veil), minVeil(onImageText, '#0E0B09'))`.
  - The overlapping dark sheet, and the glass sticky bar holding the primary action, the secondary and the legal notice.
  - Desktop: an 864 px cover panel plus a scrolling column.
  - With no cover: a `#1B1917` hero with the title.
  - `backdrop-filter` falls back to an opaque `#1E1916` when unsupported.
  - An API test in `guest-page.e2e.spec.ts`: `fullscreen` + `background.kind 'solid'` → 400 and `coverPlacement 'top'` → 400 (Review Focus 3).
  - Commit `feat(templates): fullscreen (T2)`.
- **Task 19: `journal` (T3).**
  - The centred print cover (3:4 with a mat), the ornament, and the italic welcome.
  - After contributing: the compact title bar, and the first own frame large (4:3 on phones, 2×2 on desktop) through CSS on `[data-slot=guest-own-frames] [data-slot=frame]:first-child`.
  - The desktop 560 px aside.
  - The footer is present in every phase (the artboard omits it after upload).
  - Commit `feat(templates): journal (T3)`.
- **Task 20: `postcard` (T4).**
  - The airmail card, the polaroid cover with tape and a −3° rotation, the postmark, and the stamp buttons.
  - Polaroid frames: CSS only, with rotations from `nth-child`.
  - Wishes as sticky notes.
  - The sticky bar after contributing.
  - The footer is always present (the artboard omits it on desktop and after upload).
  - Rotations are static and stay under reduced motion; only the hover transition stops.
  - Commit `feat(templates): postcard (T4)`.
- **Task 21: `party` (T5).**
  - Dark-only, with the accent glow from `--tpl-accent-glow`.
  - The emblem cover is a circle with rotating text built from the title in uppercase. The text is `aria-hidden`, and the rotation runs under `no-preference` only.
  - Bento own and all grids through CSS spans.
  - The «Нове» pulse runs twice, under `no-preference`.
  - Story `ReducedMotion` asserts `getComputedStyle(emblemRing).animationName === 'none'` with `emulateMedia({ reducedMotion: 'reduce' })`. **Review Focus 5.**
  - Commit `feat(templates): party (T5)`.
- **Task 22: `minimal` (T6).**
  - White, solid colour only. The default placement is `none`; `top` and `side` are allowed. `side` puts a 4:5 image beside the title block: 40 % wide on phones, and on desktop on the right of the 576 px column.
  - The ruled action row with the underlined text button.
  - Commit `feat(templates): minimal (T6)`.

### Task 23: Template matrix journeys, design review and PR K

**Files:**
- Create `e2e/tests/guest-templates.spec.ts`.
- Docs:
  - `docs/design/DESIGN-SYSTEM.md`: a new §13 "Guest page templates" (the contract, tokens, locks table = Appendix A, how to add a template); ADR 0015 is amended in §1 (rotation is allowed inside T4 by owner decision);
  - `apps/templates/README.md`;
  - ADR 0017 (the template list).
- [ ] **Step 1: Failing journeys** (all projects). For each of the 6 templates, publish via the API with defaults plus a frame-copied cover, and open the guest link. Check:
  - `horizontalOverflow === 0`;
  - the h1 is visible;
  - with a contributing link, the primary action's box is inside the first viewport;
  - the legal notice is visible after scrolling to it, and `elementFromPoint` at the footer's privacy link centre is that link (not covered by a sticky bar);
  - clicking the primary action on a files link opens the file chooser (`page.waitForEvent('filechooser')`);
  - with a T5 `reducedMotion: 'reduce'` context, no running animations (`document.getAnimations().length === 0`).
  - **Review Focus 4** at 320 px, for `classic` and `party`: a 100-character single-word title, a 160-character welcome, and the accent `#C5F04A`. The `--tpl-on-accent`, `--tpl-text` and `--tpl-accent-text` values are read from the page and the contrast is recomputed in the test (the helper is imported from `@stepler/templates/core`) as ≥ 4.5.
- [ ] **Step 2:** `pnpm e2e` → PASS. Record the shard durations.
- [ ] **Step 3:** Batched minors. Measure the guest page weight per template: first-view transfer, font bytes, LCP on Lighthouse mobile. Put it in the PR body.
- [ ] **Step 4:** Full verification, as in Task 16.
- [ ] **Step 5:** Owner design review of all 6 × (390, 1440) against the artboards. Feedback goes in one commit.
- [ ] **Step 6:** Commit `docs: guest page templates in the design system`; open PR K → `dev`.

---

## PR L — «Картинка колекції» and the contraction

### Task 24: Collection image in «Параметри колекції»; dashboard and share dialog

**Files:**
- Create `apps/web/src/app/app/collections/[id]/settings/collection-image-card.tsx`. It reuses `use-image-upload.ts` with `collectionImageApi` and the frame picker, generalized as `frame-picker.tsx`.
- Modify `settings/collection-settings.tsx` (a new first `SectionCard` «Картинка колекції», with helper «Її бачите лише ви — на панелі колекцій. Гості бачать обкладинку на гостьовій сторінці.»), `apps/web/src/app/app/collection-cover-image.tsx` (renamed `collection-mark.tsx`: `collection.image` thumbnail, else initials), `collection-card.tsx`, `share-dialog.tsx`, `apps/web/src/api/collections.ts` and the messages.

- [ ] **Step 1: Design pass.** Failing unit test: the `collectionMarkUrl(collection)` thumbnail once `READY`, else `null`.
- [ ] **Step 2:** Implement → PASS. Screenshots of the settings card (every state) at 360/1440, and of the dashboard with and without an image.
- [ ] **Step 3: Journeys.**
  - `@desktop`: upload a collection image → the dashboard card shows it.
  - Set a *cover* only → the card still shows initials.
  - The guest page never requests `/collection-image/` (`page.on('request')`).
- [ ] **Step 4:** Commit `feat(web): admin-only collection image on the dashboard and share dialog`.

### Task 25: Contraction, docs and PR L

**Files:**
- **Migration:** drop `CollectionCover`, `CoverStatus`, `CoverSource` and `Collection.welcomeMessage` (with `Collection_welcome_length`).
- **API:** remove the `media.cover-derivatives` and `cover.purge` job aliases (the queue holds none: the plan assumes PR I's worker ran on stage; a test asserts no job of those names exists before dropping).
- **contracts:** `Collection.cover` and the `collectionCoverSchema` alias.
- **Docs:** spec §7.2 and ADR 0017 ("Contraction done"), `BOOTSTRAP.md`.
- [ ] **Step 1:** Failing `database.e2e.spec.ts` assertions that the old table and column are gone. FAIL → migrate → PASS. `pnpm db:check` → PASS.
- [ ] **Step 2: Full verification.** Report as is.
- [ ] **Step 3:** Commit `chore(api): drop the slice 8a cover table and welcome column`; open PR L → `dev`. After merge, promote `dev → stage`. No new env or bucket change, because the CORS rules already cover the admin's multipart PUTs.

## Checkpoints

- **After Task 4 (PR H):** the owner looks at the `templates:dev` gallery. That is the moment to adjust the contract before T2–T6 exist.
- **After Task 9:** an independent API review (see Task 11).
- **Before each UI PR (J, K, L):** the owner's design review of the screenshots, with feedback in one commit.
- **After each PR:** one whole-branch review, one fix round, and a merge commit to `dev`.
- **Promotion:** `dev → stage` is safe after any PR. PR I keeps the slice 8a tab working through the adapter, and PR J removes the adapter together with the old UI.

## Doc conflicts this plan resolves

1. **PRODUCT §24.3 and `post-mvp.md`** list themes, custom colours and typography as post-MVP. The owner pulled them in on 2026-10-04/05. Task 16 moves them, leaving branding and upload instructions post-MVP.
2. **Brief: "the guest page server-renders the published template."** The guest page is client-rendered after a browser-side session exchange ([C3], ADR 0007). Kept client-side [D2].
3. **Brief: "T1 = current look, no visual change"** vs **"the implementer must reproduce the artboards"**, whose T1 differs from today's page. PR H ports today's page into `classic`; PR K (Task 17) moves it to the artboard [D5].
4. **The E-editor artboard shows locks as a hover-only tooltip** («Цей шаблон не підтримує»). That conflicts with the owner's rule and with rule 05 (no hover-only critical interactions). A visible reason line is used instead.
5. **Artboard vs editor values:** T2 accent `#E9C17A` vs `#F2A65A` and Montserrat Alternates vs Manrope; T5 accent `#A56BFF` vs `#C5F04A`. Resolved by [D5].
6. **Footer and legal notice:** the artboards omit the footer on T4 desktop and in T3/T4 after-upload. The legal slice (ADR 0016, F8) requires the notice after the actions and the footer on every guest page. Every template renders both.
7. **ADR 0015** says the print stack is "the only place with rotation, overlap or a shadow on a frame". T4's polaroids (owner-accepted) are a second place. Task 23 amends the ADR.
8. **ADR 0015 "two font files … preloaded on every page"**: twelve more families are committed but never preloaded. Each loads only when a template uses it. ADR 0017 records this.
9. **Slice 8a [A7]:** the dashboard card and share dialog show the guest cover. The owner now wants the admin-only collection image there. Task 24 does this, falling back to initials, never to the cover.
10. **Spec §8 "admin uploads — MVP: cover only"** grows to the three image slots. These are images only, never content frames. Task 11.

## Out of scope

- A free-form builder, custom CSS, uploaded fonts, more than the twelve families, per-guest-link themes, scheduled publishing, version history beyond published plus draft, and A/B previews.
- Theming the guest dialogs (name prompt, wish composer, viewer). They keep the Stepler look.
- Server-side rendering of the guest page [D2].

---

## Appendix A — Template definitions (from the artboards; values are binding)

All six templates share these elements:
- the language button top-right (44 px);
- the primary action «Додати фото й відео», which becomes «Додати ще» after a batch;
- the secondary action «Написати побажання»;
- the legal notice right after the actions;
- the footer «© Stepler · Умови використання · Політика конфіденційності»;
- the sections «Ваші кадри» and «Усі кадри»;
- tiles with a «#018» pill on own frames only (guests never see other guests' numbers, ADR 0015), a «▶ 0:12» pill on videos, and wish tiles with a large accent quote mark;
- a 2 px focus ring.

Lock rows for T3, T4 and T6 are **this plan's proposal**: the artboards define their look but not their locks. The owner confirms them at the PR K review.

| | scheme | heading (default) / body | accent default | background kinds; swatches (first = default) | gradients (id: stops, 180°) | image dim | cover placements (default first) | align | corners |
|---|---|---|---|---|---|---|---|---|---|
| **classic** T1 | light | geologica / geologica | `#B83E26` | solid, gradient, image; `#F0F1EE #FFFFFF #EFE8DD #E4EAEE #ECE6F0` | mist `#F0F1EE→#E4EAEE`, sand `#F0F1EE→#EFE8DD`, lilac `#FFFFFF→#ECE6F0` | from `minVeil` – 90, veil `#F0F1EE` | top, none | start, center | sharp, **soft**, round |
| **fullscreen** T2 | dark | manrope / manrope | `#F2A65A` | image only, source **cover**; base `#1B1917` | — | 20–80 (default 45), veil `#0E0B09`, text-band scrim ≥ `minVeil` | full | start, center | sharp, **soft**, round |
| **journal** T3 | light | cormorant / lora | `#7A2E3A` | solid, gradient; `#F1EADF #F4EEE4 #FAF6EF #EFE6E6 #E9ECE4` | linen `#F1EADF→#F4EEE4`, blush `#F1EADF→#EFE6E6` | — | top (print 3:4), none | **center** (locked) | locked (own radii) |
| **postcard** T4 | light | comfortaa / nunito | `#B3303B` | solid only, dot pattern kept; `#C9D7E8 #E3D9C6 #D9E4D4 #EAD7D7 #D8D3E6` | — | — | top (polaroid), none | **start** (locked) | locked (own radii) |
| **party** T5 | dark | unbounded / manrope | `#C5F04A` | solid, gradient, image; `#110F15 #141A22 #1C1511 #0F1713 #1D1020` | night `#110F15→#1D1020`, ocean `#110F15→#141A22`, forest `#0F1713→#110F15` | from `minVeil` – 90, veil `#110F15` | top (emblem), none | start, center | sharp, soft, **round** |
| **minimal** T6 | light | golos-text / golos-text | `#2443D0` | solid only; `#FFFFFF #F7F7F5 #F4F6FA #FAF7F2 #F5F5F7` | — | — | **none**, top, side | start, center | sharp, **soft**, round |

**Palettes** (`text / body / muted / surfaces / onImageText`):
- **T1:** `#141614 / #3B3E39 / #5A5D58 / [#FFFFFF] / #FFFFFF`. Links `#5A4A8C`. Success `#E5F1EA`/`#2C7350`. Wish tile `#FBECE8`.
- **T2:** `#F3EFE9 / #D9D3CA / #ADA69D / [#1B1917, #24211E, #221F1C] / #FFFFFF`. Pill `rgba(12,10,9,.74)`. Success `#8FD0A9`. Focus ring white.
- **T3:** `#2A211B / #3D3129 / #6A5A4E / [#F5EFE6, #FAF6EF] / —`. Rules `#CDBFAE`. Ornament `#B9A894`.
- **T4:** `#24304F / #3A4562 / #4F5A73 / [#FFFCF5, #FFFFFF, #FFF0B3] / —`. Navy `#2E4E8F`. Airmail `repeating-linear-gradient(135deg, #B3303B 0 12px, #FFFCF5 12px 18px, #2E4E8F 18px 30px, #FFFCF5 30px 36px)`.
- **T5:** `#F3EEFB / #D9D1E6 / #A99FBC / [#2C2042] / #FFFFFF`. Glow from the accent at 0.28 on phones and 0.22 on desktop.
- **T6:** `#15171A / #3D4146 / #63676C / [#FFFFFF, #EEF1FC] / —`. Rules `#E6E7E9`.

Layout summaries (phone 390 | desktop 1440):
- **T1:**
  - Phone: a 52 px header with the wordmark and language; a 16:10 cover; H1 30/600; welcome 16; the mono count; the primary 56 and outline 52 buttons; the notice; «Ваші кадри» (a dashed empty box, or a 3-column grid with the «#013–#018» range); «Усі кадри» in 3 columns, gap 4; «Показати всі N кадрів» 48.
  - Desktop: a 472 px white aside (wordmark, 392 px 4:3 cover, H1 34, welcome 17, count; actions and notice pinned to the bottom) and a 48 px-padded right column (language, sections at 21 px, 6-column grids, gap 8, footer).
- **T2:**
  - Phone: an 844 px hero with the cover and the scrim (0.5/0.08/0.32/0.7/0.9); a white Manrope wordmark; a glass language pill; bottom-aligned count, H1 46/1.02 and welcome 17; «↓ Дивитися кадри»; the sheet overlaps by 28 px (radius 28, handle 40×4); the glass bar is fixed at 12 px insets (radius 24; primary 54; secondary 44; notice).
  - Desktop: an 864 px cover panel (H1 80/1, welcome 20) and a right column with a `#24211E` action card (radius 24), then 3-column grids.
- **T3:**
  - Phone first visit: centred, no wordmark; H1 42/1.02; the ornament (lines and a diamond); the italic welcome; the count; a 210×280 print with a 10 px mat; primary 52 and outline 48 (radius 2); the notice.
  - Phone after contributing: a 48 px italic title bar; the status; «Ваші кадри» 30; a 2-column grid with the first frame 4:3 full width; a sticky primary bar plus a 52 px square pencil.
  - Desktop: a 560 px aside (H1 54, a 252×336 print, buttons side by side 50 px, the footer at the bottom) and a main area with 6-column grids (rows 120, gap 10, first own frame 2×2, a dashed «+ Додати ще» spanning 2).
- **T4:**
  - Phone: a cream language pill; the airmail card (polaroid cover 216 px rotated −3° with tape; an 82 px postmark with the count rotated −12°; H1 27; welcome 16; two stamp buttons in 2 columns, ~92 px, rotated −2° and +1.5°; the notice).
  - Phone after contributing: a compact airmail strip; polaroid grids in 3 columns (gap 16×12, rotations −2…+2°); wish sticky notes; a sticky cream bar with a 5 px airmail stripe and 50 px stamps.
  - Desktop: a 1120 px card with the grid `284 | 1fr | 1px | 262` (cover, H1 40 with the welcome on lined paper, the stamps 120 px with a 96 px postmark), then 8-column polaroid grids (gap 24).
- **T5:**
  - Phone: a 48 px header with an Unbounded wordmark at 15; H1 52/0.98 (−0.035em); a 124 px emblem top-right; welcome 17; a glowing dot plus the count; a 60 px pill primary with glow; a 52 px ghost; the notice; a bento grid (3 columns, rows 117, gap 4, newest 2×2 with «Нове»).
  - Desktop: hero `1fr | 380` (H1 100/0.96, a 168 px emblem; aside with the count, primary 64 and ghost 54); 8-column bento grids (rows 158, dense).
- **T6:**
  - Phone: a 52 px header; 72 px of space; H1 46/1.04 (weight 500); welcome 17; count 14; a ruled action row (primary 48, underlined text button); the notice; sections at 20/500 with 72 px of space; 3-column grids, gap 12.
  - Desktop: a 576 px left column (H1 76/1.02, welcome 19, the ruled actions, the footer at the bottom) and a right main area (padding 104/80, 3-column grids, gap 28, section gap 88).

## Appendix B — Editor (from E-editor; copy is binding, uk)

**Desktop:**
- The panel is 380 px; sections have 20/24 padding, 1 px `#E4E5E1` separators and h2 headings at 16/600.
- The preview header reads «Попередній перегляд» / «Шаблон «{name}» з вашими налаштуваннями».
- The device toggle «Пристрій для перегляду» has «Телефон» (default) and «Комп’ютер».
- The link «Відкрити як гість» sits beside it.
- The caption reads «Прокрутіть перегляд, щоб побачити кадри гостей».
- The phone frame is a 390×844 page scaled to 0.7 in an 8 px `#141614` bezel (radius 42/34). The desktop frame is a 1440 px page scaled to fit, with a 1 px border and radius 12.

**Sections and copy:**
- **Шаблон:** names Класика, На весь екран, Журнал, Листівка, Вечірка, Мінімалізм.
- **Обкладинка:** «Завантажити», «Вибрати з кадрів», «Видалити обкладинку», and the helper «JPEG, PNG, WebP, HEIC або GIF до 50 МБ.»
- **Привітання:** «Гості побачать його під назвою колекції.», with a counter `n/160` in mono.
- **Фон:**
  - «Тип фону»: Колір / Градієнт / Зображення;
  - the swatches' `aria-label` is «Фон: {name}»;
  - the slider is «Затемнення» with an `n%` readout;
  - the T2 line reads «У цьому шаблоні фоном є обкладинка. Затемнення тримає білий текст читабельним.»
- **Акцент:**
  - the swatches' `aria-label` is «Акцент: {name}» (олівець, абрикос, слива, смарагд, електрик, лайм), plus «Свій колір»;
  - hints:
    - good: «Контраст {r}:1 — добре читається на фоні шаблону»;
    - small-text: «Контраст {r}:1 — дрібний текст акцентом стане трохи {темнішим|світлішим}, щоб читався.»;
    - merges: «Контраст {r}:1 — акцент зливається з фоном. Кнопки й текст лишаться читабельними, але краще обрати {світліший|темніший} відтінок.»
  - The footnote reads «Текст на кнопках стає білим або чорним — як краще читається.» The ratio uses a decimal comma in uk.
- **Шрифт:** the trigger reads «Шрифт: {name}. Змінити», the summary «Заголовки — X, текст — Y» (or «Заголовки й текст» when they are the same), and the helper «Усі шрифти зі списку мають кирилицю.»
- **Розташування:**
  - «Обкладинка»: Зверху / На весь екран / Збоку / Без обкладинки (T5's «Зверху» summary reads «Емблема»);
  - «Вирівнювання тексту»: Ліворуч / По центру;
  - «Кути»: Гострі / М’які / Округлі, with the radii below.

  | | tile | button | card | bar |
  |---|---|---|---|---|
  | sharp | 2 | 4 | 4 | 8 |
  | soft | 8 | 10 | 12 | 18 |
  | round | 14 | 999 | 22 | 30 |

**Lock reasons** (visible lines):
- **T1** cover: «У «Класиці» обкладинка стоїть над назвою, а на комп’ютері — у бічній колонці.»
- **T2** cover: «Цей шаблон завжди показує обкладинку на весь екран. Інші варіанти є в «Класиці» й «Мінімалізмі».»
- **T2** background: the line in the Фон section above.
- **T5** cover: «У «Вечірці» обкладинка стає круглою емблемою біля назви.»
- **T3, T4, T6:** written in the same style in Task 19, 20 or 22 for each locked group, e.g. «У «Журналі» текст завжди по центру.» and «У «Мінімалізмі» лише суцільний колір фону.»

**Status line:**
- «Чернетка — гості бачать попередню версію» (dot `#B83E26`);
- «Збережено — гості бачать цю версію» (dot `#2C7350`);
- «Зберігаємо…»;
- «Не вдалося зберегти» + «Повторити»;
- «Сторінку змінили в іншій вкладці» + «Показати останню версію».

Buttons: «Скинути зміни» and «Зберегти». «Зберегти» carries the SR suffix «, є незбережені зміни». The phone chip reads «Чернетка» / «Збережено».

**Phone:**
- The FAB «Налаштувати» is 52 px, an ink pill, with an 8 px `#F08766` dirty dot.
- The sheet is titled «Гостьова сторінка», with the close button «Закрити налаштування».
- The accordion rows show these summaries:
  - Шаблон: the name;
  - Обкладинка: the file or «Вибрано з кадрів, #041»;
  - Привітання: `n/160`;
  - Фон: «Колір» / «Градієнт» / «Зображення, 45%»;
  - Акцент: a chip and the hex;
  - Шрифт: the name;
  - Розташування: e.g. «На весь екран, ліворуч».
- Touch sizes on phones: segments 40, swatches 44, cover options 56, inputs 44, slider 44.
