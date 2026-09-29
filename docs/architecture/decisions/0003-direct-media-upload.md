# ADR 0003 — Direct Browser Upload for Large Media

Status: Accepted
Date: 2026-09-29

## Decision

Large binary files are uploaded directly from the browser to object storage using short-lived signed authorization issued by the backend.

NestJS must not proxy large media through the API unless a future requirement explicitly requires it.

## Consequences

Positive:
- lower API bandwidth;
- better upload scalability;
- lower backend resource usage.

Required complexity:
- upload sessions;
- expiration;
- retry;
- completion verification;
- orphan cleanup.
