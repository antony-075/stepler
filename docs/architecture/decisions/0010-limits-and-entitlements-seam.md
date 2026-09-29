# ADR 0010 — Configurable Limits and Entitlements Seam

Status: Accepted (values accepted in discovery D2, F1)
Date: 2026-09-29

## Context

Open registration without billing requires hard limits. Future plans must be able to change limits per account/collection without rewriting business logic.

## Decision

- All limits live in typed, validated configuration; changing them needs no migration.
- `LimitsService.forUser()` / `forCollection()` is the single resolver of effective limits — the future entitlements seam.
- Storage usage counts all media objects (originals and derivatives) of non-deleted content plus reservations of active upload sessions. Deleted content stops counting immediately.
- Domain limits are derived from database rows; IP-based rate limits use `@nestjs/throttler` with storage chosen alongside hosting.
- Accounts can be blocked by the operator.

## Alternatives considered

- Counter columns — faster reads, drift risk; add only if measured.
- Plan/entitlement tables now — premature without billing.

## Consequences

- Aggregate queries on upload initiation; acceptable at MVP scale, measured later.
