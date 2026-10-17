# ADR 0008 — Upload Sessions and Storage Lifecycle

Status: Accepted (extends ADR 0003; emulator chosen in spike S4, R2 specifics verified in staging)
Date: 2026-09-29

## Context

Files up to 2 GB from mobile networks must upload directly to R2 (EU). The backend owns authorization, quotas, completion and metadata. Retries, duplicate completion, cancellation, expiry and revocation during upload must be safe.

## Decision

- `UploadSession` per file, idempotent on `(guestSessionId, clientUploadId)`; states `INITIATED → COMPLETED | ABORTED | EXPIRED | REJECTED`; TTL 24 h.
- ≤ 100 MB: single presigned PUT with signed Content-Type/Content-Length. Larger: multipart with fixed part size and on-demand part URLs (15 min TTL).
- Quotas (collection and account) checked at initiation including reservations, under a row lock.
- Completion: re-authorize now; server-side `ListParts` + `CompleteMultipartUpload`; `HeadObject` size check; range read of first bytes for signature detection; transactional creation of content + media object + job enqueue. Failure → `REJECTED` + object deletion job.
- Keys: `collections/{collectionId}/uploads/{uploadSessionId}/original` and `collections/{collectionId}/derived/{contentItemId}/{variant}`; no user data in keys.
- Downloads: presigned GET, 1 h TTL aligned to windows; response content type from verified MIME; documents as attachment.
- Cleanup: scheduled expiry job + R2 lifecycle rule for incomplete multipart uploads.

## Alternatives considered

- Proxy through NestJS — rejected by ADR 0003.
- tus — requires a server in the data path.
- Presigned POST policies — not supported by R2.
- Staging prefix + copy on completion — server-side copy of 2 GB objects adds latency and cost.

## Consequences

- Size limits are enforced at completion, so oversized bytes may briefly exist in storage before cleanup.
- Local emulator cannot reproduce all R2 behavior; staging smoke tests are required.

## Spike S4 result (2026-09-29)

Question: which S3-compatible emulator do local development and CI use, now that MinIO's repository is archived and its Docker Hub image is gone? Which S3 client settings make presigned uploads work?

Candidates, each run from Docker and tested with one script (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 3.1141.0, Node 24):

| Criterion | SeaweedFS 4.48 | RustFS 1.0.0 | Garage v2.4.1 |
|---|---|---|---|
| Licence | Apache-2.0 | Apache-2.0 | AGPL-3.0 |
| 1. `HeadBucket` | pass | pass | pass |
| 2. Presigned PUT, signed `Content-Type` + `Content-Length` | pass; wrong length → 403, wrong type → 403, expired → 403 | pass; same | pass; expired → 400 |
| 3. Presigned GET, `response-content-disposition` | pass | pass | pass |
| 4. Multipart with presigned part URLs, `ListParts`, `CompleteMultipartUpload` (5 MiB + 5 MiB + 1 234 B) | pass | pass | pass |
| 5. Bucket CORS: allowed origin preflight; other origin denied; `ETag` exposed on the real PUT | pass | pass | pass, but a denied preflight still returns `Access-Control-Allow-Origin: *` |
| 6. Healthy from a fresh container | ≈ 2 s (`/healthz`); 5 s to compose `healthy` | < 1 s (`/health`) | < 1 s, but only after manual layout + key + bucket steps |
| Bootstrap | credentials from env; bucket + CORS via S3 API | credentials from env; bucket + CORS via S3 API | `layout assign` + `layout apply` + `key import` + `bucket create` + `bucket allow` via its CLI |
| Image size | 687 MB | 354 MB | 95 MB |

**Decision: SeaweedFS**, `chrislusf/seaweedfs:4.48@sha256:4e61d15fd35994cb1e43e1e553dff106794841fd9a99ade2fc8c8bfce4d7872d`, S3 API on port **8333**.
- SeaweedFS and RustFS both pass everything and bootstrap the same way; Garage needs five CLI steps and has AGPL.
- The tiebreaker is maturity: SeaweedFS has a long release history, while RustFS 1.0.0 went GA on 2026-09-16. RustFS stays the drop-in fallback: the client settings below work unchanged against it. Note that RustFS accepted a single PUT carrying the wrong (empty-body) checksum, so it does not verify checksums on single PUTs; SeaweedFS does.
- The larger image only costs CI pull time.

Compose service, verified (added to `docker/compose.yaml` in Task 8, with credentials taken from `docker/.env`):

```yaml
s3:
  image: chrislusf/seaweedfs:4.48@sha256:4e61d15fd35994cb1e43e1e553dff106794841fd9a99ade2fc8c8bfce4d7872d
  command: ['server', '-dir=/data', '-s3', '-s3.port=8333']
  environment:
    AWS_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID:?set in docker/.env}
    AWS_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY:?set in docker/.env}
  ports:
    - '127.0.0.1:8333:8333'
  volumes:
    - stepler-s3:/data
  healthcheck:
    test: ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:8333/healthz']
    interval: 2s
    timeout: 3s
    retries: 15
```

With these variables set, anonymous requests are rejected (403) and a wrong secret fails.

**Bootstrap: an idempotent API script, not `weed shell`.** `s3.bucket.create` in `weed shell` exits 1 on the second run ("bucket already exists") and cannot set CORS. Task 8 adds a dev/CI-only script, `pnpm --filter @stepler/api storage:bootstrap`, that uses the storage adapter's client: `HeadBucket`, then `CreateBucket` if missing, then `PutBucketCors`. Staging and production buckets are provisioned outside the app.

**S3 client settings (required, also for R2):**
- `forcePathStyle: true` for the emulator (R2 accepts both styles); region `us-east-1` for the emulator, `auto` for R2.
- **`requestChecksumCalculation: 'WHEN_REQUIRED'`** and `responseChecksumValidation: 'WHEN_REQUIRED'`. With SDK defaults, `getSignedUrl` for `PutObject` embeds `x-amz-checksum-crc32=AAAAAA==` (the CRC32 of an empty body) in the URL, so every real upload fails. Seen as `400 BadDigest` on SeaweedFS and Garage, and multipart parts fail the same way on all three. It must be verified against real R2 in staging.
- **`getSignedUrl(..., { signableHeaders: new Set(['content-type']) })`.** Without it, `Content-Type` is silently left out of `X-Amz-SignedHeaders` (only `content-length;host` is signed), so the browser can upload any type. With it, a mismatched type is rejected (403).

**What the emulator does not reproduce (staging-only checks against real R2):**
- R2 requires all multipart parts except the last to be the same size; the emulators accept any sizes;
- no presigned POST policies on R2 (not used, see Alternatives);
- EU-jurisdiction endpoint (`<account>.eu.r2.cloudflarestorage.com`);
- R2's handling of the checksum and signed-header settings above;
- R2 lifecycle rules (abort incomplete multipart uploads).

Not tested in the spike (Task 8 decides and tests): signing `Content-Length` on each part URL so a part cannot exceed the fixed part size. **Closed (PR C, 2026-10-03):** every part URL signs its exact `Content-Length`; a part of another length is refused with 403 on SeaweedFS (`test/storage-multipart.e2e.spec.ts`), and from Chromium and WebKit in spike S9. Still to verify on real R2 in staging (owner smoke test S1).

## Addendum (2026-10-03): every upload is multipart; the single PUT is dropped

**Status:** accepted (owner/coordinator decision after the independent review of PR C, finding I1).

**Context.** The first implementation used one presigned `PUT` for files up to 100 MB (spec §10.2). On SeaweedFS the review proved that such a URL stays writable for its whole TTL (15 min) whatever happens to the upload:
- after cancel, rejection, expiry or an admin delete, the same URL recreates the object: an orphan that no quota counts and no job deletes;
- after a successful completion, a second `PUT` of the same length and type replaces the verified original with arbitrary bytes (HTML instead of a JPEG, or input crafted for the media worker).

Signing `Content-Length` and `Content-Type` does not help: the attacker re-sends a body of the same length and type.

**Decision.** Every upload is a multipart upload, whatever its size; a file up to `UPLOAD_PART_SIZE_BYTES` is one part. Each part URL signs its exact `Content-Length`. The server creates the multipart upload at initiation and is the only party that completes it (`ListParts` → `CompleteMultipartUpload`) or aborts it (cancel, rejection, expiry, collection purge). Either ends the upload, and with it every part URL: a later part `PUT` fails (`NoSuchUpload`), so nothing is writable after the upload closes. The `SINGLE` strategy is removed from the contract, the code and the schema (migration `uploads_multipart_only`).

**Cost.** Two extra API round trips per small file (`POST …/parts`, and the server's `CompleteMultipartUpload` inside `complete`), plus the `CreateMultipartUpload` at initiation. For a phone uploading photos over venue Wi-Fi this is tens of milliseconds per file next to seconds of transfer; accepted.

**Consequences.**
- Discards need no delay: they abort the multipart upload (killing its URLs) and then delete the key.
- The delayed collection purge (`UPLOAD_URL_TTL_SECONDS` + 1 h) stays, as a margin: S3 lets a part `PUT` that is already running finish after an abort.
- The R2 lifecycle rule (abort incomplete multipart uploads after 2 days) now covers every upload a crashed API never recorded.
- Derivative bytes (thumbnails, previews, posters, PR D) are not reserved at initiation; they count once stored. They are small next to originals; accepted.

## Addendum (2026-10-03): completion claims the upload; storage calls have deadlines

**Status:** accepted (review finding I2).

**Context.** The first completion held the upload row lock, and with it a database connection, across `ListParts`, `CompleteMultipartUpload`, `HEAD` and the signature read. With no deadline on storage calls and no rate limit on the route, about 20 parallel completions could exhaust the API's 10-connection pool.

**Decision.**
- **Claim, then check, then record.** A short transaction checks state and permission and sets `COMPLETING` + `claimedAt`. The storage calls run outside any transaction. A second short transaction re-checks the claim, the link and collection state and the per-kind permission, then creates the frame (`COMPLETED`) or records the refusal (`REJECTED`, discard queued). A frame-number failure (collection archived or deleted meanwhile) is a refusal too.
- **Concurrent completions.** A second completion during a claim gets `409 UPLOAD_IN_PROGRESS` (`retryable: true`, `Retry-After: 2`); the web transport waits and asks again. A finished one gets the same item.
- **Crashed claims.** A claim older than `COMPLETION_CLAIM_TTL_SECONDS` (300 s, well above the storage deadlines) is stale: a later completion may claim it again, and the expiry job expires it once the session's TTL has passed. Missing parts or storage trouble give the claim back at once.
- **Quota.** `COMPLETING` uploads keep their reservation and count as open.
- **Storage deadlines** (`S3_REQUEST_TIMEOUT_MS`, default 15 s; `S3_COMPLETE_TIMEOUT_MS`, default 60 s for assembling a multipart upload and for server-side writes; connect timeout 3 s). A timeout is `503 DEPENDENCY_UNAVAILABLE`, retryable.
- **Rate limits** on initiate, parts, complete and cancel, per route: `LIMIT_UPLOAD_CALLS_PER_IP_PER_MINUTE` (600, generous for venue NAT) and `LIMIT_UPLOAD_CALLS_PER_GUEST_SESSION_PER_MINUTE` (240, keyed by a hash of the session cookie).

**Consequences.** A new status (`COMPLETING`) and column (`claimedAt`, CHECK `UploadSession_claim_consistent`). Completion is no longer one atomic transaction: a crash between the steps leaves a stale claim, which the rules above recover.

## Spike S9 result (2026-10-03): the client transport is in-house

Headless Uppy (`@uppy/core` 6.2 + `@uppy/aws-s3` 6.2, 21.9 KB gzip) was measured against an in-house transport (1.3 KB gzip). Uppy 6 dropped the hook API: it signs S3 requests for the browser, which then creates, completes and aborts the multipart upload itself. That contradicts this ADR (the server lists the parts and completes the upload, never trusting client ETags), and it uploads a file's parts one at a time. **Decision: in-house** (`apps/web/src/guest/upload/transport.ts`): XHR `PUT` with `upload.onprogress`; ≤ 3 parts in flight per file; part URLs on demand in batches of ≤ 20; per-part retry with 1+2+4+8+16 s of backoff (a 10 s outage needed four retries; a broken path does not flip `navigator.onLine`); a 403 signs the part again; progress never goes back; cancel aborts every request and cancels on the server. Measured with Playwright on SeaweedFS: 300 MB from Chromium, 120 MB from WebKit (iPhone profile), 3 files at once throttled to 8 Mbit/s with smooth progress, recovery from a 10 s connection drop without user action. Not done: a real iOS Safari device. Full numbers: the spike notes of 2026-10-03 in the plan.

## Implementation notes (uploads, PR C, 2026-10-04)

- Every upload is multipart (addendum above); the API creates it at initiation, the browser sends parts to presigned URLs, the API completes it from `ListParts` and verifies size and content signature (4 KB range read), then records the frame and its `MediaObject(ORIGINAL)`.
- Cleanup: `storage.discard-upload` (rejected, cancelled, expired uploads: abort, then delete the key), `uploads.expire` every 15 minutes (also stale completion claims past their TTL), `content.purge` deletes the original's key and the derivatives, `collection.purge` aborts open uploads and runs only after the upload URL TTL + 1 h.
- Media links (`content/media-urls.ts`): presigned `GET`, signed as of the start of a `MEDIA_URL_WINDOW_SECONDS` window and valid for two, so a URL is stable (cacheable) within a window. Photos and videos open inline; documents only download; every download is an attachment with an RFC 5987 file name.
- Bucket CORS (dev/CI script `storage:bootstrap`, staging owner action R1): `PUT`, `GET`, `HEAD` from the app origins, `ETag` exposed.

## Addendum (2026-10-04): the collection cover shares the upload session (`purpose = COVER`)

**Status:** accepted (owner decision A1, slice 8a; plan `docs/superpowers/plans/2026-10-04-collection-appearance.md`).

**Context.** The owner can give a collection a cover: an uploaded photo (JPEG/PNG/WebP/HEIC/HEIF/GIF ≤ 50 MB) or any guest photo frame. The first admin upload of the product needed the same guarantees as guest uploads: a direct multipart upload the server alone completes (addendum 2026-10-03), quota reservation, verified content, expiry and discard.

**Decision.** One `UploadSession` table for both: `purpose` (`CONTENT` | `COVER`), the guest columns nullable, `uploaderUserId → User` for the admin, a second idempotency key `(uploaderUserId, clientUploadId)`, and CHECKs that a `CONTENT` row has its guest session and link while a `COVER` row has its uploader and is a `PHOTO`. The admin gets its own four routes under `/collections/{id}/cover/uploads` behind the admin session guard (the guest guard and cookie stay guest-only: they are the IDOR boundary). The completion's storage inspection (parts, size, 4 KB signature) is extracted into `UploadInspector` and shared; `uploads.expire`, `storage.discard-upload` and the collection purge's abort of open uploads apply unchanged.

**Both cover sources end as one object layout.** At completion the verified upload is copied server-side (`ObjectStorage.copyObject`, `CopyObject` with `MetadataDirective: REPLACE` and the verified type; same-bucket copies up to 5 GB on R2 and SeaweedFS, verified on SeaweedFS by `storage.e2e.spec.ts`) to `collections/{cid}/cover/{coverId}/original`; «Зробити обкладинкою» copies the frame's ORIGINAL to the same place. One worker path (`media.cover-derivatives`) and one purge path (`cover.purge`), no key column on the cover row.

**Ordering: copy, then record.** The copy happens before the recording transaction, so a cover row never exists without its original. The reverse can happen briefly: a copied object whose transaction then failed, and the upload's own key after a completion (deleted best-effort). Both are listed here deliberately; the collection purge, which deletes the whole prefix, is the backstop, and a lost `cover.purge` leaves at most one cover's three objects orphaned until the collection is deleted.

**Consequences.** Cover bytes (original and derivatives) count toward the collection and account usage from the row; a cover upload's reservation counts like a guest's until it completes. Two new per-route rate limits for the admin cover routes (`LIMIT_ADMIN_COVER_CALLS_PER_IP_PER_MINUTE`, `LIMIT_ADMIN_COVER_CALLS_PER_USER_PER_MINUTE`) and a cap of 3 open cover uploads per collection. Alternatives rejected: a separate `CoverUpload` table and mini flow (duplicates expiry, discard, claim and inspection for one file); routing the admin through the guest controller with an admin principal.

## Addendum (2026-10-05): admin image purposes `BACKGROUND` and `COLLECTION_IMAGE`; uploads bound to their target

**Status:** accepted (guest page templates, PR I; ADR 0017).

- `UploadPurpose` gains `BACKGROUND` and `COLLECTION_IMAGE` beside `COVER`; the purpose is the image slot. `UploadSession_purpose_actor` now reads "every purpose but `CONTENT` has its uploader and nothing of a guest", and `UploadSession_admin_image_is_photo` replaces `UploadSession_cover_is_photo`.
- `UploadSession.imageTarget` (`DRAFT`, `LEGACY_COVER`, `COLLECTION`; CHECK `UploadSession_image_target`: set iff the purpose is not `CONTENT`) records what the upload completes into, fixed at initiation. Every route finds uploads by purpose and target, so a draft cover upload cannot be completed through the legacy cover route, nor a background through the cover route (review M3). Open cover uploads at the upgrade were backfilled `LEGACY_COVER`. The value outlives PR L's contraction (2026-10-05): every pre-PR I cover upload keeps it (ADR 0017).
- The cap of 3 open uploads counts per collection and purpose. The copy-then-record ordering, the shared `UploadInspector`, expiry and discard are unchanged.

## Addendum (2026-10-05): location metadata is stripped from originals once, at ingest

**Status:** accepted (owner decision, 2026-10-05). Amends "originals are immutable" (rule `.claude/rules/08-storage.md`) to "originals are sanitised once at ingest, then immutable".

**Context.** Phones write where a photo or video was taken into the file: EXIF/XMP GPS in photos (JPEG, HEIC, PNG, WebP), and `©xyz`, Apple's `com.apple.quicktime.location.ISO6709` key or `loci` in MP4/MOV. Originals were kept exactly as uploaded, and in a shared gallery any guest can download another guest's original, so a photo taken at home could tell the other guests where that guest lives. Previews never carried metadata (sharp writes none).

**Decision.**
- **What.** Only location metadata is removed, losslessly, with no re-encoding: exiftool deletes its `Location` group (EXIF GPS IFD, XMP GPS, IPTC/XMP place names) and the QuickTime GPS/location tags (`apps/api/src/worker/media/location.ts`). The capture date, orientation, colour profile and camera stay; the image data and the video streams are byte-for-byte the same (tests compare decoded pixels and the MD5 of every stream's packets). WebM, which exiftool cannot write, is remuxed by ffmpeg (`-c copy`, every stream, other tags kept) only when it has a location tag. A `location` key exiftool cannot delete one by one (ffmpeg's `use_metadata_tags`) makes it rebuild the `Keys` box from the tags it knows. Every result is read back with exiftool and ffprobe; any location tag left is a permanent failure. It fails closed in two more ways (review 2026-10-05): a read exiftool reports as incomplete (`Skipping …`, `Truncated …`), and a rewrite that does not keep the photo's size (from its header) or the SHA-256 of every video stream (`-f streamhash`). ffprobe and ffmpeg run with the poster hardening (`-threads 1`, `-max_pixels`, protocol, format and codec whitelists, `BAD_INPUT`); exiftool's `Out of memory!` under its cap is permanent.
- **Where.** The first step of the existing media jobs (`media.image-derivatives`, `media.video-poster`, `media.collection-image`), before any preview, so it runs in the media chain under `MediaSlots` (one at a time) and exiftool under `prlimit --as` (300 MB; an 844 MB MP4 took 6.5 s and 70 MB RSS). The original is downloaded to a temp file (≤ 50 MB photos, ≤ 2 GB videos; its size must equal the response's `Content-Length`), stripped into a second file (at most two copies at any time: the download is deleted as soon as the rewrite is checked, so a 2 GB video needs about 4 GB of temp disk at the peak), and put back under the **same key** with a conditional `PUT` (`If-Match` the downloaded ETag, `ObjectStorage.replaceFromFile`; enforced by SeaweedFS, verified locally; not yet verified on R2/staging: a store that ignored it would still never resurrect a purged original, since the recording transaction deletes the rewrite of a deleted item). A file with nothing to remove is not uploaded. Then one short transaction sets `sanitizedAt` and the original's stored size (`MediaObject.sizeBytes`, or `CollectionImage.originalSizeBytes`), which is what usage sums. Previews are made from the sanitised file, and for photos and admin images they are rendered **before** it replaces the original: that it decodes is part of checking the rewrite (a legacy photo is rendered too, and the result discarded). The video job expires after 30 min instead of 10 (a 2 GB transfer each way), and whole-object transfers get a deadline by size (`S3_COMPLETE_TIMEOUT_MS` + 10 MB/s).
- **Covers and the other admin image slots** get the same step (their originals are never served, only their WebP renditions, but they are kept and can come from any upload).
- **Serving.** A photo's or video's `originalUrl`/`downloadUrl` is issued only once `sanitizedAt` is set (`canServeOriginal`), to the admin and guests alike; `processingStatus` stays `PENDING` until the job is done. One the worker gave up on (`sanitizeFailedAt`) stays the admin's only (it is their collection, and they may need the file); guests never get it. A photo then still gets its previews, which carry no metadata, and is `READY`; a video becomes `FAILED` (guests could not play it); an admin image keeps its renditions. Documents are unchanged and always downloadable.
- **Failure and retries.** A file exiftool or ffmpeg cannot read or rewrite, or with location left after stripping, is permanent: `sanitizeFailedAt` is set at once (as above). `Error writing output file` is a full disk only if the temp disk had less than twice the file free; otherwise it is the file, and permanent. Anything else is retried; the last failed retry sets `sanitizeFailedAt` too (and `FAILED` if still `PENDING`), so a legacy row is never queued again. Retries are idempotent: the downloaded file is never changed, the stored original is replaced whole or not at all, the size is recorded from what is stored (a run that crashed after the upload finds the object clean and records its size), a sanitised row is skipped, and an object that changed or vanished since the download (`412`/`404`) is never overwritten or re-created. An item deleted meanwhile records nothing and its rewritten original is deleted.
- **Backfill.** Rows from before have `sanitizedAt = NULL` (migration `20261005092956_original_location_stripping`, additive). The `maintenance.sweep`, hourly and once at every worker start (so right after a deploy), queues the media job of `READY` photos, videos and admin images with no outcome yet (neither `sanitizedAt` nor `sanitizeFailedAt`) (up to `WORKER_PURGE_BATCH_SIZE` of each, oldest first, not in collections being deleted; partial index `ContentItem_unsanitized_idx`, empty once it has caught up); the job then only sanitises the original and keeps the previews. Until then their originals are not served, and the viewer shows «Готується прев’ю» for such a video. Items that were already `FAILED` are not backfilled: guests no longer get their originals, the admin still does.

**Alternatives considered.**
- *Strip in the browser before upload.* The client is untrusted (rule 09): a modified client, or any upload bypassing it, would keep the location. It would also need a JavaScript HEIC/QuickTime metadata writer.
- *Keep the original and serve a stripped copy.* Doubles the storage of every photo and video (and the usage the owner pays for), and every download path must pick the right copy; the unstripped copy would still be a liability.
- *Re-encode (sharp/ffmpeg) without metadata.* Lossy for photos, slow and lossy for video, and drops the date, orientation and colour profile people expect.
- *A separate `media.sanitize` queue chained before the preview jobs.* One more queue, a second download for photos, and the stalled-item sweep must know it; the step inside the existing jobs needs neither.

**Consequences.**
- The worker image gains exiftool (Debian `libimage-exiftool-perl` 12.57, Perl Artistic or GPL, run as a separate CLI process; about +23 MB); `verify-images.sh` checks it runs as the runtime user and is absent from the API image. Local development needs `exiftool` on `PATH` (`brew install exiftool`); CI installs it.
- A guest no longer sees their own photo's original in the viewer while its preview is being made; the viewer shows «Готується прев’ю» until the job is done.
- Not covered: GPS in timed metadata tracks (dashcams, GoPro GPMF) and in maker notes; embedded media (motion photos with an appended video, MPF secondary images, data after a JPEG's end marker), whose own metadata exiftool does not rewrite; and metadata in documents (PDF and Office files can carry an author or a company): follow-ups.
- Migrations: `20261005092956_original_location_stripping` (`sanitizedAt` and `sanitizeFailedAt` on `ContentItem` and `CollectionImage`, CHECKs `ContentItem_sanitized_media_only`, `ContentItem_sanitize_outcome`, `CollectionImage_sanitize_outcome`, index `ContentItem_unsanitized_idx`).
- To verify on staging (smoke checklist step 8): R2 honours `If-Match` on `PutObject`, and a MOV of about 2 GB finishes within the worker's temp disk.
- **Fix 2026-10-16 (iPhone videos marked `FAILED`).** exiftool with `-G1` reports a warning per track (`Track4:Warning` in an iPhone MOV: «The ExtractEmbedded option may find more tags…»). Only `ExifTool:Warning` was treated as a warning, so the track warning counted as a location tag left after stripping, and the video failed closed. Every `…:Warning` key is now a warning (`isWarning`, `locationTagsOf`): it never counts as a tag, and an incomplete-read warning still fails closed from any group.
