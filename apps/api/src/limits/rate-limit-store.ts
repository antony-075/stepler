import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { deriveKey } from '../crypto/keys.js';
import { PrismaService } from '../database/prisma.service.js';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

interface CounterRow {
  hits: number;
  windowMs: number;
  blockedMs: number | null;
}

/**
 * Rate-limit and sign-in-failure counters in PostgreSQL (`RateLimitCounter`, launch checklist
 * 4.4), so every API instance counts the same requests. Each key is one fixed window: the first
 * hit opens it for `ttl`, later hits add to it, and a key over its limit is refused for
 * `blockDuration` without counting further. One statement per hit (an upsert on the primary
 * key), timed by the database clock, so instances whose clocks differ still agree.
 *
 * Keys are stored as an HMAC (HKDF key "rate-limit"): `@nestjs/throttler` hands over a plain
 * SHA-256 of the route and the IP, which anyone could reverse by trying every IPv4 address.
 */
@Injectable()
export class RateLimitStore implements ThrottlerStorage {
  private readonly hmacKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) env: Pick<ApiEnv, 'APP_SECRET'>,
  ) {
    this.hmacKey = deriveKey(env.APP_SECRET, 'rate-limit');
  }

  /** `@nestjs/throttler`'s storage: `ttl` and `blockDuration` in ms, the answer in seconds. */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const block = blockDuration > 0 ? blockDuration : ttl;
    const row = await this.hit(`${throttlerName}:${key}`, ttl, limit, block);
    const isBlocked = row.blockedMs !== null;
    return {
      totalHits: row.hits,
      timeToExpire: seconds(row.windowMs),
      isBlocked,
      timeToBlockExpire: isBlocked ? seconds(row.blockedMs ?? 0) : 0,
    };
  }

  /** Seconds until `key` may try again once `limit` hits are used up, or `null` while it may. */
  async blockedFor(key: string, limit: number): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ hits: number; windowMs: number }[]>`
      SELECT "hits", (EXTRACT(EPOCH FROM ("windowEndsAt" - now())) * 1000)::float8 AS "windowMs"
      FROM "RateLimitCounter"
      WHERE "key" = ${this.storedKey(key)} AND "windowEndsAt" > now()`;
    const row = rows[0];
    return row === undefined || row.hits < limit ? null : seconds(row.windowMs);
  }

  /** Counts one hit of `key` in its window (opened for `windowMs` by the first), no blocking. */
  async record(key: string, windowMs: number): Promise<void> {
    await this.hit(key, windowMs, Number.MAX_SAFE_INTEGER, windowMs);
  }

  async clear(key: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM "RateLimitCounter" WHERE "key" = ${this.storedKey(key)}`;
  }

  private async hit(key: string, ttl: number, limit: number, block: number): Promise<CounterRow> {
    // A blocked key keeps its count and window; an ended window or block starts again at 1.
    const rows = await this.prisma.$queryRaw<CounterRow[]>`
      INSERT INTO "RateLimitCounter" AS c ("key", "hits", "windowEndsAt", "blockedUntil")
      VALUES (
        ${this.storedKey(key)},
        1,
        now() + ${ttl}::float8 * interval '1 millisecond',
        CASE WHEN 1 > ${limit}::float8 THEN now() + ${block}::float8 * interval '1 millisecond' END
      )
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE
          WHEN c."blockedUntil" > now() THEN c."hits"
          WHEN c."windowEndsAt" <= now() OR c."blockedUntil" <= now() THEN 1
          ELSE c."hits" + 1 END,
        "windowEndsAt" = CASE
          WHEN c."blockedUntil" > now() THEN c."windowEndsAt"
          WHEN c."windowEndsAt" <= now() OR c."blockedUntil" <= now() THEN now() + ${ttl}::float8 * interval '1 millisecond'
          ELSE c."windowEndsAt" END,
        "blockedUntil" = CASE
          WHEN c."blockedUntil" > now() THEN c."blockedUntil"
          WHEN (CASE WHEN c."windowEndsAt" <= now() OR c."blockedUntil" <= now() THEN 1 ELSE c."hits" + 1 END) > ${limit}::float8
            THEN now() + ${block}::float8 * interval '1 millisecond'
          END
      RETURNING
        "hits",
        (EXTRACT(EPOCH FROM ("windowEndsAt" - now())) * 1000)::float8 AS "windowMs",
        CASE WHEN "blockedUntil" > now()
          THEN (EXTRACT(EPOCH FROM ("blockedUntil" - now())) * 1000)::float8 END AS "blockedMs"`;
    const row = rows[0];
    if (row === undefined) throw new Error('rate-limit upsert returned no row');
    return row;
  }

  private storedKey(key: string): string {
    return createHmac('sha256', this.hmacKey).update(key).digest('base64url');
  }
}

/** Whole seconds, rounded up; the interval's float can land a hair over a whole second. */
const seconds = (ms: number): number => Math.max(1, Math.ceil(Math.round(ms) / 1000));
