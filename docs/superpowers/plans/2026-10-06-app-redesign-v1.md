# App redesign V1 «Графіт» — plan

**Date:** 2026-10-06. **Branch:** `feat/redesign-v1` → one PR into `dev`.
**Owner decision:** V1 «Графіт» of the three R2-based variants (boards `V1-dashboard`, `V1-collection`,
`V1-mobile` on the design canvas). Goals: less empty space, nicer colours, light motion, nothing
broken, no performance cost.

**Scope:** the admin app (shell, dashboard, collection page with all tabs, account) and the
sign-in landing, auth verify, accept-terms and legal pages. **Out of scope:** the guest page
templates (`apps/templates`) and the template surfaces; guest app chrome only inherits tokens.

## File map

| Area | Files |
| --- | --- |
| Tokens, type, motion | `packages/ui/src/styles/globals.css`, `packages/ui/src/fonts/*`, `packages/ui/.storybook/preview.tsx`, `apps/web/src/app/fonts.ts`, `apps/web/src/app/layout.tsx`, `apps/templates/src/styles.css` (pin the old radii for template roots only) |
| Primitives | `packages/ui/src/components/{button,input,select,toggle-group,tabs,badge,dialog,sheet,toast,dropdown-menu,frame,selection-bar,…}.tsx` + stories |
| Theme switch | `apps/web/src/theme/theme-switch.tsx` (PALETTE) |
| Shell | `apps/web/src/app/app/{app-shell,admin-nav,account-block}.tsx`, `apps/web/src/components/{admin-page,breadcrumbs}.tsx` |
| Dashboard | `apps/web/src/app/app/{collections-dashboard,collection-card}.tsx`, new `collection-row.tsx`, new `dashboard-view.ts` (+ test) |
| Collection page | `apps/web/src/app/app/collections/[id]/{collection-overview,collection-header}.tsx`, `content/content-tab.tsx`, `guest-page/guest-page-tab.tsx` |
| Sign-in, legal | `apps/web/src/app/login/*`, `auth/verify/*`, `accept-terms/*`, `legal/*`, `components/{site-header,site-footer,centered-page}.tsx` |
| Docs | `docs/design/DESIGN-SYSTEM.md` (V1 section, C marked superseded for the app chrome) |

## Tasks (one commit each)

1. **Tokens, fonts, motion primitives.** Zinc + indigo palette in both themes at the source
   (`globals.css`), AA checked by `Foundations/Contrast`. Golos Text (OFL, latin + cyrillic, the
   file already vetted in `apps/templates/fonts`) for the UI, Geist Mono for numbers; Geologica
   stays defined (preload off) only because templates read `--font-geologica`. Radii 6–8, almost
   no shadow, dense controls with a fine pointer from `md` (44px on phones and touch).
   Motion: `cubic-bezier(.2,0,0,1)`, 120–180ms, transform/opacity only; menus pop (140ms,
   −4px, .98), dialogs and sheets exit faster than they enter, toasts slide, press .97; a CSS-only
   sliding thumb for segmented controls and tabs (equal segments: index × 100%, no measuring).
   Reduced motion turns it all off. Stories updated where they pinned old colours.
2. **Shell.** Sidebar on the grey chrome (wordmark with the indigo mark, Колекції, Акаунт, legal
   links at the bottom, fold to a rail as today), content in a white bordered panel with a 48px top
   bar (who is signed in, «Вийти»). Phones: the same menu sheet, a 56px bar.
3. **Dashboard + view toggle.** Header with the mono usage line (active collections and storage,
   real data). Toolbar: «Усі / Активні / Архів» with counts and a sliding thumb, search, sort,
   «Таблиця / Плитки». Table (default) rows with cover, title + description, permission chips,
   frames (mono), date, status, «Поділитися», «⋯» (same items as today). Tiles = the card grid
   restyled. Phones (< 768px) always cards, toggle hidden. Choice in localStorage (try/catch),
   read after mount. Unit test for the stored-choice helper; e2e for the toggle and persistence.
4. **Collection page + tabs.** From `xl` a 248px mini-nav (cover, title/description with the
   pencil edit, status + date, «Поділитися», vertical tabs with icons and a sliding highlight),
   content beside it at full height; below `xl` the horizontal segmented tabs, restyled.
   «Вміст» toolbar: type chips with mono counts, «Оновити», sort, «Вибрати»; denser grid;
   selection scales tiles to .9, pops the check, the dark selection bar rises. Guest-page editor:
   the fixed-height workspace also subtracts the shell's bottom inset.
5. **Login, verify, accept-terms, legal.** V1 type and colour, content and behaviour unchanged.
6. **Docs.** DESIGN-SYSTEM.md V1 section; C superseded for the app chrome.

## Test plan

- `pnpm turbo run lint typecheck test build --force`, `pnpm format:check`.
- Storybook tests (`packages/ui`, both projects incl. reduced motion, axe).
- Full `pnpm e2e` (desktop Chrome, Pixel 7, iPhone 15). Test changes only where an expectation
  was purely visual; each is listed in the PR.
- New: dashboard view toggle e2e (default table, switch to tiles, remembered after reload, hidden
  on phones), unit test for the stored view.
- Screens at 360, 390, 768, 1280, 1440 in light and dark (Playwright), design review pass.
- First-load JS for `/app` and `/app/collections/[id]` before and after.
