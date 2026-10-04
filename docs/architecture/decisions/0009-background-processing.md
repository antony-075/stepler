# ADR 0009 — Background Processing with a PostgreSQL-Backed Queue

Status: Accepted (owner selected option D1(a)); library pg-boss per spike S7; implemented for purges and sweeps (Phase 4 PR B, 2026-10-03) and media jobs (PR D, 2026-10-04; tools per spike S5)
Date: 2026-09-29

## Context

MVP needs image thumbnails/previews (including HEIC), video posters, asynchronous storage deletion and upload expiry. The API must not do heavy media work synchronously. CLAUDE.md forbids adding a queue/infra component without justification.

## Decision

- Separate worker process from the same codebase: the second entrypoint `apps/api/src/worker/main.ts` with its own image `apps/api/worker.Dockerfile` (Phase 4 plan [C2]; spec §3 calls it "a second entrypoint of the same modular monolith").
- Queue and schedules in PostgreSQL via pg-boss — no new infrastructure.
- Jobs: image derivatives (sharp), video poster (ffmpeg reading a presigned URL), content/collection purge, object deletion, upload expiry. All jobs idempotent, retried with backoff.
- Worker image carries ffmpeg and HEIC support; the API image does not.

## Alternatives considered

- In-process jobs inside the API — media CPU/memory competes with request handling.
- Redis-based queue (BullMQ) — new infrastructure without a scale requirement.
- Cloudflare Images / Stream — less code, but paid per use, vendor lock-in, no single solution for video.
- Client-generated thumbnails — untrusted.

## Consequences

- One more deployable process.
- Queue load shares the primary database; revisit if job volume becomes significant.

## Implementation (Phase 4 PR B, 2026-10-03)

- **Port:** `JobQueue.enqueue(tx, name, data, options?)` in `apps/api/src/jobs` (callers `await ready()` before opening the transaction, so a first pg-boss start never runs inside it); jobs are sent through the caller's Prisma transaction (pg-boss `fromPrisma`), so a job exists if and only if its state change commits. Payloads carry ids and an optional `requestId`, never user content.
- **Queues:** created by every process at start with `policy: 'exclusive'` and the retry/expiry options in `JOB_OPTIONS`; every job carries a per-entity singleton key (`content.purge:{id}` …, the queue name for periodic jobs).
- **API:** sender only (`max: 2`, no supervision, no cron), started in the background so the API still boots while PostgreSQL is down; the first send retries the start.
- **Worker:** pg-boss pool 5, Prisma pool 5; one job per fetch, polled every 2 s; supervision and cron run here. Logs carry `jobId`, `name` and `requestId` only. On SIGTERM/SIGINT, `main.ts` stops pg-boss first (no new fetches; running jobs get 25 s, after which pg-boss fails them so they are retried) and only then closes the Nest context, whose destroy hooks close Prisma and S3. Nest's `enableShutdownHooks` is not used: it would close those clients before any `beforeApplicationShutdown` hook could drain the jobs. Render waits up to `maxShutdownDelaySeconds: 60` after SIGTERM.
- **Canonical ids:** payloads and storage prefixes use ids as stored in PostgreSQL (lowercase). Routes accept a UUID in any case and PostgreSQL matches it, but storage keys are case-sensitive, so services enqueue the id read back from the row and handlers build prefixes from the row they load.
- **Jobs implemented:** `content.purge` (derived objects, then the row; a non-deleted item is never purged), `collection.purge` (every object under `collections/{id}/` in batches of `WORKER_PURGE_BATCH_SIZE`, resumable, then the row and its cascade; audit events stay), `maintenance.sweep` (hourly at :07: re-enqueues purges for items and `DELETING` collections older than an hour, which also clears collections deleted before the worker existed; deletes guest sessions idle for `GUEST_SESSION_IDLE_DAYS`, default 400, that never contributed). Admin content delete and collection delete enqueue their purge in the same transaction.
- **Not yet:** `storage.discard-upload` and `uploads.expire` (their names, options and the `*/15` schedule exist; handlers arrive with the upload slice), `media.*` (processing slice).

### Spike S7 result (2026-10-03): transactional enqueue with pg-boss and Prisma 7

**Question:** can the API enqueue a pg-boss job inside a Prisma interactive transaction, so that the job exists if and only if the transaction commits?

**Library:** `pg-boss` **12.36.0**: MIT, ESM (`"type": "module"`), `engines.node >= 22.12.0`, released 2026-10-02. The project releases often (14 releases between 2026-09-13 and 2026-10-02). Repository: github.com/timgit/pg-boss. Runtime dependencies: `pg ^8.23.1`, `cron-parser`, `rrule-temporal`, `serialize-error`. Tested with PostgreSQL 18.6 (compose image), Node 24.21.0, `prisma`/`@prisma/client`/`@prisma/adapter-pg` 7.10.0 and `pg` 8.23.1.

**Adapter:** pg-boss accepts a per-call `db` object (`IDatabase { executeSql(text, values) → { rows } }`). Its SQL then runs on the Prisma transaction's connection:

```ts
const txDb = (tx: Prisma.TransactionClient) => ({
  executeSql: async (text: string, values: unknown[] = []) => ({ rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values) }),
});
await boss.send(name, data, { db: txDb(tx), singletonKey, startAfter });
```

| Pass criterion | Result |
|---|---|
| commit → a worker fetches the job within 2 s | **pass**: fetched 443 ms after commit (worker `pollingIntervalSeconds: 0.5`; with the default 2 s poll the bound is about 2 s) |
| throw after `send` → rollback → no row in `pgboss.job` | **pass**: `send` returned an id inside the transaction; after rollback, 0 job rows and 0 rows of the business table |
| (extra) the uncommitted job is invisible to other connections | **pass**: 0 rows seen from another connection before commit, 1 after |
| two or more processes start `PgBoss` at once (schema migration) | **pass**: 5 rounds × 4 processes (2 senders with `supervise:false, schedule:false`, 2 workers), each on a brand-new schema and each also running `createQueue` for the same 4 queue names; every process started in 88–149 ms with no error (advisory lock) |
| `send` to a queue created by another process, without `createQueue` in the sender | **pass**. Sending to a queue that does not exist throws `Queue never.created does not exist`, so the API must `createQueue` idempotently at boot (concurrent `createQueue` is safe, see the row above) |
| `singletonKey` dedupes two sends of `content.purge` for the same id | **pass only with a non-standard queue policy.** `policy: 'exclusive'` → 1 row (the second `send` returns `null`); `'stately'` → 1 row; **`'standard'` (the default) → 2 rows**. pg-boss's unique indexes on `singleton_key` exist only for the `short`, `singleton`, `stately`, `exclusive` and `key_strict_fifo` policies |
| (extra) two concurrent transactions send the same singleton | **pass**: 1 row on an `exclusive` queue; the second insert waits on the unique index and then does nothing |
| (extra) `startAfter` through the adapter | **pass**: `start_after - created_on = 60 s` |
| (extra) Prisma leaves the `pgboss` schema alone | **pass**: `prisma migrate diff --from-config-datasource --to-schema …` against a database that holds `pgboss` → "This is an empty migration" (Prisma only inspects `public`), so `pnpm db:check` is not affected |

**Decision: pg-boss with transactional `send({ db })`. The outbox fallback is not needed.**

Notes for the implementation:
- **Queue policy:** create every queue with `policy: 'exclusive'` (at most one queued, retrying or active job per `(name, singletonKey)`). **Always pass a `singletonKey`:** on an exclusive queue a job without one shares the key `''` with every other keyless job of that queue, so they would dedupe each other away. `PgBossQueue` should derive the key from the payload: `content.purge:{contentItemId}`, `collection.purge:{collectionId}`, `storage.discard-upload:{uploadSessionId}`, `media.*:{contentItemId}`, and the job name alone for `uploads.expire` / `maintenance.sweep`. A job that has used up its retries is `failed`, which is outside the exclusive index, so the sweep can enqueue it again.
- The first `send` for each queue name in a process looks the queue up through pg-boss's **own** pool, outside the transaction, and caches it. The sender pool must therefore be separate from Prisma's (it is: `new PgBoss({ connectionString, max: 2 })`), so a transaction that holds a Prisma connection can never deadlock waiting for itself.
- API (sender): `new PgBoss({ connectionString, schema: 'pgboss', max: 2, supervise: false, schedule: false })`, then `start()` and `createQueue(name, { policy: 'exclusive', ...JOB_OPTIONS[name] })` for every `JobName`. Worker: `max: 5`, supervise and schedule on (the defaults). Idle pools measured: sender 2 connections, worker 5.
- Not tested: whether `createQueue` on an existing queue updates its options (use `updateQueue` when `JOB_OPTIONS` change), LISTEN/NOTIFY wake-ups (not needed; polling is enough), and pg-boss on Render.
- **Staging connection budget** (Render's limit for `basic-256mb` is *not verified*; check it in the dashboard): API Prisma pool (pg default `max` 10) + API pg-boss 2 + worker Prisma (set `max: 5`) + worker pg-boss 5 + pre-deploy `prisma migrate deploy` 1 ≈ **23 connections**.

Implementation notes on S7: pg-boss 12.36.0 ships the same adapter as `fromPrisma(tx)`, which the code uses instead of the hand-written one above. Every start runs `createQueue` (a no-op for an existing queue) and then `updateQueue`, so changed `JOB_OPTIONS` reach existing queues; a queue's policy cannot be changed that way.

### Spike S5 result (2026-10-03): HEIC decoding and video posters in the worker image

**Question:** can a `node:24-slim` image decode iPhone HEIC (HEVC) to a WebP preview, and extract a poster from a 2 GB MOV through a presigned URL, within 512 MB RAM?

**Base:** the API's base image `node:24-slim@sha256:0e0ff40c…` is **Debian 12 bookworm**. Its packages:
- `libheif-examples` / `libheif1` **1.15.1-1+deb12u1**. This version ships `heif-convert`, `heif-enc` and `heif-info`; there is **no `heif-dec`** (that name arrived in libheif 1.17). Bookworm also has **no separate `libheif-plugin-libde265` package**: `libheif1` links libde265 directly.
- `libde265-0` **1.0.11-1+deb12u3**.
- `ffmpeg` **7:5.1.9-0+deb12u1**, configured with `--enable-gpl --enable-libx264 --enable-libx265 --enable-libdav1d`.
- npm `sharp` **0.35.5** (Apache-2.0; the prebuilt libvips binaries are LGPL-3.0-or-later; libvips 8.18.7, libheif 1.23.5 inside sharp).

**Fixtures:** all generated, nothing downloaded.
- 12 MP: `ffmpeg -f lavfi -i "testsrc2=size=4032x3024:rate=1,noise=alls=14:allf=u" -frames:v 1 src.png` → `heif-enc -q 60 src.png -o photo-12mp.heic` (4.26 MB, brand `heic`, 4032×3024, a single image).
- Small, committable for Task 18: `photo.heic` (320×240, 5 366 B), `clip.mp4` (8 373 B) and `clip.mov` (8 320 B, moov at the end). Each is 1 s of `testsrc` 320×240, libx264. Copies are in `scratchpad/spikes/s5/fixtures/`, and the exact commands are in `scratchpad/spikes/s5/gen.sh`, ready to become `apps/api/test/fixtures/media/generate.sh`.
- Video: a 2 023 510 380 B (2.02 GB) 1080p30 H.264 MOV with **moov at the end** (`mdat @28`, `moov @2023498119`), 47.8 s long, about 338 Mbit/s; and an iPhone-like 3840×2160 HEVC (`hvc1`) MOV, 12 s, 60.7 MB, moov also at the end. Both were uploaded to SeaweedFS and read through a presigned GET URL behind a byte-counting proxy.
- A real iPhone HEIC was **not** tested (none available; owner smoke test S1 step 2 covers it).

**HEIC, 12 MP → 1600 px + 480 px WebP, at 0.5 CPU / 512 MB:**

| Path | Wall time | Peak RSS | Result |
|---|---|---|---|
| (a) `heif-convert in.heic out.png` + sharp | 6.41 s + 0.87 s = **7.3 s** | 119 MB / 101 MB | fails < 5 s (PNG encoding of an 18.3 MB temp file is the cost) |
| **(a′) `heif-convert -q 92 in.heic out.jpg` + sharp** | **1.52 s + 0.47 s ≈ 2.0 s** | **83 MB / 91 MB** | **pass**; temp JPEG 2.37 MB |
| (b) `heic-decode` 2.1.0 (WASM `libheif-js` 1.23.2) → raw RGBA → sharp | 2.62 s (decode 2.1 s) | **270 MB** | pass, but uses 3× the memory |
| (c) sharp's prebuilt libvips directly | n/a | n/a | fails as expected: `Support for this compression format has not been built in: HEVC (a suitable decoder plugin is libde265)`. sharp's libheif is AVIF-only (`input.fileSuffix: ['.avif']`) |

Unconstrained (10 cores): (a′) 0.73 s + 0.19 s; (b) 1.08 s.

- The derived WebP has no EXIF (`metadata().exif === undefined`).
- **Orientation hazard:** `heif-convert` 1.15.1 copies the EXIF block, *including the Orientation tag*, into its JPEG output. A test file tagged orientation 6 came out of `heif-convert` still tagged 6. libheif applies the HEIF `irot`/`imir` transforms while decoding, and an iPhone HEIC carries both `irot` and an EXIF orientation. Calling `sharp().rotate()` (auto-orient) on the decoded JPEG would then rotate it a second time. Not verified with a real iPhone file, because `heif-enc` 1.15 cannot write `irot`.

**Video poster from a presigned URL, 0.5 CPU / 512 MB:**

| Clip | Command | Wall time | Peak RSS | Bytes read |
|---|---|---|---|---|
| 2 GB H.264 1080p | `ffprobe -v error -show_entries format=duration -of csv=p=0 <url>` | 1.25–1.31 s (4.5 s on the first, cold read) | 57 MB | 6–14 MB |
| 2 GB H.264 1080p | `ffmpeg -v error -ss 1 -i <url> -frames:v 1 -vf scale=1600:-2 -f image2pipe -c:v png -` (threads auto) | 4.2–6.6 s | 187 MB | 72–80 MB |
| 2 GB H.264 1080p | same, with **`-threads 1`** | **2.7 s** | **73 MB** | 61 MB |
| 4K HEVC | ffprobe | 0.5 s | 52 MB | 5.6 MB |
| 4K HEVC | `-ss 1` poster, threads auto | 18.9 s | **433 MB**; a second run (frame at 30 s) was **OOM-killed (signal 9)** | 28 MB |
| 4K HEVC | `-ss 1` poster, **`-threads 1`** | **4.9 s** | **174 MB** | 26 MB |
| 2 GB H.264 1080p | frame at 30 s (threads auto) | 17.7–21.7 s | 196 MB | 234 MB |

- ffmpeg reads with HTTP range requests: `bytes=0-`, then a seek to the moov at the end, then the start of `mdat`. Only 26–80 MB of a 2 GB object are transferred for a poster at 1 s.
- Inside a CPU-limited container, ffmpeg sees every host core (`nproc` = 10 with `--cpus=0.5`) and starts that many decoder threads. That is what pushed 4K HEVC past 512 MB.
- PNG frame → poster WebP 1600×900 + thumbnail 480×270 with sharp took 0.3–0.4 s.

**Pass criteria:**
- HEIC 12 MP → 1600 px WebP in < 5 s with peak RSS < 400 MB: **pass** via (a′), 2.0 s / 91 MB.
- Poster from a 2 GB moov-at-end MOV in < 15 s with < 200 MB RSS: **pass with `-threads 1`**: 2.7 s / 73 MB (H.264 1080p) and 4.9 s / 174 MB (4K HEVC). It **fails without `-threads 1`** for 4K HEVC.

**Image size:** + **409 MB** uncompressed on arm64 (`ffmpeg` with `--no-install-recommends` 398 MB, mostly libavcodec/libavdevice dependencies; `libheif-examples` 10.2 MB). sharp adds about 19 MB of prebuilt binaries (`node_modules/@img`). A static ffmpeg build could make the image smaller later; that is not needed for MVP.

**Licences** (from `/usr/share/doc/*/copyright` and npm):
- libheif LGPL-3+ (parts GPL-3+ / MIT); libde265 LGPL-3+.
- Debian's ffmpeg is built `--enable-gpl` with x264/x265, so the binary is **GPL**. We only run it as a separate CLI process inside our own image and do not distribute the image.
- sharp Apache-2.0; libvips binaries LGPL-3.0-or-later.
- `heic-decode` ISC (last release 2025-07-04); `libheif-js` LGPL-3.0.

**For the owner (legal, not engineering):** decoding HEVC (HEIC photos, iPhone videos) raises patent-licensing questions for commercial use. This needs a legal review before production.

**Decision [C12]: libheif CLI `heif-convert` to a temporary JPEG at quality 92, then sharp.** WASM `heic-decode` remains the fallback if the CLI becomes unavailable; it is slower and uses about 270 MB. For video: Debian `ffmpeg`/`ffprobe` reading the presigned URL, always with `-threads 1`.

### Implementation notes (processing, Phase 4 PR D, 2026-10-04)

- **Jobs:** `media.image-derivatives` (photos) and `media.video-poster` (videos), enqueued in the upload's completion transaction. Handlers live in `apps/api/src/worker/handlers/`, the media code in `apps/api/src/worker/media/`.
- **Images:** the original (≤ 50 MB) is streamed to a private temp directory (`ObjectStorage.downloadToFile`), never held in memory. HEIC/HEIF is decoded by `heif-dec` where it exists (libheif ≥ 1.17: Homebrew, Ubuntu 24.04 CI), else `heif-convert` (the worker image), `-q 92` to a temporary JPEG, then sharp **without** auto-orientation (libheif already applied `irot`/`imir` and kept the EXIF tag). Every other format is auto-oriented from EXIF. Thumbnail 480 px and preview 1600 px (longest side, never enlarged), WebP q 70/80, no metadata (EXIF/GPS never copied; tested). `limitInputPixels` 100 MP; `sharp.cache(false)`, `sharp.concurrency(1)`. Animated GIF/WebP: the first frame.
- **Videos:** ffprobe (duration, displayed size with the rotation applied) and ffmpeg (one PNG frame at `min(1 s, duration / 2)`, at most 1600 px wide) read a 15-minute presigned GET URL. Always `-threads 1`, `-rw_timeout` 30 s, a hard timeout (30 s probe, 60 s frame, SIGKILL), `-protocol_whitelist` with the URL's own scheme (`https,tls,tcp`; `http,tcp` for the emulator) and **`-format_whitelist mov,mp4,m4a,3gp,3g2,mj2,matroska,webm`**. The format whitelist is what stops a playlist: with the protocol whitelist alone, an HLS file stored as a "video" made ffmpeg fetch the URL it named, an internal host included (tested; the test fails without the format whitelist). Presigned URLs are removed from tool errors before they reach logs. The poster is 1600 px; the grid uses the 480 px THUMBNAIL for every kind.
- **Keys and rows:** `collections/{cid}/derived/{contentItemId}/{thumbnail|preview|poster}.webp`, from database ids only. Rows are upserted on `(contentItemId, role)`, with the ORIGINAL's width, height and duration, in one transaction that first sets `READY` only where `deletedAt IS NULL`; for an item deleted meanwhile nothing is recorded and the objects just written are deleted. A rerun overwrites the same keys and rows. Derivative bytes count in storage usage through their `MediaObject` rows; the content purge already deletes the derived prefix.
- **Failure:** an input the tools cannot decode (corrupt, unsupported, over the pixel limit, no video stream, not a whitelisted format) is a `PermanentMediaError`: the item becomes `FAILED` at once and the job ends. Any other error is retried (`JOB_OPTIONS`: 5 retries, 30 s doubling); the last failed attempt (`retryCount ≥ retryLimit`) runs the handler's `onFinalFailure`, which sets `FAILED`. Only a `PENDING` item becomes `FAILED`. The original always stays; the grid shows the type tile and the viewer «Завантажити».
- **Not covered:** a job that pg-boss expires on its last attempt (`expireInSeconds` 600, far above the tool timeouts) never runs `onFinalFailure`, so its item stays `PENDING`; the sweep does not look for those yet. Grids stop asking about frames pending for more than 30 minutes.
- **Measured** (Apple Silicon; worker image, linux/arm64, limited to 0.5 CPU and 512 MB, second run): 12 MP HEIC → decode 1.6 s + sharp 0.4 s; 12 MP JPEG → sharp 0.4 s; 10 s H.264 1080p over HTTP → ffprobe 0.2 s + frame 0.4 s + sharp 0.2 s; peak RSS of the Node process 156 MB. Natively on the host (unconstrained): 0.7 + 0.15 s, 0.16 s, 0.02 + 0.14 + 0.06 s. Render runs x86-64; not measured there.
- **Image:** the worker image is 1.48 GB against the API's 917 MB (arm64, uncompressed). `docker/scripts/verify-images.sh` checks libde265 and the hevc/h264 decoders as the runtime user, that the API image has none of the tools, and runs the media code inside the image.
