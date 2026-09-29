# ADR 0009 — Background Processing with a PostgreSQL-Backed Queue

Status: Accepted (owner selected option D1(a); library pending spike S7)
Date: 2026-09-29

## Context

MVP needs image thumbnails/previews (including HEIC), video posters, asynchronous storage deletion and upload expiry. The API must not do heavy media work synchronously. CLAUDE.md forbids adding a queue/infra component without justification.

## Decision

- Separate `apps/worker` process from the same codebase.
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
