# ADR 0004 — REST API Conventions

Status: Accepted
Date: 2026-09-29

## Context

Rules require a versioned REST API with predictable errors, pagination and idempotency. `overview.md` left versioning open. Guest and admin clients have different principals and must not share response shapes.

## Decision

- URI versioning: `/api/v1`.
- Errors: RFC 9457 `application/problem+json` with a stable machine-readable `code` and `retryable` flag. The API does not return localized prose; clients translate codes.
- Cursor pagination over `(createdAt, id)`, opaque cursor, `limit` ≤ 100.
- Idempotency: `clientUploadId` for upload initiation; `Idempotency-Key` header for text submissions and reports; idempotent upload completion.
- Separate guest namespace `/api/v1/guest/collections/{collectionId}/...` with its own controllers and DTOs over shared services.
- Resources outside the principal's scope return 404.
- OpenAPI generated from contracts (ADR 0005), snapshotted and diffed in CI.

## Alternatives considered

- Header/media-type versioning — less visible, harder to route and debug.
- No versioning until launch — cheap to add now, painful after clients exist.
- One namespace for guest and admin — fewer controllers, but higher risk of leaking admin fields and harder IDOR review.

## Consequences

- Two controller sets for overlapping features.
- Error codes become part of the public contract and need documentation.
