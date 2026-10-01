# UX

## Primary experience

Guest experience is mobile-first and intentionally low-friction.

Admin experience is responsive and optimized for desktop while remaining fully usable on tablets and phones.

## Core UX questions to resolve during design

- What is the fastest path from shared link to upload?
- What does a guest see immediately after opening a link?
- How is upload progress communicated?
- What happens when only some files upload successfully?
- What happens when a link is revoked while a guest is using it?
- How does the guest understand whether previous content is visible?
- How does the admin distinguish guest-submitted content?

Use installed upstream UX/design skills for substantial design work.

## Design system

Component inventory, rules, tokens and how to add a component: [design-system.md](design-system.md).

## Visual direction v4 (approved 2026-09-30, may still change)

Chosen after five prototypes (v1, v2, v3a–c, v4). The owner kept v1's restraint and added a little warmth from v3b ("after dark"); v2 (warm scrapbook) was rejected.

- **Character:** calm and precise UI; warmth comes from light and content, not decoration. Avoid scrapbook/handwriting, SaaS clichés (gradient blobs, glass, feature grids) and looping ambient animation.
- **Hero:** a fanned stack of guest moments (photo, video, programme PDF, note, QR) clipped by one staple: `StapledStack` in `packages/ui`. Captions such as "Додала Марта, 21:10" make the tiles read as real moments. Motion runs once (tiles fly in, photos "develop", the staple clamps) and is off under `prefers-reduced-motion`.
- **Background:** on public pages, flat page colour, a soft warm key light top right, a faint cool fill bottom left and a faded dot grid (`stepler-atmosphere` utility). The admin area (`/app`) is the flat page colour only: it is a tool, and the atmosphere stays a public-page moment (see [design-system.md](design-system.md#focus-touch-and-layout)).
- **Type:** Unbounded 500/600 for the wordmark and headings, Manrope for everything else; both self-hosted with `next/font` (latin, cyrillic, cyrillic-ext).
- **Shape:** radius 12px controls, 20px cards, 14px tiles; soft ink-tinted shadows.
- **Themes:** light and dark are designed together; dark is "the same room at night", not navy + neon. The theme follows the system setting by default. The switch on `/app/settings` (System / Light / Dark) stores an explicit choice in the `st_theme` cookie (1 year, `SameSite=Lax`, not `HttpOnly`); the server renders it as `<html data-theme="light|dark">`, so the first paint is right with no flash, and System removes the attribute.

Tokens: the full table (every custom property in `packages/ui/src/styles/globals.css`, light and dark, with contrast ratios) is in [design-system.md](design-system.md#tokens), the single source; do not copy it here. The approved prototype is published as an artifact (link in the session notes); it is not part of the repository.
