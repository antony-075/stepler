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

## Visual direction v4 (approved 2026-09-30, may still change)

Chosen after five prototypes (v1, v2, v3a–c, v4). The owner kept v1's restraint and added a little warmth from v3b ("after dark"); v2 (warm scrapbook) was rejected.

- **Character:** calm and precise UI; warmth comes from light and content, not decoration. Avoid scrapbook/handwriting, SaaS clichés (gradient blobs, glass, feature grids) and looping ambient animation.
- **Hero:** a fanned stack of guest moments (photo, video, programme PDF, note, QR) clipped by one staple: `StapledStack` in `packages/ui`. Captions such as "Додала Марта, 21:10" make the tiles read as real moments. Motion runs once (tiles fly in, photos "develop", the staple clamps) and is off under `prefers-reduced-motion`.
- **Background:** flat page colour, a soft warm key light top right, a faint cool fill bottom left and a faded dot grid (`stepler-atmosphere` utility).
- **Type:** Unbounded 500/600 for the wordmark and headings, Manrope for everything else; both self-hosted with `next/font` (latin, cyrillic, cyrillic-ext).
- **Shape:** radius 12px controls, 20px cards, 14px tiles; soft ink-tinted shadows.
- **Themes:** light and dark are designed together; dark is "the same room at night", not navy + neon. The theme follows the system setting; `data-theme` on `<html>` is ready for an explicit switch later.

Tokens (`packages/ui/src/styles/globals.css`):

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--background` | `#F4F4F7` | `#13141B` | page |
| `--card` | `#FFFFFF` | `#1B1D27` | cards, tiles |
| `--foreground` | `#16182A` | `#EEEEF3` | text |
| `--muted` | `#EBECF1` | `#252836` | fills |
| `--muted-foreground` | `#5A5E73` | `#A7AABC` | secondary text |
| `--border` | `#DFE1E9` | `#2C2F3D` | hairlines |
| `--input` | `#868A9E` | `#6A6E85` | field edges |
| `--primary` / hover | `#3B4BD8` / `#2F3DB8` | `#A3ADFF` / `#BAC2FF` | actions, links, focus |
| `--primary-foreground` | `#FFFFFF` | `#13141B` | text on primary |
| `--accent-warm` | `#F0A04B` | `#F4B26A` | decoration only (note, mark, QR dot, light) |
| `--success` | `#1A7F4B` | `#5FD39A` | |
| `--destructive` | `#C23A2E` | `#FF8A7D` | |

Contrast (WCAG 2 ratios, computed by the prototype's script): text on background 15.97 / 15.88; secondary text on background 5.83 / 7.97 and on card 6.40 / 7.29; primary button 6.60 / 8.73; links on card 6.60 / 7.97; input edge vs card 3.42 / 3.34 (≥ 3:1); success and destructive on card ≥ 5.0. The approved prototype is published as an artifact (link in the session notes); it is not part of the repository.
