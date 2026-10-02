# ADR 0015 — Visual Direction C, Self-Hosted Fonts and Stable Frame Numbers

Status: Accepted (owner decisions 2026-10-02, recorded in docs/design/DESIGN-SYSTEM.md §12)
Date: 2026-10-02

## Context

Stepler's UI was built on direction v4 (ink-blue actions, a warm apricot accent, Manrope and Unbounded from Google Fonts through `next/font/google`, the stapled-stack hero). The design exploration ([DESIGN-DIRECTIONS.md](../../design/DESIGN-DIRECTIONS.md)) compared four directions and the owner chose one; the design system for it is specified in [DESIGN-SYSTEM.md](../../design/DESIGN-SYSTEM.md).

Three parts of that choice reach beyond styling:

1. **Fonts.** The new direction needs Geologica's `SHRP` axis and a monospace face for data. `next/font/google` downloads the fonts at build time; the Docker build failed on 2026-10-02 because that download failed, so the build depends on Google's servers being reachable.
2. **Frame numbers.** The direction treats every contribution as a numbered frame (`#087`). A number that people quote ("delete #086") must be stable, so it cannot be computed on the client from the current filter, page or deletions. That is a data-model decision.
3. **Time and retry.** The event timeline and the upload states depend on which time a frame shows and on how failed uploads are retried.

## Decision

### Visual direction

- **Direction C «Контактний аркуш»** (contact sheet) is the visual direction of the whole product: light-table background, white sheets, a flat 1px grid of equal frames, frame number and time under each frame, ink for admin actions, a rare red-orange "wax pencil" for selection, "new", the active tab and the guest's main action, dusty violet for links, information and **focus**. The focus ring (and a focused field's edge) is never the pencil: red-orange around a field reads as an error (owner change 2026-10-02).
- **Plus one moment from Direction B «Відбиток»:** on the guest success screen, the guest's own last frames lie as a small stack of prints (±1.5° rotation, one shadow, a "develop" fade). This is the only place in the product with rotation, overlap or a shadow on a frame.
- Everything else from A, B and D is not used. Tokens, components, layouts and motion follow DESIGN-SYSTEM.md; `docs/ux/design-system.md` records what is implemented.
- shadcn component and token names are kept (`--background`, `--primary`, `Button`, …) so existing code keeps working while values change.

### Fonts

- **Geologica** (Monokrom, OFL 1.1) for all interface text, with the `wght` (100–900) and `SHRP` (0–100) axes. `CRSV` and `slnt` are dropped (pinned to 0): they would add ~32 KB and the direction does not use them.
- **Geist Mono** (Vercel, OFL 1.1), `wght` 100–900, only for data: frame numbers, times, durations, sizes, counters.
- Both are **committed to the repository as woff2** with their OFL licence files, in `packages/ui/src/fonts/`. `apps/web` loads them with `next/font/local`; Storybook loads the same files with `@font-face`. No build or test fetches fonts over the network.
- Files: one woff2 per family, latin + cyrillic (Google Fonts' `latin` and `cyrillic` unicode ranges merged: Ukrainian і ї є ґ, ’ U+2019, «», № are included). `next/font/local` cannot give each source file its own `unicode-range`, so one merged file per family is simpler than per-subset files. `cyrillic-ext` and `latin-ext` are not included; adding them is a rebuild of the files.
- Source and build: the variable TTFs from the official google/fonts repository (`ofl/geologica/Geologica[CRSV,SHRP,slnt,wght].ttf`, upstream googlefonts/geologica; `ofl/geistmono/GeistMono[wght].ttf`, upstream vercel/geist-font), built with fontTools 4.60: `fonttools varLib.instancer … CRSV=0 slnt=0`, then `pyftsubset --unicodes=<latin+cyrillic> --flavor=woff2` (Geologica with `--layout-features+=tnum,pnum` so `tabular-nums` works). Result: Geologica 40.8 KB, Geist Mono 29.2 KB.

### Frame numbers (to be implemented in the upload slice, not now)

- A counter on the collection (`Collection.nextFrameNo`) and `ContentItem.frameNo`, with `UNIQUE (collectionId, frameNo)` enforced by PostgreSQL. The counter is incremented with `UPDATE … SET nextFrameNo = nextFrameNo + 1 RETURNING` in the same transaction that creates the content item (a row lock on the collection for that short transaction).
- The number is **assigned on upload completion** (when the content item is created), not when an upload session starts. While a file is uploading, the guest sees its place in the batch ("1 з 6"), not a number.
- **Gaps are kept.** Numbers are never reused or renumbered after a deletion (like film). Admin copy explains that numbers do not change after deletion.
- **Who sees numbers:** the admin sees all numbers; a guest sees numbers only on their own frames. In the shared guest gallery frames show the time, not the number.
- Text contributions get numbers from the same sequence (they are frames too), per DESIGN-SYSTEM.md §11.1.
- Nothing of this exists in the schema yet; the migration, DTO fields and tests come with the upload slice.

### Time

- In the MVP the timeline and gallery order use **upload time** (the content item's creation time); the label reads as "added at…".
- If the processing pipeline can read it cheaply, the capture time from EXIF / video metadata is stored in a separate nullable `capturedAt`, so switching the timeline to capture time later needs no data migration. EXIF GPS is never copied to derived media.

### Retry

- Failed uploads are retried **automatically within the tab** (and at once when the network comes back), then the frame offers a manual **«Повторити»**. While offline, frames stay queued, not failed.
- The queue does **not** survive closing the tab; the page warns with `beforeunload` and a persistent line «Не закривайте сторінку, доки кадри завантажуються». Resumable uploads across tabs or devices are not in the MVP.

## Alternatives considered

- **Stay on v4** — rejected by the owner after the exploration.
- **Fonts through `next/font/google`** — self-hosts at runtime but downloads at build time; that download broke the Docker build. **`<link>` to Google Fonts** — sends every visitor's IP to Google and needs the network in tests. **`@fontsource-variable/*` packages** — a new dependency for two files, and SHRP availability in the package was unverified. Committed woff2 is deterministic and needs no dependency (OFL allows redistribution).
- **One woff2 per subset with `unicode-range`** — smaller downloads for pages without Cyrillic, but `next/font/local` applies declarations to every file, and nearly every Stepler page is Ukrainian, so both subsets are loaded anyway.
- **Frame number from `ROW_NUMBER()` at read time** — changes after every deletion. **A PostgreSQL sequence per collection** — does not scale with the number of collections. **Number at upload start** — visible during upload, but every cancelled or failed upload leaves a gap.
- **Capture time for the timeline in the MVP** — needs metadata extraction, is missing for documents, texts, screenshots and messenger-forwarded media, and EXIF has no reliable time zone.
- **Manual retry only** — a phone on a flaky network would turn many frames into failures the guest must tap one by one.

## Consequences

- Two font files (~70 KB together) are in the repository and are preloaded on every page; updating a font means rebuilding the files with the recipe above.
- The upload slice must add the counter, the unique constraint and the number in DTOs (owner-facing always; guest-facing only for the guest's own items).
- Until the upload slice, UI that would show frame numbers (Frame, FrameGrid, upload components) is built in Storybook only.
- Guest copy must not promise that "your frames" survive another device or cleared cookies: ownership comes from the guest session.
