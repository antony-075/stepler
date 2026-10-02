# Design system

The reusable UI of Stepler lives in `packages/ui` (`@stepler/ui`): shadcn/ui (new-york) components on Radix primitives, styled with Tailwind CSS 4 and the design tokens in `packages/ui/src/styles/globals.css`. Every component has a story in Storybook (`pnpm storybook`, http://localhost:6006) with `play` tests and axe checks that run in `pnpm test`.

This page describes what is implemented. The visual direction is C «Контактний аркуш» (owner decision 2026-10-02, [ADR 0015](../architecture/decisions/0015-visual-direction-c-fonts-frame-numbers.md)); its full specification, including parts not built yet, is [docs/design/DESIGN-SYSTEM.md](../design/DESIGN-SYSTEM.md). The migration from v4 follows its §10.4 step by step; until it is finished, some components below still carry v4 styling (noted where it matters).

Import a component by its file: `import { Button } from '@stepler/ui/components/button'`. The stylesheet is `@stepler/ui/styles.css`.

## Component inventory

Story paths are Storybook titles; the files are `packages/ui/src/components/<name>.stories.tsx`. "Text props" are the required strings the caller must pass (translated), because `packages/ui` holds no copy.

| Component | Purpose | Use when / not when | Key props (text props in bold) | Story |
| --- | --- | --- | --- | --- |
| `Button` (`buttonVariants`, `closeButtonClassName`) | Actions and links styled as buttons | Any action. `link` variant for inline text links that act; a real navigation link is `asChild` around `<a>`/`Link`. Not for toggles (ToggleGroup, Switch) | `variant`: default, destructive, outline, secondary, ghost, link; `size`: default (44px), `sm` (36px, dense pointer-first layouts only, never the primary action on touch), `lg` (48px), `icon` (44px, needs `aria-label`); `asChild` | Components/Button |
| `Input` | Single-line text field, 48px, 16px font (no iOS zoom) | Inside `Field`. Not for multi-line text | Native input props; `aria-invalid` from Field | Components/Input |
| `Textarea` | Multi-line field that grows with its text up to `max-h-72` | Notes, descriptions. Inside `Field` | Native textarea props | Components/Textarea |
| `Label` | Radix label; dims when it wraps a disabled control | Used by Field, CopyField and Checkbox/Switch rows. Rarely on its own | Radix Label props | none (covered by Field, Checkbox, Switch) |
| `Field` | Wires a label, a hint and an error to one control (`id`, `aria-describedby`, `aria-invalid`); error has `role="alert"` | Every form control a `<label for>` can name (Input, Textarea, Checkbox, Switch, a Radix trigger). **Not** RadioGroup | `id`, **`label`**, `description`, `error`, `children: (controlProps) => ReactNode` | Components/Field |
| `Checkbox` | 20px box | Inside a `Label` row of `min-h-11` so the whole row is the 44px target | Radix Checkbox props | Components/Checkbox |
| `Switch` | 24px track, on/off setting that applies at once | Inside a `Label` row of `min-h-11`. Not for a choice submitted with a form button (use Checkbox) | Radix Switch props | Components/Switch |
| `RadioGroup`, `RadioGroupItem` | One choice from a few visible options; each item is a full-row 44px label | 2–5 options that should all be visible. Name it with `aria-labelledby` or `fieldset`/`legend`, never `Field`. Not for a segmented switch (ToggleGroup) | Radix props; vertical by default; item `children` is its name | Components/RadioGroup |
| `Select` family (`SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`) | One choice from a list behind an input-like trigger (theme and language on `/app/settings`). 44px trigger with the Input's border, 12px radius and focus ring, chevron; the list is a popover card (`popper`, at least the trigger's width, never wider than the viewport minus the gutters) with 44px items and a primary check on the selected one | Settings and form choices where the options need not all be visible. Name the trigger with `aria-labelledby` (the row label) or `aria-label`; hint via `aria-describedby`. Items inside `SelectGroup`. An option's icon goes in its `children`, so the trigger shows it too | Radix Select props; content `position` popper, `sideOffset` 4, `collisionPadding` 16; item `lang` | Components/Select |
| `ToggleGroup`, `ToggleGroupItem` | Single-select segmented control that always has a value (not used by the app at the moment; settings use `Select`). Recessed track (`--control-track` + inset hairline), raised thumb (`--control-thumb`, `--shadow-thumb`) drawn 3px inside each 44px item, selected icon `text-primary` | Small sets of immediate settings. Needs `aria-label`/`aria-labelledby`. Not for form choices (RadioGroup) or navigation (Tabs) | `value`/`defaultValue`/`onValueChange` (never called with `''`); item `icon` (decorative, before the visible label), `lang` | Components/ToggleGroup |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Switch between views of one page; the list scrolls inside itself when it does not fit | Sibling views on one page. Not for site navigation | Radix Tabs props | Components/Tabs |
| `CopyField` | Read-only value with a copy button and polite announcement; selects the value when the clipboard fails | Guest links and other values to share. Not for editable values | **`label`**, `value`, **`copyLabel`**, **`copiedLabel`**, **`failedLabel`** | Components/CopyField |
| `Alert` | Inline message in the flow; `role="alert"` for `error`, `status` otherwise | Errors and warnings the user must read or act on, with an optional `action` (Retry). Not for confirming a finished action (toast) | `variant`: info, success, warning, error; `title`, `children`, `action` | Components/Alert |
| `ToastProvider`, `Toaster`, `useToast` | Short, auto-dismissing confirmation of a completed action; max 3; error toasts are assertive and last 8s | "Saved", "Link copied". Never the only copy of an error the user must act on | Provider **`announcementLabel`**; Toaster **`label`**, **`closeLabel`**; `toast({ title, description?, variant?, durationMs? })` | Components/Toast |
| `Dialog` family (`DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`, `DialogTrigger`) | Modal task or detail; full width minus gutters on phones, `max-w-md` from `sm`, scrolls inside | A short focused task. Not for confirming a destructive action (ConfirmDialog) | `DialogContent` **`closeLabel`**, `showCloseButton` | Components/Dialog |
| `ConfirmDialog` | Radix AlertDialog that asks before an action; focus starts on Cancel; closes only after `onConfirm` resolves; shows `errorMessage` on reject | Every destructive action, and any other action that needs an explicit yes. Can be opened from a `DropdownMenuItem` (focus returns to the menu trigger) | `open`, `onOpenChange`, **`title`**, **`description`**, **`confirmLabel`**, **`cancelLabel`**, **`pendingLabel`**, **`errorMessage`**, `onConfirm: () => Promise<void>`, `destructive` | Components/ConfirmDialog (`FromMenu`) |
| `DropdownMenu` family (`Content`, `Item`, `CheckboxItem`, `RadioGroup`, `RadioItem`, `Label`, `Separator`, `Group`, `Trigger`, `Portal`) | Menu of actions behind a trigger; 44px items; keyboard focus ring | Secondary actions (row menus, account menu). Not for the primary action or for navigation that should be visible | Item `variant`: default / destructive, `inset`; content `sideOffset` 4, `collisionPadding` 16 | Components/DropdownMenu |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | The 20px-radius surface; padding per section | Grouped content or one-step forms (`CardContent` alone is complete). `CardTitle` is `h2` (`asChild` for another level) | Div props | Components/Card |
| `Badge` | One-line status text with a dot; truncates | Short status (Active, Revoked). Pass the full text as `title` too. Never a control | `variant`: neutral, info, success, warning, danger | Components/Badge |
| `Separator` | Hairline | Visual division; `decorative={false}` only when assistive technology should hear the separation | Radix props, `orientation` | Components/Separator |
| `Spinner` | Indeterminate activity; `role="status"`; static ring under reduced motion | Short waits inside a control or region | **`label`** (sr-only) | Components/Spinner |
| `Skeleton` | Placeholder shape while content loads; `aria-hidden` | Layout-preserving loading. Announce loading elsewhere (Spinner, `aria-busy`) | Div props | Components/Skeleton |
| `Progress` | Determinate or indeterminate (`value={null}`) bar | Uploads and other measurable work | `value` (0–100 or `null`), **`label`**, `valueText` | Components/Progress |
| `EmptyState` | Centered "nothing here yet" with an optional next step | Empty lists and galleries. Not for errors (Alert) | **`title`**, `description`, `icon` (decorative), `action`, `headingLevel`: 2 / 3 | Components/EmptyState |
| `PageHeader` | The page's only `h1` (`text-balance`), description, actions (under the title on phones, right from `sm`), optional back link | The top of every page. Admin pages use `size="compact"` (24px); public pages keep the default fluid size | **`title`**, `description`, `actions`, `back`, `size`: default, compact | Components/PageHeader |
| `BrandMark` | The Stepler mark (decorative SVG) | Inside a labelled link or next to the wordmark | SVG props | Components/BrandMark |
| `StapledStack` | The hero illustration (photo, video, PDF, note, QR, staple); motion runs once and is off under reduced motion | The sign-in landing only; the one place raw colours are allowed | **`label`**, **`photoCaption`**, **`videoCaption`**, **`videoDuration`**, **`documentKind`**, **`documentTitle`**, **`note`**, **`noteAuthor`** | Components/StapledStack |

`Foundations/Tokens` shows the colour tokens with their live values in the current theme; `Foundations/Contrast` computes the contrast pairs of the token tables from the live values and fails when one is under its minimum. `Tests/ReducedMotion` (hidden from the sidebar) holds the reduced-motion regression stories.

Web-only building blocks (not in `packages/ui`, one use each): `ThemeProvider` / `useThemePreference` and `ThemeSwitch` in `apps/web/src/theme/`, `useChangeLocale` and `LanguageSwitch` in `apps/web/src/i18n/language-switch.tsx`.

## Rules

### What goes in `packages/ui`

- A component goes in `packages/ui` only when a second use exists or the pattern is stable (a primitive, a page scaffold). One-off UI stays in the app next to its page.
- No user-facing text in `packages/ui`. Every label, message and accessible name comes in as a prop or children; the lint rules `react/jsx-no-literals` and `no-restricted-syntax` (`packages/config/eslint/react.js`) fail the build otherwise. Stories and tests may use literals. Web copy lives in `apps/web/messages/{uk,en}.json`.
- Colours come only from the tokens below; no raw hex in components (StapledStack's illustration is the only exception).
- Components export named functions, forward `className` through `cn()` and set `data-slot`.

### Feedback

- **Toasts confirm, inline explains.** A toast confirms an action that has completed ("Saved"). Anything the user must read or act on is an inline `Alert` or a `Field` error; a toast is never its only copy.
- **Every destructive action uses `ConfirmDialog`** (with `destructive`). Opening it from a `DropdownMenuItem` is supported: it remembers the menu's trigger and returns focus there on close, also under reduced motion when the menu unmounts at once.
- **Never disable a focused control inside a dialog.** A `disabled` button drops focus to the page, out of the focus trap. Use `aria-disabled` and ignore the click, as ConfirmDialog does while pending (the Button styles `aria-disabled` like `disabled`).

### Icons

- Icons come from `lucide-react`, imported by the plain name (`import { Copy } from 'lucide-react'`, not `CopyIcon` or `LucideCopy`).
- Decorative icons get `aria-hidden="true"`. An icon-only button gets its name from `aria-label` (a prop). ToggleGroupItem labels are always visible. Icons inside a `SelectItem` are decorative too: the text names the option.

### Motion

- State animations (open/close of Dialog, ConfirmDialog, DropdownMenu, Select, Toast) use `motion-safe:` variants, for example `motion-safe:data-[state=open]:animate-in`. The reason is specificity: `data-[state=open]:animate-in` is (0,2,0) and outranks `motion-reduce:animate-none` (0,1,0), so the animation still ran under reduced motion. `motion-safe:` never emits the animation in the first place.
- Simple transitions may keep `motion-reduce:transition-none` / `motion-reduce:animate-none` when nothing outranks them (Button, Input, Switch, Skeleton, Spinner, Progress).
- Motion stays at or under 300ms.
- Regression tests: stories tagged `reduced-motion` run only in the `storybook-reduced-motion` Vitest project (`packages/ui/vitest.config.ts`), whose Playwright context emulates `prefers-reduced-motion: reduce`. Both projects run in `pnpm test`. Tag a story `['!dev', '!autodocs', 'reduced-motion']` and first assert that the media query matches (see `reduced-motion.stories.tsx`), so a misconfigured project fails instead of passing vacuously.

### Focus, touch and layout

- Focus ring: `focus-visible:ring-[3px] focus-visible:ring-ring/70` (the base outline is `outline-ring/70`); invalid and destructive controls use `ring-destructive/70`. Measured ratios are in the token table; `/50` was 2.33:1 on the card in light and failed WCAG 1.4.11. Menu items use a solid inset `ring-ring` because the hover background alone is about 1.2:1.
- A `DropdownMenu` session that saw pointer input returns focus to its trigger with `focus({ focusVisible: false })`, so no ring sticks after a mouse user closes the menu; a keyboard-only session keeps the ring. Safari ignores the option and may still show it. `Select` does the same after a pointer-opened list closes (a pick, Escape or an outside click).
- Surfaces drawn straight on the page (ghost buttons, the account menu trigger) hover and open with `bg-foreground/[0.06]`, not `bg-muted`: the cool grey clashes with the warm `stepler-atmosphere`. Cards and inputs keep `bg-muted`.
- Touch targets are at least 44×44px. Button `sm` (36px) is not for touch; Checkbox and Switch sit in a `min-h-11` Label row.
- A fixed bottom bar (for example an upload bar) gets `data-toast-avoid`; the Toaster lifts its viewport above it while toasts are open.
- `RadioGroup` is not wrapped in `Field`: it is a `role="radiogroup"` div that `<label for>` cannot name. Use `aria-labelledby` or `fieldset`/`legend`.
- `CardContent` wraps long unbroken text only inside `p` elements (`[&_p]:[overflow-wrap:anywhere]`); flex rows and controls keep their normal sizing, so put free text in a `p`.
- `ToggleGroup` never deselects: pressing the selected item keeps it selected, and `onValueChange` is never called with `''`.
- Language options keep the visible text as the accessible name (WCAG 2.5.3 Label in Name) and carry `lang` on the item and on the text, because the trigger shows a copy of the text outside the option: `<SelectItem value="uk" lang="uk"><span lang="uk">Українська</span></SelectItem>`. No `aria-label` that drops what is on screen.
- Page width: the `stepler-container` utility (1240px content, 1320px from 1600px, gutter 16 / 24 / 40px at base / `sm` / `lg`). The gutter is `--stepler-gutter`, so a child can bleed into it with `-mx-(--stepler-gutter) px-(--stepler-gutter)`.
- Turnstile renders `compact` below 300px container width (centred in the form), `flexible` otherwise, so the widget never overflows the card.
- Page atmosphere: the `stepler-atmosphere` utility (key light, cool fill, dot grid). Decorative; never behind text that needs contrast.
- **Admin vs public surface.** Public pages (`/`, `/login`, `/auth/verify`) sit on `stepler-atmosphere` with the floating brand header. The admin area (`/app/*`) is flat `bg-background` in every state (loading, error, loaded) with `SiteHeader variant="app"`: 64px, `border-b border-border`, on the same `stepler-container` as the page so the brand, the `h1` and the content share one left edge. Admin pages use `PageHeader size="compact"`, `pt-8 pb-16 lg:pt-10 lg:pb-20` (`pt-5 lg:pt-8` when the header has a 44px back link, so the title lands at the same height), and group content in panels (`rounded-2xl border bg-card shadow-xs`, rows split by `divide-y`) rather than floating cards.
- Admin header: no section nav (owner decision, 2026-10-01). The brand on the left links to `/app` (the collections; public pages link it to `/`), the account menu sits on the right. Each destination has one entry point: settings live only in the account menu, and a page below the collections offers a back link (`PageHeader` `back`) to `/app`.
- Account menu: the trigger is a 32px avatar initial (`bg-primary/14 text-primary`, decorative) plus the email from `md` (`max-w-[26ch]`, truncated, `title`); on phones the email is `sr-only`, so it stays the accessible name. The menu label is two lines: "Signed in as" (small, muted) above the truncated address, then Settings (gear icon), a separator and Sign out.
- Settings page: one centred column (`mx-auto max-w-[640px]`) with a compact `PageHeader` whose `back` slot links to the collections (`ArrowLeft`, 14px/600 muted, 44px tall). Sections are an `h2` plus a muted description over one panel.
- Settings rows: label (15px/600) and a helper line (14px muted, `max-w-[40ch]`, linked with `aria-describedby`) on the left, a `Select` on the right from 600px (`grid-cols-[minmax(0,1fr)_auto]`, the select 12rem wide so the panel's controls line up), labelled by the row label (`aria-labelledby`); on phones they stack and the select fills the row. Theme options carry their icon (`Monitor`, `Sun`, `Moon`), which the trigger shows too.
- Disabled primary button: solid `bg-muted text-muted-foreground` (5.42 / 6.35), not half-transparent primary, so a reason such as "Wait, checking…" stays readable. Other variants keep `opacity-50`.
- Stories are checked at the Storybook viewports `phone` (360), `tablet` (768) and `laptop` (1280).

### Theme and language

- Theme: `<html data-theme="light|dark">`, rendered by the server from the `st_theme` cookie (1 year, `SameSite=Lax`, not `HttpOnly`), so the first paint is right. No attribute means "follow the system" (`prefers-color-scheme`). In the app, read and change it with `ThemeProvider` / `useThemePreference()` (`apps/web/src/theme/theme-provider.tsx`); do not write the cookie or the attribute directly.
- Where: both switches are on `/app/settings` (Appearance panel, reached from the account menu). The header has none; public pages show the brand only and follow the cookies (or the OS / `Accept-Language`).
- Browser chrome: the root layout sets `theme-color` to `--background` for `prefers-color-scheme: light` and `dark`. It follows the system setting, not an explicit choice in the cookie.
- Language: switch with `useChangeLocale()` (`apps/web/src/i18n/language-switch.tsx`). It writes the `st_locale` cookie, saves the choice to the profile with `PATCH /me` when the `me` query is cached (always the case inside `/app`), then refreshes the server tree while keeping client state. A failed save shows a toast; the page still switches.

## Tokens

All custom properties in `packages/ui/src/styles/globals.css`, direction C (specification: [DESIGN-SYSTEM.md §2](../design/DESIGN-SYSTEM.md#2-токены)). Dark values apply under `prefers-color-scheme: dark` (unless `data-theme="light"`) and under `data-theme="dark"`. Tailwind exposes the colours as `bg-*`, `text-*`, `border-*` and so on through `@theme inline`; shadcn names are kept.

Contrast is WCAG 2.x (sRGB relative luminance), light / dark, computed from the hex values. Text pairs need 4.5:1, non-text (field edges, focus ring, button shapes) 3:1. `Foundations/Contrast` recomputes every pair below from the live values in both themes and fails `pnpm test` when one drops under its minimum.

### Surfaces and text

| Token | Light | Dark | Role | Contrast (light / dark) |
| --- | --- | --- | --- | --- |
| `--background` | `#F0F1EE` | `#141615` | the light table: page | |
| `--card` (sheet) | `#FFFFFF` | `#1C1F1D` | grids, panels, fields | |
| `--popover` (raised) | `#FFFFFF` | `#232724` | menus, select, toast, dialog; in dark lighter than a sheet instead of a shadow | |
| `--foreground` (`--card-`, `--popover-foreground`) | `#141614` | `#E9EBE6` | text, ink | on background 16.04 / 15.14; on card 18.19 / 13.85; on popover — / 12.61 |
| `--muted-foreground` | `#5A5D58` | `#9CA099` | secondary text, time, hints | on background 5.90 / 6.84; on card 6.68 / 6.26; on muted 5.32 / 5.48 |
| `--muted` | `#E4E6E1` | `#262A27` | fills: skeleton, disabled, frame placeholder | |
| `--border` | `#D6D8D2` | `#2D312E` | grid lines, hairlines (decorative) | on card 1.44 / 1.26 (never identifies a control) |
| `--input` | `#83877F` | `#6C716B` | field, checkbox and outline-button edges, empty-frame dash | on card 3.66 / 3.33; on background 3.23 / 3.65; on popover — / 3.04 |

### Actions

| Token | Light | Dark | Role | Contrast (light / dark) |
| --- | --- | --- | --- | --- |
| `--primary` (ink) | `#141614` | `#E9EBE6` | admin primary button | shape on background 16.04 / 15.14 |
| `--primary-hover` / `--primary-active` | `#2E312D` / `#454944` | `#FFFFFF` / `#CDD0CA` | ink on hover / pressed | |
| `--primary-foreground` | `#FFFFFF` | `#141615` | text on ink | on primary / hover / active 18.19 / 13.18 / 9.17 and 15.14 / 18.18 / 11.66 |
| `--pencil` | `#B83E26` | `#F08766` | wax pencil: guest primary, selection, "new", focus, active tab | text on background 4.93 / 7.24; on card 5.59 / 6.62 |
| `--pencil-hover` / `--pencil-active` | `#A33520` / `#8E2D1B` | `#F59B7E` / `#DD7556` | | |
| `--pencil-foreground` | `#FFFFFF` | `#141615` | text on pencil | 5.59 / 6.80 / 8.26 and 7.24 / 8.54 / 5.85 |
| `--pencil-soft` | `#FBECE8` | `#33201A` | selected row or chip | foreground on it 15.82 / 12.84; pencil 4.86 / 6.14 |
| `--link` (violet) | `#5A4A8C` | `#B6A8E8` | links (underlined), information | on background 6.63 / 8.44; on card 7.52 / 7.72 |
| `--link-hover` | `#463870` | `#CABFF0` | | on background 8.99 / 10.58 |
| `--info-soft` | `#EEEBF5` | `#242036` | info Alert | foreground 15.45 / 13.10; link 6.39 / 7.31 |
| `--destructive` | `#A3203A` | `#FF8DA0` | errors, deletion; always with an icon and a word | on background 6.56 / 8.28; on card 7.43 / 7.58 |
| `--destructive-hover` / `--destructive-active` | `#8A1A31` / `#731429` | `#FFA3B3` / `#F07A8E` | | |
| `--destructive-foreground` | `#FFFFFF` | `#141615` | text on destructive | 7.43 / 9.24 / 11.28 and 8.28 / 9.64 / 6.82 |
| `--destructive-soft` | `#F8E7EA` | `#33191E` | error Alert | foreground 15.25 / 13.47; destructive 6.23 / 7.37 |

Pencil and destructive are 1.33 / 1.14 apart in luminance: they are never told apart by colour (destructive always has an icon and a word; pencil never means an error). Ink and pencil buttons are not placed side by side (3.25 / 2.09).

### Status and states

| Token | Light | Dark | Role | Contrast (light / dark) |
| --- | --- | --- | --- | --- |
| `--success` | `#2C7350` | `#77C79C` | "added", active link | on card 5.71 / 8.26; on success-soft 4.93 / 7.51 |
| `--success-soft` | `#E5F1EA` | `#172A20` | success Alert | foreground 15.68 / 12.60 |
| `--warning` | `#8A6100` | `#E2B550` | large file, paused link | on card 5.54 / 8.68; on warning-soft 4.80 / 8.03; on `--hover` exactly 4.50, so warning text never sits on a hover fill |
| `--warning-soft` | `#F7EEDA` | `#2B2414` | warning Alert | foreground 15.76 / 12.81 |
| `--hover` | `#E7E8E5` | `#1F211F` | hover of things on the page (foreground 4% / 5% over background) | foreground 14.79 / 13.50; pencil 4.55 / 6.45 |
| `--hover-card` | `#F6F6F6` | `#262927` | hover inside a sheet (rows, menu items) | foreground 16.83 / 12.24 |
| `--ring` | `var(--pencil)` | `var(--pencil)` | focus ring, 2px solid, offset 2px | on background 4.93 / 7.24; on card 5.59 / 6.62; on popover — / 6.03; on pencil-soft 4.86 / 6.14 |

### Overlays and media

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--overlay` | `rgb(20 22 20 / 0.48)` | `rgb(0 0 0 / 0.64)` | under a dialog or sheet |
| `--scrim` | `linear-gradient(to top, rgb(0 0 0 / 0.60), transparent 70%)` | same | under text or icons over a photo (white on it ≥ 4.74 in the worst case) |
| `--veil` | `rgb(255 255 255 / 0.68)` | `rgb(20 22 21 / 0.68)` | "not uploaded yet" over a frame; never text on it |
| `--viewer` / `--viewer-foreground` | `#0F110F` / `#E9EBE6` | same | full-screen frame viewer (15.79) |

### Shape, elevation, layers, motion and type

| Token | Value | Role |
| --- | --- | --- |
| `--radius-frame` / `-sheet` / `-control` / `-dialog` | 2 / 4 / 8 / 12px (`rounded-frame` …) | photo in a frame, thumbnails, QR / sheets, panels, Alert / buttons, fields, chips, menu items, toast / dialog, bottom sheet. Pills only for dots, avatars and switch thumbs |
| `--shadow-popover` | light `0 8px 24px -12px rgb(20 22 20 / 0.24), 0 0 0 1px rgb(20 22 20 / 0.06)`; dark none (popover colour + 1px border) | menus, select, toast (`shadow-popover`) |
| `--shadow-dialog` | light `0 24px 48px -16px rgb(20 22 20 / 0.32)`; dark none | dialog, sheet (`shadow-dialog`) |
| `--shadow-print` | light `0 1px 1px rgb(20 22 20 / 0.10), 0 8px 18px -8px rgb(20 22 20 / 0.28)`; dark `inset 0 1px 0 rgb(233 235 230 / 0.08), 0 10px 24px -10px rgb(0 0 0 / 0.6)` | only the top print of the guest success stack |
| `--z-base` … `--z-skip` | 0 / 1 frame mark / 20 sticky / 30 dock / 40 overlay / 50 modal / 60 popover / 70 toast / 80 skip link | used inside `packages/ui` (`z-(--z-modal)`); pages never set z-index on overlays |
| `--duration-instant` … `--duration-stack` | 0 / 120 fast / 180 base / 240 slow / 300 develop / 400 stack ms | `duration-(--duration-fast)` |
| `--ease-out` / `--ease-in` / `--ease-in-out` | `cubic-bezier(0.2, 0.7, 0.3, 1)` / `(0.4, 0, 1, 1)` / `(0.4, 0, 0.2, 1)` | replace Tailwind's defaults (`ease-out` …) |
| `--breakpoint-3xl` | 120rem (1920px) | adds `3xl:` |
| `--stepler-gutter` / `--stepler-content` | 16 / 24 / 32 / 40px (base / `sm` / `lg` / `2xl`); 1240px (1320px from 1600px) | set by `stepler-container` |

`color-scheme` is `light` / `dark` with the theme, so native scrollbars and form parts follow it.

**Legacy v4 tokens** still defined for components that later steps of the migration restyle (DESIGN-SYSTEM.md §10.4), and removed with them: `--radius` (12px, `rounded-lg` …), `--secondary*` and `--accent` / `--accent-foreground` (now aliases of `--muted` / `--foreground`), `--accent-warm*`, `--staple*`, `--dot`, `--glow-*`, `--shadow-card` (now `--shadow-popover`), `--shadow-tile`, `--control-track`, `--control-thumb`, `--shadow-thumb`, the `stepler-atmosphere` utility and the fonts Manrope (`--font-sans`) and Unbounded (`--font-display`). Do not use them in new code.

## How to add a component

1. Check the inventory above and the rule "second use or stable pattern". If only one page needs it, build it in the app.
2. From `packages/ui`, add the shadcn component: `pnpm dlx shadcn@latest add <name>` (it reads `packages/ui/components.json`: new-york style, lucide icons, aliases under `@stepler/ui/*`). Check the new dependencies against the dependency rules (exact pins, at least 1 day old).
3. Restyle it to the v4 tokens: no raw colours, 44px touch targets, `focus-visible:ring-[3px] focus-visible:ring-ring/70`, `motion-safe:` for state animations, `data-slot` on each part, `className` through `cn()`, and every text as a prop. Add `'use client'` when it uses hooks or Radix state. Leave a short comment that lists the deviations from shadcn.
4. Add `<name>.stories.tsx` with a `play` test for the behaviour (keyboard included), a `globals: { theme: 'dark' }` story when it has colour states, and a `globals: { viewport: { value: 'phone' } }` story when the layout changes on small screens. Axe runs on every story (`a11y: { test: 'error' }`). If it animates, add a case to `reduced-motion.stories.tsx`.
5. Add it to the inventory above, then run `pnpm --filter @stepler/ui lint typecheck test` and `pnpm format:check`.

## Known issues and deferred items

- **Turnstile keeps its initial language and theme** until the page reloads. By design: re-rendering the widget would drop the token of a half-filled form.
- **Raw values** still in components: `rounded-[20px]` (Card), `rounded-[6px]` (Checkbox), `min-w-[12rem]` (DropdownMenuContent), `min-w-[min(var(--radix-select-trigger-width),calc(100vw-2rem))]` (SelectContent), `rounded-[9px]` (ToggleGroupItem thumb: the 12px control radius minus its 3px inset).
- **Overlay colour:** dialogs use `bg-black/50`; there is no `--overlay` token.
- **Unused tokens:** `--popover`, `--popover-foreground` (and `--accent`, `--accent-foreground`) are kept from the shadcn defaults but nothing uses them.
- **No DOM prop pass-through:** `Alert`, `EmptyState`, `PageHeader`, `Progress`, `Spinner`, `CopyField` and `ConfirmDialog` take only their typed props (plus `className`), not extra DOM attributes such as `id` or `data-*`.
- **Missing dark stories:** `BrandMark` and `Input` have no dark-theme story; `Label` has no story of its own.
