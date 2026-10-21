# ADR 0021 — Rate limits counted in PostgreSQL

Status: Accepted (2026-10-22)
Date: 2026-10-22

## Context

Every per-IP, per-session and per-user limit (`@nestjs/throttler`, `RateLimitGuard`) and the sign-in failure windows (`LoginFailures`, ADR 0019) were counted in the API process's memory. That holds for one instance only:

- a second instance (spec §21, launch checklist 4.4) would count its own requests, so every limit would double;
- Render's zero-downtime deploy runs the old and new instance side by side for a while;
- every deploy or restart reset all windows, including the sign-in failure limits.

Open question 5 of the architecture spec left the shared store to the hosting decision.

## Decision

- One table, `RateLimitCounter`: `key`, `hits`, `windowEndsAt`, `blockedUntil`, with the key as primary key. It is `UNLOGGED`: no WAL for a row written on every limited request. A database crash may empty it, which only resets the current windows.
- `RateLimitStore` implements `@nestjs/throttler`'s `ThrottlerStorage` and serves `LoginFailures` (`blockedFor`, `record`, `clear`). Semantics stay as before:
  - each key is one fixed window: the first hit opens it for the limit's `ttl`;
  - a key over its limit is refused for `blockDuration` (the `ttl`) without counting further;
  - an ended window or block starts again at one.
- **One statement per hit:** an `INSERT … ON CONFLICT DO UPDATE … RETURNING` on the primary key. It is atomic under concurrency and timed by the database clock, so instances whose clocks differ still agree.
- **Keys are an HMAC** (HKDF key `rate-limit` from `APP_SECRET`) of the limit's name and the throttler's key. The throttler hands over a plain SHA-256 of route and IP, which a list of every IPv4 address reverses. Neither an IP nor an address is stored.
- The worker's hourly `maintenance.sweep` deletes the counters whose window and block have both ended, in batches.

## Alternatives considered

- **Redis or Valkey.** It is the usual store for this, but it is another paid service to run, secure and monitor for a load PostgreSQL carries easily. The project rules ask for a concrete requirement before new infrastructure. Revisit if the counters show up in database metrics.
- **A sticky load balancer, so each IP always reaches one instance.** Render does not offer it, and a guest's session and IP limits would still split across instances.
- **Keeping memory and dividing each limit by the instance count.** It is wrong whenever traffic is uneven, and it still resets on every deploy.

## Consequences

- Every rate-limited request makes one more write to PostgreSQL: a single-row upsert on a primary key, without WAL. At the load test's peak (600 uploads in two minutes, several limited calls each) that is tens of writes a second.
- If the database is down, limited routes fail with it. They mostly need the database anyway.
- Windows survive deploys and restarts, and are shared during a zero-downtime deploy.
- The Privacy Policy line on rate-limit counters (kept in server memory) changes: they are kept in the database as a keyed hash and deleted within hours (v3 draft, for the lawyer).
- Tests: `test/rate-limit-store.e2e.spec.ts` covers two stores on two connection pools sharing one window, parallel hits, the reset after a window or block, the HMAC key, shared sign-in failures and the sweep.
