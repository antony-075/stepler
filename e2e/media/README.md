# Landing media

`pnpm landing:media` makes the landing page's product screens and walkthrough film from the
real app running locally. Nothing is drawn or mocked: a demo account is registered (the
confirmation mail is read from Mailpit), its collections are filled through the guest API and
the worker makes the thumbnails. Then Playwright photographs and films the screens.

## Before you run it

- `pnpm infra:up`, `pnpm dev` and `pnpm worker:dev` are running (web on :3000 by default).
- `ffmpeg` and `ffprobe` are on the `PATH`. The film uses `libx264` and `libvpx-vp9`. It does
  not need `drawtext`: labels are rendered as PNG frames by Chromium.
- The photos come from `apps/web/src/landing/photos/` (CC0, see `CREDITS.md` there).

## What it does

1. **seed.** Registers `olia.<time>@stepler.test`. Gives it a 30-day complimentary Business
   plan, written to the local database the way the operator's grant writes it (`seed.ts`,
   `grantBusinessPlan`). Then creates six collections, one per template, with a shared
   gallery, named guests, photos, a short Ken Burns video made with ffmpeg, wishes, a cover
   and a welcome message.
2. **admin.** Takes 1440×900 desktop stills: dashboard, the wedding's content, the share
   dialog, a new collection, the guest page editor. Each one is saved at 1× and, when it is
   ≤ 350 KB, at 2×.
3. **guest.** Takes 390×844 @2× phone stills: each template's guest page, «Кадри», and writing
   a wish.
4. **upload.** Takes the upload sheet mid-upload, with the network throttled through CDP.
   These photos really join the wedding, so this step runs after the others.
5. **video.** Films the walkthrough with a fresh account per language: create a collection,
   pick «Листівка», share the QR code, a guest uploads photos and a video and then writes a
   wish, and the admin's grid. The film is recorded through the DevTools screencast, framed
   (`compose.ts`), cross-faded and capped at 31 s.

Every capture hides the Next.js dev badge and toasts (`ui.ts`, `hideCaptureNoise`).

## Output (`apps/web/public/landing/`)

- `screens/{uk,en}/*.webp`, plus `screens/manifest.json` with each file's pixel size, read
  from the files on disk.
- `video/walkthrough-{uk,en}.{mp4,webm,vtt}` and `video/walkthrough-{uk,en}-poster.webp`, plus
  `video/manifest.json`.

Intermediate files (the screencast frames, clips, the demo state) go to
`e2e/test-results/landing-media/`, or to `LANDING_MEDIA_SCRATCH` if it is set.

## Options

| Variable                 | Default                            | Meaning                                                                    |
| ------------------------ | ---------------------------------- | -------------------------------------------------------------------------- |
| `LANDING_MEDIA_BASE_URL` | `http://localhost:3000`            | The running web app                                                        |
| `LANDING_MEDIA_STEPS`    | `seed,admin,guest,upload,video`    | Which steps to run. Without `seed`, the last run's demo account is reused. |
| `LANDING_MEDIA_LOCALES`  | `uk,en`                            | Languages                                                                  |
| `LANDING_MEDIA_DATABASE_URL` | `DATABASE_URL` from `apps/api/.env` | The database for the plan grant                                        |
| `LANDING_MEDIA_SCRATCH`  | `e2e/test-results/landing-media/`  | Intermediate files                                                         |

Example: `LANDING_MEDIA_STEPS=video LANDING_MEDIA_LOCALES=en pnpm landing:media`.

The API allows 10 new collections per account per day. A run without `seed` adds no
collections to the stills account; the film always uses its own account. If you re-run
`upload` without `seed`, more frames are added to the wedding, so re-seed before you take the
final screens.
