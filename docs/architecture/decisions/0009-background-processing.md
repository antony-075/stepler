# ADR 0009 — Background Processing with a PostgreSQL-Backed Queue

Status: Accepted (owner selected option D1(a)); library pg-boss per spike S7; implemented for purges and sweeps (Phase 4 PR B, 2026-10-03), media jobs pending
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

- **Port:** `JobQueue.enqueue(tx, name, data, options?)` in `apps/api/src/jobs`; jobs are sent through the caller's Prisma transaction (pg-boss `fromPrisma`), so a job exists if and only if its state change commits. Payloads carry ids and an optional `requestId`, never user content.
- **Queues:** created by every process at start with `policy: 'exclusive'` and the retry/expiry options in `JOB_OPTIONS`; every job carries a per-entity singleton key (`content.purge:{id}` …, the queue name for periodic jobs).
- **API:** sender only (`max: 2`, no supervision, no cron), started in the background so the API still boots while PostgreSQL is down; the first send retries the start.
- **Worker:** pg-boss pool 5, Prisma pool 5; one job per fetch, polled every 2 s; supervision and cron run here. Logs carry `jobId`, `name` and `requestId` only. SIGTERM stops polling and gives running jobs 30 s.
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
