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

Not tested in the spike (Task 8 decides and tests): signing `Content-Length` on each part URL so a part cannot exceed the fixed part size.

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
