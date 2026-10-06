# Stepler brand

The owner's original assets (2026-10-06) are kept unchanged in `source/` (their own README
there). From them, three mark options were drawn for small sizes (no hairlines, a square,
optically centred), each with light and dark versions, a horizontal logo whose wordmark is
Golos Text 700 converted to outlines (no font needed), favicons and app icons:

| Option | Idea | Preview |
| --- | --- | --- |
| A «Пришпилене фото» | the original concept refined: a photo frame tilted 10°, a bold geometric S, the pin as a plain red dot on the frame's top edge | `out/preview-a.png` |
| **B «Степлер» (applied)** | a monogram tile: the white geometric S on a Stepler-blue rounded square, a red staple across its corner (stepler ≈ stapler); the most legible at 16px and as an app icon | `out/preview-b.png` |
| C «Шпилька» | the geometric S alone with the red pin dot on its upper terminal | `out/preview-c.png` |

The loading screen shows the wordmark's own «S» (`letter-s-*.svg`); the expanded sidebar the
wordmark alone (HTML text in the same face; the folded rail shows no logo); the public header
and auth pages the mark and the wordmark.

**Rebuild:** `python3 generate.py` (needs `pip install fonttools`, a docs-only tool), then
`node render.mjs` (sharp, the API's dependency). Output goes to `out/` (not committed). To
switch the applied option, copy `out/<option>/{mark,logo,wordmark}-{light,dark}.svg`,
`favicon.svg`, `favicon-{16,32,48}.png`, `apple-touch-icon.png`, `icon-{192,512}.png` and
`out/letter-s-{light,dark}.svg` to `apps/web/public/brand/`.

**Where they are used:** `apps/web/src/components/brand-mark.tsx` (sidebar, headers, loading
screen; the light and dark files swap with the theme), `apps/web/src/app/layout.tsx` (favicons,
apple-touch-icon), `apps/web/src/app/manifest.ts` (`/manifest.webmanifest`).

**Colours:** Stepler blue `#3657FF` (fills; white text 5.3:1), its darker step `#2A47E0` for
accent text (≥ 5.6:1 on every light surface), dark-theme fill `#4864FF` (the brand's `#4B68FF`
one step deeper, so white text passes 4.6:1) and accent text `#8FA0FF`; pushpin red `#FF4F32`
only in the logo; ink `#171A21`.
