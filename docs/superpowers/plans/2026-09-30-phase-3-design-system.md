# Stepler Phase 3 — Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Phase 4 slices a small, accessible, themed component set and the admin frame they will live in, so each slice builds screens instead of primitives.

**Architecture:**
- Components live in `packages/ui`. They are shadcn/ui (new-york) patterns over the Radix primitives already installed (`radix-ui` 1.6.7), styled only with the v4 tokens, each with a Storybook story whose play test and axe check run in CI.
- App wiring stays in `apps/web`: theme and language preference, the admin shell, the account menu.
- Scope is what slices 1–10 need first; anything owned by a single slice is built there.

**Tech Stack:**
- Phase 2 stack plus the v4 visual foundation (#6).
- Radix via `radix-ui`, `class-variance-authority`, `tailwind-merge`, Storybook 10 with `@storybook/addon-vitest` and `@storybook/addon-a11y`.
- New dependency: `lucide-react` (icons).

**Spec:**
- `docs/product/PRODUCT.md` §6.3, §15–17, §27 (journeys) and §28 (edge cases);
- `docs/product/acceptance-criteria.md` (Responsive, Upload);
- `docs/ux/README.md` ("Visual direction v4");
- ADR 0011 (i18n);
- `.claude/rules/04-frontend.md`, `05-ui-design.md`, `22-design-workflow.md`;
- `BOOTSTRAP.md` Phase 3–4.

## Global Constraints

- **Colours:** only the tokens in `packages/ui/src/styles/globals.css` (v4). No raw hex in components; brand illustrations (`StapledStack`) are the only exception.
- **Reusable components:**
  - live in `packages/ui/src/components/`;
  - are shadcn new-york based, built on a Radix primitive when one exists;
  - export named functions;
  - forward `className` through `cn()`;
  - set `data-slot`.
- **Text:** no user-facing text inside `packages/ui`. Labels, messages and aria labels come in as props or children (lint rule `react/jsx-no-literals` / `no-restricted-syntax`). Stories may use literals.
- **Stories:** every component has a story file with:
  - at least one `play` test;
  - axe passing (`a11y: { test: 'error' }`, already global);
  - a dark-theme story (`globals: { theme: 'dark' }`) when the component has colour states.
- **Interaction:**
  - touch targets ≥ 44px for anything tappable;
  - no hover-only behaviour;
  - visible focus (`focus-visible:ring-[3px] ring-ring/70`; the invalid state uses `ring-destructive/70`). Measured against card / page background: ring 3.49 / 3.31 light, 4.60 / 4.85 dark; destructive 3.19 / 3.03 light, 4.25 / 4.49 dark (WCAG 1.4.11 ≥ 3:1; `/50` was 2.33:1 on the card in light);
  - motion ≤ 300ms and disabled under `prefers-reduced-motion`.
- **Layout:** mobile-first; stories are checked at the 360, 768 and 1280 viewports (Task 1).
- **Copy:** web copy is in `apps/web/messages/{uk,en}.json` with key parity (existing test). Ukrainian is the default.
- **Dependencies:** exact pins, at least 1 day old (`minimumReleaseAge`). The only new package is `lucide-react` (ISC; latest version at least 1 day old at install time).
- **Branches:** work on `feat/phase-3-design-system` from `dev`; one commit per task; PR to `dev` at the end (docs/development/README.md → Branches and environments).

## Deliberate choices (for owner review)

1. **Theme preference:**
   - "System / Light / Dark", stored in a first-party cookie `st_theme` (1 year, `SameSite=Lax`, not `HttpOnly`, because the client switch writes it);
   - the server layout sets `<html data-theme>`, so the first paint is right;
   - not stored in the user profile in MVP.
2. **Language preference:**
   - a switch sets the existing `st_locale` cookie (ADR 0011);
   - for a signed-in admin it also `PATCH /api/v1/me { locale }`, which makes emails follow the choice;
   - on `/app`, when `me.locale` differs from the page locale, the shell writes the cookie and refreshes once. This keeps ADR 0011's "profile locale first" without middleware.
3. **Toasts** use Radix Toast (already installed), not a new library.
4. **Icons:** `lucide-react`. Inline SVGs remain only for brand art.
5. **Not in Phase 3.** The slice that needs each of these builds it on these primitives:
   - QR code (slice 2);
   - upload queue and file rows (slice 5);
   - gallery and media tiles (slice 7);
   - guest shell (slice 3);
   - date/number formatting helpers (first slice that shows dates).

## Review Focus

1. **Theme flash on first load.** With `st_theme=dark` while the OS is light, the server HTML must already carry `data-theme="dark"`, with no light flash. Tested in Task 9 (e2e: read the response HTML, then check the painted background).
2. **Switching language mid-form.** Changing the language on `/login` must keep the typed email and must not lose a pending Turnstile token. Tested in Task 10 (e2e).
3. **Dialog focus and escape.**
   - Opening a confirm dialog moves focus into it, the destructive button is not auto-focused, and Esc or Cancel closes it without firing `onConfirm`.
   - Focus returns to the trigger.
   - A failing `onConfirm` keeps the dialog open and shows the error.

   Tested in Task 6.
4. **Toasts and screen readers.** Toasts are announced (`role="status"`) and do not cover the primary action on a 360px screen. They pause while hovered or focused, and they never carry the only copy of an error the user must act on. Tested in Task 5.
5. **Long unbreakable text at 360px.** A 60-character email or collection name must not create horizontal scroll in `Card`, `Badge`, `CopyField`, `PageHeader` or the account menu. Each of those stories has a long-text variant that asserts `scrollWidth <= clientWidth` for the story root (Tasks 7 and 11).

---

### Task 1: Storybook foundations — theme toggle, viewports, token reference

**Files:**
- Modify: `packages/ui/.storybook/preview.ts` → rename to `preview.tsx`
- Create: `packages/ui/src/foundations/tokens.stories.tsx`
- Modify: `packages/ui/src/components/stapled-stack.stories.tsx` (add a `Dark` story using globals)

**Interfaces — produces:**
- **Global `theme`:** Storybook `globalTypes.theme` with `'light' | 'dark'` (default `'light'`), shown as a toolbar toggle. A decorator sets `document.documentElement.dataset.theme` to the global and restores the previous value on cleanup (`useEffect` return), so stories cannot leak a theme into each other (the Phase 3 visual-foundation leak).
- **Viewports:** `parameters.viewport.options` with `phone` (360×780), `tablet` (768×1024) and `laptop` (1280×800).

- [ ] **Step 1: Failing story tests.**
  - `Foundations/Tokens` renders swatches for every token in the v4 table in `docs/ux/README.md`, by name. The test asserts each `--background`…`--destructive` name is visible.
  - `StapledStack/Dark` runs with `globals: { theme: 'dark' }`; its play test asserts `document.documentElement.dataset.theme === 'dark'`.
  - `Button/Default` still has no `data-theme` afterwards (the leak check).
- [ ] **Step 2:** `pnpm --filter @stepler/ui test` → FAIL.
- [ ] **Step 3:** Implement the global, the decorator, the viewports and the token story. The swatches read `getComputedStyle(document.documentElement)`, so the story shows the live values of both themes.
- [ ] **Step 4:** PASS; `pnpm --filter @stepler/ui build-storybook` succeeds.
- [ ] **Step 5:** Commit `feat(ui): storybook theme toggle, viewports and token reference`.

### Task 2: Form primitives — Field, Textarea, Checkbox, Switch, RadioGroup

**Files:**
- Create in `packages/ui/src/components/`: `field.tsx`, `textarea.tsx`, `checkbox.tsx`, `switch.tsx`, `radio-group.tsx`, each with a `.stories.tsx`.

**Interfaces — produces:**
- **`Field`:** `({ id, label, description?, error?, children }: { id: string; label: ReactNode; description?: ReactNode; error?: ReactNode; children: (control: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }) => ReactNode })`.
  - It renders `Label` for `id`, then the control via the render prop, then description and error.
  - Ids are `${id}-description` / `${id}-error`, joined in `aria-describedby`; the error paragraph has `role="alert"`.
  - This is the one way forms in slices wire labels and errors.
- **`Textarea`:** `ComponentProps<'textarea'>`, `min-h-24`, the same focus and invalid styles as `Input`, and `field-sizing: content` with a `max-h-72`.
- **`Checkbox`, `Switch`:** Radix roots with shadcn styling. The hit area is ≥ 44px through a wrapping `label` pattern documented in the story.
- **`RadioGroup`, `RadioGroupItem`:** Radix, vertical by default. Items are full-row labels ≥ 44px tall; this is used for the gallery visibility mode (PRODUCT §7).

- [ ] **Step 1: Failing story tests.**
  - `Field/WithError`: the input's `aria-describedby` contains both the description and the error id, `aria-invalid="true"`, and the error text is found by `role=alert`.
  - `Textarea/Default`: type 3 lines, the value is kept, and the height grows (`clientHeight` increases).
  - `Checkbox/Toggle`, `Switch/Toggle`: `Space` toggles `aria-checked` and clicking the label toggles it.
  - `RadioGroup/Keyboard`: `ArrowDown` moves the selection and exactly one item has `aria-checked="true"`.
  - Every story: the control's bounding box height is ≥ 44.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS, then `pnpm --filter @stepler/ui lint typecheck`.
- [ ] **Step 5:** Commit `feat(ui): form primitives (field, textarea, checkbox, switch, radio group)`.

### Task 3: Icons and feedback — Alert, Spinner, Skeleton, Progress, EmptyState

**Files:**
- Modify: `packages/ui/package.json` (add `lucide-react` to `dependencies`, exact version).
- Create in `packages/ui/src/components/`: `alert.tsx`, `spinner.tsx`, `skeleton.tsx`, `progress.tsx`, `empty-state.tsx`, each with stories.
- Modify: `apps/web/src/app/login/login-form.tsx` and `app/auth/verify/verify-panel.tsx`: replace the ad-hoc error `<p>` boxes with `Alert`.

**Interfaces — produces:**
- **`Alert`:**
  - signature: `({ variant = 'info', title?, children, action? }: { variant?: 'info' | 'success' | 'warning' | 'error'; title?: ReactNode; children?: ReactNode; action?: ReactNode })`;
  - `role`: `alert` for `error`, `status` otherwise;
  - icons are from lucide (`Info`, `CircleCheck`, `TriangleAlert`, `CircleAlert`) with `aria-hidden`;
  - colours: `success` and `destructive` tokens; `warning` uses `accent-warm`/`accent-warm-foreground`.
- **`Spinner`:** `({ label }: { label: string })` renders `role="status"` with a visually hidden label; under reduced motion it is a static ring.
- **`Skeleton`:** a `div` with `bg-muted animate-pulse rounded-md`; the pulse is off under reduced motion; `aria-hidden`.
- **`Progress`:** `({ value, label, valueText? }: { value: number | null; label: string; valueText?: string })`. It uses Radix Progress; `null` means indeterminate; `aria-valuetext` is `valueText`.
- **`EmptyState`:** `({ icon?, title, description?, action? })`, centred, with `title` as an `h2` by default (`headingLevel?: 2 | 3`).

- [ ] **Step 1: Failing story tests.**
  - `Alert/Error` has `role=alert`, `Alert/Success` has `role=status`, and both pass axe in light and dark.
  - `Progress/Determinate` has `aria-valuenow="40"`; `Progress/Indeterminate` has no `aria-valuenow`.
  - `Spinner` exposes its label to `getByRole('status', { name })`.
  - `EmptyState/WithAction`: the action button is focusable, and the heading level follows the prop.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; replace the two web error boxes with `Alert variant="error"`. Web tests and e2e still pass: the `role=alert` text is unchanged.
- [ ] **Step 4:** PASS: `pnpm turbo run lint typecheck test --filter @stepler/ui --filter @stepler/web`.
- [ ] **Step 5:** Commit `feat(ui): alert, spinner, skeleton, progress and empty state; lucide icons`.

### Task 4: Display — Card, Badge, Separator

**Files:**
- Create in `packages/ui/src/components/`: `card.tsx` (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`), `badge.tsx`, `separator.tsx`, with stories.
- Modify: `apps/web/src/components/centered-page.tsx` and `app/login/sign-in-landing.tsx`: use `Card` instead of hand-written card classes.

**Interfaces — produces:**
- **`Card`** family: shadcn new-york. Radius 20px (`rounded-[20px]`), `shadow-card`, `bg-card`, padding `p-5 sm:p-7 lg:p-8` on `CardContent`. `CardTitle` renders `h2` by default (`asChild` allowed) with `font-display font-medium`.
- **`Badge`:** `({ variant = 'neutral' }: { variant?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' })`. It is not interactive and holds status text (e.g. collection "Active/Archived", link "Revoked"). Long text truncates with `title` passed by the caller.
- **`Separator`:** Radix Separator, decorative by default.

- [ ] **Step 1: Failing story tests.**
  - `Card/Default` is found by `getByRole('heading', { level: 2 })`.
  - `Badge/*` passes axe in light and dark for every variant (a contrast regression guard).
  - `Card/LongText` (Review Focus 5): a 60-character unbroken title at the `phone` viewport keeps `scrollWidth <= clientWidth`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; switch the two web usages to `Card`.
- [ ] **Step 4:** PASS; e2e still passes (`pnpm e2e`).
- [ ] **Step 5:** Commit `feat(ui): card, badge and separator`.

### Task 5: Toasts

**Files:**
- Create: `packages/ui/src/components/toast.tsx` (`ToastProvider`, `Toaster`, `useToast`), `toast.stories.tsx`.
- Modify: `apps/web/src/api/query-provider.tsx`: mount `ToastProvider` and `Toaster` once, inside the query provider.

**Interfaces — produces:**
- **`useToast(): { toast(input: { title: string; description?: string; variant?: 'info' | 'success' | 'error'; durationMs?: number }): void }`.**
  - State is React context, not a global store.
  - At most 3 toasts are visible; the oldest is dropped.
  - The default duration is 5000ms, and 8000ms for `error`.
  - Radix pauses the timer on hover and focus.
- **`Toaster`:**
  - Radix `Toast.Viewport` with `label` from a prop (i18n, e.g. "Сповіщення");
  - bottom-centre on phones (above the safe area, full width minus the 16px gutter), bottom-right from `sm`;
  - swipe to dismiss.
- **Usage rule** (written in Task 11's doc): toasts confirm completed actions; errors that need action stay inline (`Alert`/`Field` error).

- [ ] **Step 1: Failing story tests.**
  - `Toast/Success`: clicking the trigger shows a toast found by `role=status` with the title (Review Focus 4).
  - `Toast/Stack`: triggering 5 toasts leaves 3.
  - `Toast/Phone` (viewport `phone`): the toast's bottom edge is above `innerHeight - 16`, and it does not overlap a fixed bottom primary button placed in the story (`getBoundingClientRect` intersection is empty).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; mount in the web app.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(ui): toasts on radix toast`.

### Task 6: Overlays — Dialog, ConfirmDialog, DropdownMenu

**Files:**
- Create in `packages/ui/src/components/`: `dialog.tsx` (shadcn family), `confirm-dialog.tsx`, `dropdown-menu.tsx`, with stories.

**Interfaces — produces:**
- **`Dialog` family:** shadcn new-york over Radix Dialog. It is full-width minus 16px gutters on phones, `max-w-md` from `sm`; the close button has an aria-label from a `closeLabel` prop.
- **`ConfirmDialog`:**
  - signature: `({ open, onOpenChange, title, description, confirmLabel, cancelLabel, destructive?, onConfirm, errorMessage? }: { …; onConfirm: () => Promise<void> })`;
  - built on Radix AlertDialog;
  - while `onConfirm` is pending, both buttons are disabled and the confirm button shows `Spinner`;
  - on rejection the dialog stays open and renders `Alert variant="error"` with `errorMessage`;
  - initial focus goes to Cancel.
- **`DropdownMenu` family:** shadcn new-york over Radix. Items are ≥ 44px tall on touch (`min-h-11`) and include `DropdownMenuLabel`, `DropdownMenuRadioGroup` and `DropdownMenuSeparator`.

- [ ] **Step 1: Failing story tests** (Review Focus 3).
  - `ConfirmDialog/Destructive`: opening moves focus to Cancel; `Escape` closes; `onConfirm` is not called; focus returns to the trigger.
  - `ConfirmDialog/Pending`: clicking confirm with a never-resolving promise disables both buttons.
  - `ConfirmDialog/Failure`: a rejecting promise keeps the dialog open and shows `role=alert`.
  - `DropdownMenu/Keyboard`: `Enter` opens, `ArrowDown` moves, `Escape` closes and returns focus.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(ui): dialog, confirm dialog and dropdown menu`.

### Task 7: Tabs, ToggleGroup and CopyField

**Files:**
- Create in `packages/ui/src/components/`: `tabs.tsx`, `toggle-group.tsx`, `copy-field.tsx`, with stories.

**Interfaces — produces:**
- **`Tabs` family:** Radix. The list scrolls horizontally inside itself on phones (`overflow-x-auto`) and never widens the page; each trigger is ≥ 44px.
- **`ToggleGroup`, `ToggleGroupItem`:** Radix single-select segmented control (shape as in the v4 prototype header), used by the theme and language switches.
- **`CopyField`:**
  - signature: `({ label, value, copyLabel, copiedLabel, failedLabel }: { label: string; value: string; … })`;
  - a read-only input showing `value` (selected on focus) plus a copy button;
  - uses `navigator.clipboard.writeText`;
  - on success the button text becomes `copiedLabel` for 2s, and a visually hidden `aria-live="polite"` region announces it;
  - if the clipboard API is missing or throws, it selects the text and announces `failedLabel`.
  - For slice 2 (guest link sharing).

- [ ] **Step 1: Failing story tests.**
  - `CopyField/Copy`: with a stubbed `navigator.clipboard.writeText`, clicking calls it with the value, the live region contains `copiedLabel`, and after 2s the button label returns.
  - `CopyField/Unavailable`: with `clipboard` undefined, the input's `selectionEnd === value.length` and `failedLabel` is announced.
  - `CopyField/LongValue` (Review Focus 5): a 120-character URL at `phone` keeps `scrollWidth <= clientWidth`.
  - `Tabs/Phone`: 6 long tab labels do not widen the story root.
  - `ToggleGroup/Keyboard`: arrows move and `Space` selects.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(ui): tabs, toggle group and copy field`.

### Task 8: Page structure — PageHeader and responsive container

**Files:**
- Create: `packages/ui/src/components/page-header.tsx` + stories.
- Modify: `packages/ui/src/styles/globals.css`: add the `stepler-container` utility (`mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-10`, `max-w-[1320px]` from 1600px), and replace the repeated classes in the web app.

**Interfaces — produces:**
- **`PageHeader`:**
  - signature: `({ title, description?, actions?, back? }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode })`;
  - the title is an `h1` (`font-display`, clamp 1.5rem→2.25rem);
  - `actions` stack under the title on phones and align right from `sm`;
  - `back` is an optional link slot above the title.

- [ ] **Step 1: Failing story tests.**
  - `PageHeader/WithActions` at `phone`: the actions render below the title (`actions.top > title.bottom`); at `laptop`, on the same row.
  - `PageHeader/LongTitle` (Review Focus 5) has no horizontal overflow at `phone`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; use `stepler-container` in `SiteHeader`, `SiteFooter` and the landing.
- [ ] **Step 4:** PASS; e2e passes.
- [ ] **Step 5:** Commit `feat(ui): page header and container`.

### Task 9: Theme preference (System / Light / Dark)

**Files:**
- Create: `apps/web/src/theme/theme.ts` (`THEME_COOKIE = 'st_theme'`, `type ThemePreference = 'system' | 'light' | 'dark'`, `parseTheme(value: string | undefined): ThemePreference`), `apps/web/src/theme/theme.test.ts`, `apps/web/src/theme/theme-switch.tsx`.
- Modify: `apps/web/src/app/layout.tsx` (read the cookie with `cookies()`; render `<html data-theme={pref === 'system' ? undefined : pref}>`), `messages/{uk,en}.json` (`theme.label`, `theme.system`, `theme.light`, `theme.dark`).

**Interfaces — produces:**
- **`ThemeSwitch`** (client):
  - `ToggleGroup` with three items and lucide icons (`Monitor`, `Sun`, `Moon`), each with its label (a visually hidden label on phones);
  - on change it writes `st_theme` (`max-age=31536000; path=/; samesite=lax`) and updates `document.documentElement.dataset.theme` immediately; `system` removes the attribute;
  - no reload.
- **Consumed by** Tasks 10 and 11.

- [ ] **Step 1: Failing tests.**
  - Unit: `parseTheme` maps `'dark'`/`'light'`/`'system'`, and maps unknown or empty values to `'system'`.
  - e2e `e2e/tests/theme.spec.ts` (Review Focus 1): context with `colorScheme: 'light'` and cookie `st_theme=dark`.
    - `request.get('/')` HTML contains `data-theme="dark"`;
    - after `page.goto('/')`, the body's computed background is `rgb(19, 20, 27)` (`#13141B`).
  - e2e: choosing "Light" in the switch on a dark-OS context sets the light background without reload and survives `page.reload()`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS (`pnpm --filter @stepler/web test`, `pnpm e2e`).
- [ ] **Step 5:** Commit `feat(web): theme preference with no flash`.

### Task 10: Language switch

**Files:**
- Create: `apps/web/src/i18n/language-switch.tsx`, `apps/web/src/i18n/set-locale.ts`.
- Modify: `apps/web/src/app/app/app-shell.tsx` (the profile→cookie sync); `messages/{uk,en}.json` (`language.label`, `language.uk` = "Українська", `language.en` = "English", with UA/EN short labels).

**Interfaces — produces:**
- **`setLocaleCookie(locale: Locale): void`** writes `st_locale` (1 year, `path=/`, `samesite=lax`).
- **`LanguageSwitch`** (client):
  - `ToggleGroup` UA/EN with `lang` attributes on the items;
  - on change: `setLocaleCookie`; if a `me` query exists in the TanStack cache, `apiRequest('/me', { method: 'PATCH', body: { locale } })`; then `router.refresh()`;
  - a PATCH failure shows an error toast and still switches the UI.
- **`AppShell`:** after `me` loads, if `me.locale !== useLocale()`, it calls `setLocaleCookie(me.locale)` and `router.refresh()` once, guarded by a ref so it cannot loop.

- [ ] **Step 1: Failing tests** (e2e `e2e/tests/language.spec.ts`).
  - **Review Focus 2:** on `/login`, type an email, switch to EN; the heading becomes English, the email field keeps its value, and the submit button becomes enabled again once Turnstile has a token.
  - Signed-in admin switches to EN on `/app`; after reload it is still EN, and the next magic-link email subject is "Sign in to Stepler" (Mailpit).
  - A cookie `st_locale=uk` with a profile `locale=en` makes `/app` render English after at most one refresh.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): language switch synced with the admin profile`.

### Task 11: Admin shell and account menu; public header tools

**Files:**
- Create: `apps/web/src/app/app/account-menu.tsx`, `apps/web/src/app/app/admin-nav.tsx`.
- Modify: `apps/web/src/app/app/app-shell.tsx`, `apps/web/src/components/site-header.tsx` (a `tools` slot rendering `LanguageSwitch` + `ThemeSwitch` on public pages), `messages/{uk,en}.json` (`app.nav.collections`, `app.account`, `app.menu`).

**Interfaces — produces:**
- **`AdminNav`:** `({ items }: { items: { href: string; label: string }[] })`.
  - Desktop (`md`+): inline links in the header, the active one with `aria-current="page"`.
  - Phones: a menu button that opens a `DropdownMenu` with the same links.
  - Phase 3 has one item, "Колекції" → `/app`. Slices add theirs.
- **`AccountMenu`:** a `DropdownMenu` whose trigger is the email (truncated, with a `title` attribute). It contains:
  - a `DropdownMenuLabel` with the full email;
  - a language radio group and a theme radio group (same actions as the switches);
  - a separator;
  - "Вийти", which calls logout and shows a toast on failure.

  It replaces the current email + outline button in the header.
- **Public pages** (`/`, `/login`, `/auth/verify`) show the language and theme switches in the header. On phones the theme switch collapses to one cycling button, as in the v4 prototype.

- [ ] **Step 1: Failing tests.**
  - e2e `auth.spec.ts`: sign-out goes through the account menu (`getByRole('button', { name: email })` → menuitem "Вийти").
  - e2e keyboard: `Tab` reaches the account menu, `Enter` opens it, `ArrowDown` reaches "Вийти", `Enter` signs out.
  - e2e at 360px with a 60-character email (Review Focus 5): no horizontal scroll on `/app`, and the trigger is truncated (`scrollWidth > clientWidth` on the text span only).
  - The `/app` nav link has `aria-current="page"`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS (`pnpm e2e` on all three projects).
- [ ] **Step 5:** Commit `feat(web): admin shell with nav and account menu; header switches`.

### Task 12: Design-system doc, flaky test and the branch PR

**Files:**
- Create: `docs/ux/design-system.md`.
- Modify: `docs/ux/README.md` (link), `BOOTSTRAP.md` (Phase 3 status), `e2e/tests/auth.spec.ts` (if the flake is found).

**Interfaces — produces:**
- **`docs/ux/design-system.md`:**
  - the component inventory: name, purpose, when to use and when not, and the story path;
  - rules:
    - a reusable component goes in `packages/ui` only when a second use exists or the pattern is stable;
    - text is always passed in;
    - toasts confirm, inline alerts explain;
    - every destructive action uses `ConfirmDialog`;
    - icons come from lucide;
  - how to add a component (shadcn CLI with `packages/ui/components.json`, then restyle to tokens).
- **The flaky `mobile-safari` "no horizontal scroll" e2e** (seen once in #14):
  - run it 20 times with `--repeat-each=20 --project=mobile-safari`;
  - if it fails, fix the cause (likely measuring before fonts or animations settle: wait for `document.fonts.ready` and use `reducedMotion: 'reduce'` for that test);
  - if it does not reproduce, record the attempt in the PR.

- [ ] **Step 1:** Write the doc.
- [ ] **Step 2:** Flake: repeat-run, fix or record.
- [ ] **Step 3:** Full verification: `pnpm format:check && pnpm turbo run lint typecheck test build build-storybook && pnpm e2e`, all passing. Take screenshots of `/`, `/login` and `/app` at 360 and 1280, light and dark; attach them to the PR.
- [ ] **Step 4:** Commit `docs: design system inventory and rules; phase 3 status`. Open the PR `feat/phase-3-design-system` → `dev`.

## Checkpoints

- **After Task 8** (all primitives): an independent review of `packages/ui` — accessibility, token use, API consistency, story coverage.
- **After Task 12:** a whole-branch review, then fixes, then the PR. Promote to `stage` with a `dev → stage` PR and check the three pages on staging, light and dark.

## Out of scope for Phase 3

- QR code, upload queue and file rows, gallery and media tiles, guest shell: built by slices 2, 5, 7 and 3 on these primitives.
- Storing the theme in the user profile.
- Custom domain and production.
- Date/number formatting.
- Marketing pages.
