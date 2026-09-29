# ADR 0008 — Upload Sessions and Storage Lifecycle

Status: Accepted (extends ADR 0003; R2 specifics pending spike S4)
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
