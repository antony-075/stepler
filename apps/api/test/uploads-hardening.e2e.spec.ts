import { randomUUID } from 'node:crypto';
import { createServer, type Server as NetServer, type Socket } from 'node:net';
import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { ApiEnv } from '../src/config/env.js';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { PgBossClient, PgBossQueue, senderBossOptions } from '../src/jobs/pg-boss-queue.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage/object-storage.js';
import { ExpireUploadsHandler } from '../src/worker/handlers/expire-uploads.handler.js';
import { listenOnLoopback } from './support/app.js';
import { queuedJobs, resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv } from './support/env.js';
import { joinAsGuest, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';
import { asSession, fixture, uploadCalls, uploadFile } from './support/uploads.js';

// Review fixes I2 and minors: claimed completion, rate limits, storage deadlines, the link and
// collection re-checked after storage, duplicate initiation near the quota, log hygiene.

/** Collects everything pino writes. */
class CaptureStream extends Writable {
  output = '';
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.output += chunk.toString();
    done();
  }
}

const prisma = new PrismaService(testEnv());
const boss = new PgBossClient(senderBossOptions(TEST_DATABASE_URL));
const queue = new PgBossQueue(boss);
const MINUTE_MS = 60_000;

async function start(env: ApiEnv, logs?: Writable) {
  const app = await createApp(env, logs === undefined ? {} : { logDestination: logs });
  await listenOnLoopback(app);
  const server = app.getHttpServer() as Server;
  const tokens = app.get(GuestLinkTokens);
  const guest = async (options: { ownerId?: string } = {}) => {
    const seeded = await seedCollection(prisma, tokens, options);
    const cookie = await joinAsGuest(server, seeded.collectionId, seeded.link.token);
    return { ...seeded, cookie, calls: uploadCalls(server, seeded.collectionId, cookie) };
  };
  return { app, server, tokens, guest };
}

type Started = Awaited<ReturnType<typeof start>>;

beforeAll(async () => {
  await boss.start();
});

afterAll(async () => {
  await boss.stop();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

describe('claimed completion', () => {
  let s: Started;
  const logs = new CaptureStream();

  beforeAll(async () => {
    s = await start(testEnv({ LOG_LEVEL: 'info' }), logs);
  });

  afterAll(async () => {
    await s.app.close();
  });

  /** Puts the upload into a claim made `ageMs` ago, as a crashed completion would leave it. */
  const claimed = (uploadId: string, ageMs: number) =>
    prisma.uploadSession.update({
      where: { id: uploadId },
      data: { status: 'COMPLETING', claimedAt: new Date(Date.now() - ageMs) },
    });

  test('a fresh claim: complete and cancel get 409 UPLOAD_IN_PROGRESS, retryable', async () => {
    const g = await s.guest();
    const session = await uploadFile(g.calls, 'a.pdf', fixture('doc.pdf'));
    await claimed(session.uploadId, 0);
    const res = await g.calls.complete(session.uploadId).expect(409);
    expect(res.body).toMatchObject({ code: 'UPLOAD_IN_PROGRESS', retryable: true });
    expect(res.headers['retry-after']).toBe('2');
    await g.calls.cancel(session.uploadId).expect(409);
    await g.calls.parts(session.uploadId, [1]).expect(409);
  });

  test('a stale claim (a crashed completion) is claimed again and completes', async () => {
    const g = await s.guest();
    const session = await uploadFile(g.calls, 'a.pdf', fixture('doc.pdf'));
    await claimed(session.uploadId, 10 * MINUTE_MS);
    await g.calls.complete(session.uploadId).expect(200);
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.uploadId } });
    expect(row).toMatchObject({ status: 'COMPLETED', claimedAt: null });
  });

  test('a stale claim past the TTL is expired by the job; a fresh one is left alone', async () => {
    const g = await s.guest();
    const stale = asSession(
      (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: 10 }).expect(201)).body,
    );
    const fresh = asSession(
      (await g.calls.initiate({ filename: 'b.pdf', sizeBytes: 10 }).expect(201)).body,
    );
    await claimed(stale.uploadId, 10 * MINUTE_MS);
    await claimed(fresh.uploadId, 0);
    await prisma.uploadSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await new ExpireUploadsHandler(prisma, queue).handle();
    const rows = await prisma.uploadSession.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows.map((row) => row.status)).toEqual(['EXPIRED', 'COMPLETING']);
    expect(rows[0]?.claimedAt).toBeNull();
  });

  test('a claimed upload still counts as open: the concurrency limit includes it', async () => {
    const s2 = await start(testEnv({ LIMIT_CONCURRENT_UPLOADS_PER_GUEST_SESSION: '1' }));
    try {
      const g = await s2.guest();
      const session = asSession(
        (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: 10 }).expect(201)).body,
      );
      await claimed(session.uploadId, 0);
      await g.calls.initiate({ filename: 'b.pdf', sizeBytes: 10 }).expect(429);
    } finally {
      await s2.app.close();
    }
  });

  test('the link paused while storage is checked: REJECTED with the state, bytes discarded', async () => {
    const g = await s.guest();
    const session = await uploadFile(g.calls, 'a.pdf', fixture('doc.pdf'));
    const storage = s.app.get<ObjectStorage>(OBJECT_STORAGE);
    const head = storage.head.bind(storage);
    storage.head = async (key) => {
      await prisma.guestLink.update({ where: { id: g.link.id }, data: { status: 'INACTIVE' } });
      return head(key);
    };
    try {
      const res = await g.calls.complete(session.uploadId).expect(403);
      expect(res.body).toMatchObject({ code: 'LINK_INACTIVE' });
    } finally {
      storage.head = head;
    }
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.uploadId } });
    expect(row).toMatchObject({ status: 'REJECTED', rejectReason: 'LINK_INACTIVE' });
    expect(await prisma.contentItem.count()).toBe(0);
    expect(await queuedJobs(prisma, 'storage.discard-upload')).toHaveLength(1);
  });

  test('documents switched off while storage is checked: REJECTED FORBIDDEN', async () => {
    const g = await s.guest();
    const session = await uploadFile(g.calls, 'a.pdf', fixture('doc.pdf'));
    const storage = s.app.get<ObjectStorage>(OBJECT_STORAGE);
    const head = storage.head.bind(storage);
    storage.head = async (key) => {
      await prisma.guestLink.update({
        where: { id: g.link.id },
        data: { canUploadDocuments: false },
      });
      return head(key);
    };
    try {
      await g.calls.complete(session.uploadId).expect(403);
    } finally {
      storage.head = head;
    }
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.uploadId } });
    expect(row).toMatchObject({ status: 'REJECTED', rejectReason: 'FORBIDDEN' });
  });

  test('the collection archived while storage is checked: REJECTED COLLECTION_ARCHIVED', async () => {
    const g = await s.guest();
    const session = await uploadFile(g.calls, 'a.pdf', fixture('doc.pdf'));
    const storage = s.app.get<ObjectStorage>(OBJECT_STORAGE);
    const range = storage.readRange.bind(storage);
    storage.readRange = async (key, start, end) => {
      await prisma.collection.update({
        where: { id: g.collectionId },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      return range(key, start, end);
    };
    try {
      const res = await g.calls.complete(session.uploadId).expect(403);
      expect(res.body).toMatchObject({ code: 'COLLECTION_ARCHIVED' });
    } finally {
      storage.readRange = range;
    }
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.uploadId } });
    expect(row).toMatchObject({ status: 'REJECTED', rejectReason: 'COLLECTION_ARCHIVED' });
  });

  test('missing parts give the claim back: the upload stays open', async () => {
    const g = await s.guest();
    const session = asSession(
      (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: 10 }).expect(201)).body,
    );
    await g.calls.complete(session.uploadId).expect(409);
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.uploadId } });
    expect(row).toMatchObject({ status: 'INITIATED', claimedAt: null });
  });

  test('no presigned URL, signature or cookie in the logs of a whole upload', async () => {
    logs.output = '';
    const g = await s.guest();
    const session = await uploadFile(g.calls, 'a.pdf', fixture('doc.pdf'));
    await g.calls.complete(session.uploadId).expect(200);
    await g.calls.complete(randomUUID()).expect(404);
    expect(logs.output).toContain('upload completed');
    expect(logs.output).not.toMatch(/X-Amz-|https?:\/\/127\.0\.0\.1:\d+\/stepler-test/);
    expect(logs.output).not.toContain(g.cookie.split('=')[1] ?? 'never');
    expect(logs.output).not.toContain('a.pdf');
  });

  test('an admin cookie without a guest cookie gets 401 on upload routes', async () => {
    const owner = await signInAs(s.app, prisma, 'olena@example.com');
    const g = await s.guest({ ownerId: owner.userId });
    const session = asSession(
      (await g.calls.initiate({ filename: 'a.pdf', sizeBytes: 10 }).expect(201)).body,
    );
    const admin = uploadCalls(s.server, g.collectionId, owner.cookie);
    for (const res of [
      await admin.initiate({ filename: 'b.pdf', sizeBytes: 10 }),
      await admin.parts(session.uploadId, [1]),
      await admin.complete(session.uploadId),
      await admin.cancel(session.uploadId),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'GUEST_SESSION_REQUIRED' });
    }
  });
});

describe('rate limits on upload calls', () => {
  test('per guest session and per IP: 429 RATE_LIMITED with Retry-After', async () => {
    const s = await start(
      testEnv({
        LIMIT_UPLOAD_CALLS_PER_GUEST_SESSION_PER_MINUTE: '3',
        LIMIT_UPLOAD_CALLS_PER_IP_PER_MINUTE: '5',
      }),
    );
    try {
      const a = await s.guest();
      for (let i = 0; i < 3; i += 1) {
        await a.calls.initiate({ filename: `${i}.pdf`, sizeBytes: 10 }).expect(201);
      }
      const limited = await a.calls.initiate({ filename: 'x.pdf', sizeBytes: 10 }).expect(429);
      expect(limited.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

      // Another guest on the same IP has its own session budget, but the IP's is shared:
      // 4 calls so far (one refused), the 5th passes, the 6th is refused.
      const b = await s.guest();
      await b.calls.initiate({ filename: 'b1.pdf', sizeBytes: 10 }).expect(201);
      await b.calls.initiate({ filename: 'b2.pdf', sizeBytes: 10 }).expect(429);
    } finally {
      await s.app.close();
    }
  });
});

describe('duplicate initiation near the quota', () => {
  test('two concurrent initiations with one clientUploadId: one session, both 201', async () => {
    const s = await start(testEnv({ LIMIT_STORAGE_BYTES_PER_COLLECTION: '10000000' }));
    try {
      const g = await s.guest();
      const clientUploadId = randomUUID();
      const body = { filename: 'clip.mp4', sizeBytes: 6_000_000, clientUploadId };
      const results = await Promise.all([g.calls.initiate(body), g.calls.initiate(body)]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(asSession(results[0]?.body).uploadId).toBe(asSession(results[1]?.body).uploadId);
      expect(await prisma.uploadSession.count()).toBe(1);
    } finally {
      await s.app.close();
    }
  });
});

describe('storage deadlines', () => {
  let silent: NetServer;
  const sockets: Socket[] = [];
  let port = 0;

  beforeAll(async () => {
    // Accepts connections and never answers: a hung storage.
    silent = createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    port = (silent.address() as { port: number }).port;
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.destroy();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => silent.close(() => resolve()));
  });

  test('a hung storage call → 503 DEPENDENCY_UNAVAILABLE (retryable) within its deadline', async () => {
    const s = await start(
      testEnv({ S3_ENDPOINT: `http://127.0.0.1:${port}`, S3_REQUEST_TIMEOUT_MS: '500' }),
    );
    try {
      const g = await s.guest();
      const startedAt = Date.now();
      const res = await g.calls.initiate({ filename: 'a.pdf', sizeBytes: 10 }).expect(503);
      expect(res.body).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', retryable: true });
      expect(Date.now() - startedAt).toBeLessThan(5_000);
      expect(await prisma.uploadSession.count()).toBe(0);
    } finally {
      await s.app.close();
    }
  });
});
