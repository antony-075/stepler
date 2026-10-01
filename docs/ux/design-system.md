# Design system

The reusable UI of Stepler lives in `packages/ui` (`@stepler/ui`): shadcn/ui (new-york) components on Radix primitives, styled with Tailwind CSS 4 and the v4 tokens in `packages/ui/src/styles/globals.css`. Every component has a story in Storybook (`pnpm storybook`, http://localhost:6006) with `play` tests and axe checks that run in `pnpm test`.

This page describes what is implemented (Phase 3, 2026-09-30). The visual direction and the reasons behind it are in [README.md](README.md#visual-direction-v4-approved-2026-09-30-may-still-change).

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
| `ToggleGroup`, `ToggleGroupItem` | Single-select segmented control (theme and language on `/app/settings`) that always has a value. Recessed track (`--control-track` + inset hairline), raised thumb (`--control-thumb`, `--shadow-thumb`) drawn 3px inside each 44px item, selected icon `text-primary` | Small sets of immediate settings. Needs `aria-label`/`aria-labelledby`. Not for form choices (RadioGroup) or navigation (Tabs) | `value`/`defaultValue`/`onValueChange` (never called with `''`); item `icon` (decorative, before the visible label), `lang` | Components/ToggleGroup |
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

`Foundations/Tokens` shows the colour tokens with their live values in the current theme. `Tests/ReducedMotion` (hidden from the sidebar) holds the reduced-motion regression stories.

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
- Decorative icons get `aria-hidden="true"`. An icon-only button gets its name from `aria-label` (a prop). ToggleGroupItem labels are always visible.

### Motion

- State animations (open/close of Dialog, ConfirmDialog, DropdownMenu, Toast) use `motion-safe:` variants, for example `motion-safe:data-[state=open]:animate-in`. The reason is specificity: `data-[state=open]:animate-in` is (0,2,0) and outranks `motion-reduce:animate-none` (0,1,0), so the animation still ran under reduced motion. `motion-safe:` never emits the animation in the first place.
- Simple transitions may keep `motion-reduce:transition-none` / `motion-reduce:animate-none` when nothing outranks them (Button, Input, Switch, Skeleton, Spinner, Progress).
- Motion stays at or under 300ms.
- Regression tests: stories tagged `reduced-motion` run only in the `storybook-reduced-motion` Vitest project (`packages/ui/vitest.config.ts`), whose Playwright context emulates `prefers-reduced-motion: reduce`. Both projects run in `pnpm test`. Tag a story `['!dev', '!autodocs', 'reduced-motion']` and first assert that the media query matches (see `reduced-motion.stories.tsx`), so a misconfigured project fails instead of passing vacuously.

### Focus, touch and layout

- Focus ring: `focus-visible:ring-[3px] focus-visible:ring-ring/70` (the base outline is `outline-ring/70`); invalid and destructive controls use `ring-destructive/70`. Measured ratios are in the token table; `/50` was 2.33:1 on the card in light and failed WCAG 1.4.11. Menu items use a solid inset `ring-ring` because the hover background alone is about 1.2:1.
- A `DropdownMenu` session that saw pointer input returns focus to its trigger with `focus({ focusVisible: false })`, so no ring sticks after a mouse user closes the menu; a keyboard-only session keeps the ring. Safari ignores the option and may still show it.
- Surfaces drawn straight on the page (ghost buttons, admin nav links) hover and open with `bg-foreground/[0.06]`, not `bg-muted`: the cool grey clashes with the warm `stepler-atmosphere`. Cards and inputs keep `bg-muted`.
- Touch targets are at least 44×44px. Button `sm` (36px) is not for touch; Checkbox and Switch sit in a `min-h-11` Label row.
- A fixed bottom bar (for example an upload bar) gets `data-toast-avoid`; the Toaster lifts its viewport above it while toasts are open.
- `RadioGroup` is not wrapped in `Field`: it is a `role="radiogroup"` div that `<label for>` cannot name. Use `aria-labelledby` or `fieldset`/`legend`.
- `CardContent` wraps long unbroken text only inside `p` elements (`[&_p]:[overflow-wrap:anywhere]`); flex rows and controls keep their normal sizing, so put free text in a `p`.
- `ToggleGroup` never deselects: pressing the selected item keeps it selected, and `onValueChange` is never called with `''`.
- Language items keep the visible text as the accessible name (WCAG 2.5.3 Label in Name): `<ToggleGroupItem value="uk" lang="uk" title="Українська">UA</ToggleGroupItem>`. No `aria-label` that drops what is on screen.
- Page width: the `stepler-container` utility (1240px content, 1320px from 1600px, gutter 16 / 24 / 40px at base / `sm` / `lg`). The gutter is `--stepler-gutter`, so a child can bleed into it with `-mx-(--stepler-gutter) px-(--stepler-gutter)`.
- Turnstile renders `compact` below 300px container width (centred in the form), `flexible` otherwise, so the widget never overflows the card.
- Page atmosphere: the `stepler-atmosphere` utility (key light, cool fill, dot grid). Decorative; never behind text that needs contrast.
- **Admin vs public surface.** Public pages (`/`, `/login`, `/auth/verify`) sit on `stepler-atmosphere` with the floating brand header. The admin area (`/app/*`) is flat `bg-background` in every state (loading, error, loaded) with `SiteHeader variant="app"`: 64px, `border-b border-border`, on the same `stepler-container` as the page so the brand, the `h1` and the content share one left edge. Admin pages use `PageHeader size="compact"`, `pt-8 pb-16 lg:pt-10 lg:pb-20`, and group content in panels (`rounded-2xl border bg-card shadow-xs`, rows split by `divide-y`) rather than floating cards.
- Admin nav: the current section is a tinted pill (`bg-foreground/[0.06] text-foreground`) on desktop and `text-primary` with a check in the phone menu, never weight alone; `aria-current="page"` either way. On phones the menu button comes before the brand.
- Account menu: the trigger is a 32px avatar initial (`bg-primary/14 text-primary`, decorative) plus the email from `md` (`max-w-[26ch]`, truncated, `title`); on phones the email is `sr-only`, so it stays the accessible name. The menu label is two lines: "Signed in as" (small, muted) above the truncated address.
- Settings rows: label (15px/600) and a helper line (14px muted, `max-w-[40ch]`, linked with `aria-describedby`) on the left, the control on the right from 600px (`grid-cols-[minmax(0,1fr)_auto]`); on phones they stack and the segmented control fills the row with equal segments (theme icons hidden below 400px).
- Disabled primary button: solid `bg-muted text-muted-foreground` (5.42 / 6.35), not half-transparent primary, so a reason such as "Wait, checking…" stays readable. Other variants keep `opacity-50`.
- Stories are checked at the Storybook viewports `phone` (360), `tablet` (768) and `laptop` (1280).

### Theme and language

- Theme: `<html data-theme="light|dark">`, rendered by the server from the `st_theme` cookie (1 year, `SameSite=Lax`, not `HttpOnly`), so the first paint is right. No attribute means "follow the system" (`prefers-color-scheme`). In the app, read and change it with `ThemeProvider` / `useThemePreference()` (`apps/web/src/theme/theme-provider.tsx`); do not write the cookie or the attribute directly.
- Where: both switches are on `/app/settings` (Appearance panel, reached from the account menu and the admin nav). The header has none; public pages show the brand only and follow the cookies (or the OS / `Accept-Language`).
- Browser chrome: the root layout sets `theme-color` to `--background` for `prefers-color-scheme: light` and `dark`. It follows the system setting, not an explicit choice in the cookie.
- Language: switch with `useChangeLocale()` (`apps/web/src/i18n/language-switch.tsx`). It writes the `st_locale` cookie, saves the choice to the profile with `PATCH /me` when the `me` query is cached (always the case inside `/app`), then refreshes the server tree while keeping client state. A failed save shows a toast; the page still switches.

## Tokens

All custom properties in `packages/ui/src/styles/globals.css`. Dark values apply under `prefers-color-scheme: dark` (unless `data-theme="light"`) and under `data-theme="dark"`. Tailwind exposes the colours as `bg-*`, `text-*`, `border-*` and so on through `@theme inline`.

Contrast is WCAG 2 (sRGB relative luminance), light / dark. Text pairs need 4.5:1, non-text (field edges, focus rings) 3:1. The ring values were measured in the browser; everything else was computed from the hex values with the WCAG formula (2026-09-30).

### Surfaces and text

| Token | Light | Dark | Role | Contrast (light / dark) |
| --- | --- | --- | --- | --- |
| `--background` | `#F4F4F7` | `#13141B` | page | |
| `--foreground` | `#16182A` | `#EEEEF3` | text | on background 15.97 / 15.88; on card 17.53 / 14.51; on muted 14.86 / 12.65 |
| `--card` | `#FFFFFF` | `#1B1D27` | cards, tiles, dialogs, menus, fields | |
| `--card-foreground` | `#16182A` | `#EEEEF3` | text on card | as `--foreground` on card |
| `--popover` | `#FFFFFF` | `#1B1D27` | unused (shadcn default; menus use `card`) | |
| `--popover-foreground` | `#16182A` | `#EEEEF3` | unused | |
| `--muted` | `#EBECF1` | `#252836` | fills: tabs list, skeleton, hover, disabled primary button | |
| `--muted-foreground` | `#5A5E73` | `#A7AABC` | secondary text | on background 5.83 / 7.97; on card 6.40 / 7.29; on muted 5.42 / 6.35 |
| `--secondary` | `#EBECF1` | `#252836` | secondary button, neutral badge | |
| `--secondary-foreground` | `#16182A` | `#EEEEF3` | text on secondary | 14.86 / 12.65 |
| `--accent` | `#EBECF1` | `#252836` | unused (shadcn default) | |
| `--accent-foreground` | `#16182A` | `#EEEEF3` | unused | |
| `--border` | `#DFE1E9` | `#2C2F3D` | hairlines (decorative) | on card 1.31 / 1.26 (not relied on to identify controls) |
| `--input` | `#868A9E` | `#6A6E85` | field edges, unchecked switch track | on card 3.42 / 3.34; on background 3.11 / 3.66 |
| `--control-track` | `var(--background)` | `var(--background)` | ToggleGroup track: a recessed well (with an inset `--border` hairline) | vs card 1.10 / 1.09 (decorative; the labels identify the items); muted-foreground on it 5.83 / 7.97 |
| `--control-thumb` | `#FFFFFF` | `#2C2F3D` | ToggleGroup selected thumb; lighter than the card in dark | vs track 1.10 / 1.38 (plus `--shadow-thumb` and a `foreground/10` ring; selection is also `aria-checked` and foreground text); foreground on it 17.53 / 11.49; primary icon 6.60 / 6.31 |

### Actions and focus

| Token | Light | Dark | Role | Contrast (light / dark) |
| --- | --- | --- | --- | --- |
| `--primary` | `#3B4BD8` | `#A3ADFF` | actions, links, selected states | links on card 6.60 / 7.97; on background 6.01 / 8.73; on muted 5.59 / 6.95 |
| `--primary-hover` | `#2F3DB8` | `#BAC2FF` | primary button on hover | |
| `--primary-foreground` | `#FFFFFF` | `#13141B` | text on primary | on primary 6.60 / 8.73; on hover 8.47 / 10.71 |
| `--ring` | `#3B4BD8` | `#A3ADFF` | focus ring, used at `/70` | `ring/70` on card 3.49 / 4.60, on background 3.31 / 4.85; solid ring on a highlighted menu item (muted) 5.59 / 6.95 |

### Status

| Token | Light | Dark | Role | Contrast (light / dark) |
| --- | --- | --- | --- | --- |
| `--success` | `#1A7F4B` | `#5FD39A` | success icon, edge, dot, text on card | on card 5.02 / 9.00; on success-soft 4.38 / 7.32 (below 4.5 in light, so success Badge and Alert keep `foreground` text) |
| `--success-soft` | `#E4F3EA` | `#173327` | success tint | foreground on it 15.28 / 11.80; muted-foreground 5.58 / 5.92 |
| `--destructive` | `#C23A2E` | `#FF8A7D` | destructive button, error icon/text, destructive menu item | on card 5.33 / 7.34; on background 4.86 / 8.03; on its `/10` tint 4.60 / 6.20; `ring-destructive/70` on card 3.19 / 4.25, on background 3.03 / 4.49 |
| `--destructive-foreground` | `#FFFFFF` | `#13141B` | text on a destructive button | 5.33 / 8.03 |

Foreground text on the error tint (`destructive/10` over card) is 15.11 / 12.25 and on the warning tint (`accent-warm/10`) 16.37 / 11.87.

### Warm accent and illustration (decorative)

| Token | Light | Dark | Role | Contrast (light / dark) |
| --- | --- | --- | --- | --- |
| `--accent-warm` | `#F0A04B` | `#F4B26A` | decoration only: note tile, brand-mark staple, QR dot, warning fill | decorative; on card 2.14 / 9.13, so never text or a line icon on its own in light |
| `--accent-warm-foreground` | `#2A1605` | `#2A1605` | text and icon strokes on accent-warm (warning Badge, warning Alert icon) | 8.09 / 9.40 |
| `--staple` | `#A3A7B6` | `#7E8296` | the staple (StapledStack, sign-in landing) | decorative |
| `--staple-shine` | `#ECEDF2` | `#C9CBD6` | highlight on the staple | decorative |
| `--dot` | `#D6D8E0` | `#262834` | `stepler-atmosphere` dot grid | decorative |
| `--glow-warm` | `rgb(255 186 120 / 0.42)` | `rgb(255 168 96 / 0.15)` | atmosphere key light | decorative |
| `--glow-cool` | `rgb(150 162 255 / 0.16)` | `rgb(120 132 255 / 0.07)` | atmosphere cool fill | decorative |

### Shape, elevation and type

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--radius` | `0.75rem` | same | controls (`rounded-lg`); `--radius-sm` −4px, `--radius-md` −2px, `--radius-xl` +8px (20px) |
| `--shadow-card` | `0 1px 2px rgb(22 24 42 / 0.05), 0 18px 44px -16px rgb(22 24 42 / 0.2)` | `inset 0 1px 0 rgb(255 236 214 / 0.05), 0 24px 52px -20px rgb(0 0 0 / 0.75)` | cards, dialogs, menus, toasts (`shadow-card`) |
| `--shadow-tile` | `0 1px 2px rgb(22 24 42 / 0.08), 0 12px 26px -12px rgb(22 24 42 / 0.3)` | `inset 0 1px 0 rgb(255 255 255 / 0.05), 0 14px 30px -12px rgb(0 0 0 / 0.8)` | StapledStack tiles (`shadow-tile`) |
| `--shadow-thumb` | `0 1px 2px rgb(22 24 42 / 0.1), 0 1px 1px rgb(22 24 42 / 0.04)` | `inset 0 1px 0 rgb(255 255 255 / 0.06), 0 1px 2px rgb(0 0 0 / 0.5)` | ToggleGroup thumb (`shadow-thumb`) |
| `--font-sans` | Manrope (`--font-manrope` from `next/font`), system fallbacks | same | body text |
| `--font-display` | Unbounded (`--font-unbounded`), then Manrope | same | wordmark and headings (`font-display`) |
| `--stepler-gutter` / `--stepler-content` | 1rem / 1240px (1.5rem from `sm`, 2.5rem from `lg`, 1320px from 1600px) | same | set by `stepler-container` |

`color-scheme` is `light` / `dark` with the theme, so native scrollbars and form parts follow it.

## How to add a component

1. Check the inventory above and the rule "second use or stable pattern". If only one page needs it, build it in the app.
2. From `packages/ui`, add the shadcn component: `pnpm dlx shadcn@latest add <name>` (it reads `packages/ui/components.json`: new-york style, lucide icons, aliases under `@stepler/ui/*`). Check the new dependencies against the dependency rules (exact pins, at least 1 day old).
3. Restyle it to the v4 tokens: no raw colours, 44px touch targets, `focus-visible:ring-[3px] focus-visible:ring-ring/70`, `motion-safe:` for state animations, `data-slot` on each part, `className` through `cn()`, and every text as a prop. Add `'use client'` when it uses hooks or Radix state. Leave a short comment that lists the deviations from shadcn.
4. Add `<name>.stories.tsx` with a `play` test for the behaviour (keyboard included), a `globals: { theme: 'dark' }` story when it has colour states, and a `globals: { viewport: { value: 'phone' } }` story when the layout changes on small screens. Axe runs on every story (`a11y: { test: 'error' }`). If it animates, add a case to `reduced-motion.stories.tsx`.
5. Add it to the inventory above, then run `pnpm --filter @stepler/ui lint typecheck test` and `pnpm format:check`.

## Known issues and deferred items

- **Turnstile keeps its initial language and theme** until the page reloads. By design: re-rendering the widget would drop the token of a half-filled form.
- **Raw values** still in components: `rounded-[20px]` (Card), `rounded-[6px]` (Checkbox), `min-w-[12rem]` (DropdownMenuContent), `rounded-[9px]` (ToggleGroupItem thumb: the 12px control radius minus its 3px inset).
- **Overlay colour:** dialogs use `bg-black/50`; there is no `--overlay` token.
- **Unused tokens:** `--popover`, `--popover-foreground` (and `--accent`, `--accent-foreground`) are kept from the shadcn defaults but nothing uses them.
- **No DOM prop pass-through:** `Alert`, `EmptyState`, `PageHeader`, `Progress`, `Spinner`, `CopyField` and `ConfirmDialog` take only their typed props (plus `className`), not extra DOM attributes such as `id` or `data-*`.
- **Missing dark stories:** `BrandMark` and `Input` have no dark-theme story; `Label` has no story of its own.
