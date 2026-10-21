import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  adminContentDetailSchema,
  adminContentPageSchema,
  contentCountsSchema,
  operatorReportDetailSchema,
  operatorReportPageSchema,
  usageResponseSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { ContentDeletion } from '../src/content/content-deletion.js';
import { createApp } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { JOB_QUEUE, type JobQueue } from '../src/jobs/job-queue.js';
import { MaintenanceSweepHandler } from '../src/worker/handlers/maintenance-sweep.handler.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection, SHARED_GALLERY } from './support/guests.js';
import { signInAs } from './support/sessions.js';

// Slice 9b plan, Task 3: the operator's deletion is a 90-day quarantine — gone for guests and
// from the quota at once, visible (greyed) to its admin, restorable, purged by the sweep after.

const OPERATOR = 'op@stepler.test';
const DAY_MS = 24 * 3600_000;
const FRAME_BYTES = 2_500_000;
const prisma = createTestPrisma();

describe('content quarantine', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ OPERATOR_EMAILS: OPERATOR, MODERATION_QUARANTINE_DAYS: '90' }));
    await listenOnLoopback(app);
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let operator: { cookie: string; userId: string } | undefined;

  beforeEach(async () => {
    await resetDatabase(prisma);
    operator = undefined;
  });

  /** An owner's collection with guest A's text (reported by B) holding 2.5 MB of "files". */
  async function scene() {
    const owner = await signInAs(app, prisma, `owner-${randomUUID()}@example.com`);
    const seeded = await seedCollection(prisma, tokens, {
      ownerId: owner.userId,
      permissions: SHARED_GALLERY,
    });
    const join = () => joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    const [a, b] = [await join(), await join()];
    const textKey = randomUUID();
    const text = await request(server())
      .post(`/api/v1/guest/collections/${seeded.collectionId}/texts`)
      .set('Origin', ORIGIN)
      .set('Cookie', a)
      .set('Idempotency-Key', textKey)
      .send({ body: 'Привіт' })
      .expect(201);
    const item = (text.body as { id: string }).id;
    // Bytes the usage counts (a stand-in for a stored file of this frame).
    await prisma.mediaObject.create({
      data: {
        contentItemId: item,
        role: 'ORIGINAL',
        storageKey: `test/${randomUUID()}`,
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(FRAME_BYTES),
      },
    });
    const report = await request(server())
      .post(`/api/v1/guest/collections/${seeded.collectionId}/content/${item}/reports`)
      .set('Origin', ORIGIN)
      .set('Cookie', b)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'ILLEGAL', locale: 'uk' })
      .expect(201);
    // One operator per test: a second scene reuses the first one's session.
    operator ??= await signInAs(app, prisma, OPERATOR);
    return {
      ...seeded,
      owner,
      operator,
      a,
      b,
      item,
      textKey,
      reportId: (report.body as { id: string }).id,
    };
  }

  type Scene = Awaited<ReturnType<typeof scene>>;

  const opPost = (sc: Scene, path: string, reason = 'Незаконний вміст') =>
    request(server())
      .post(`/api/v1/operator${path}`)
      .set('Origin', ORIGIN)
      .set('Cookie', sc.operator.cookie)
      .send({ reason });
  const admin = (sc: Scene, path: string) =>
    request(server()).get(`/api/v1${path}`).set('Cookie', sc.owner.cookie);
  const adminPost = (sc: Scene, path: string) =>
    request(server()).post(`/api/v1${path}`).set('Origin', ORIGIN).set('Cookie', sc.owner.cookie);
  const guestGet = (sc: Scene, cookie: string) =>
    request(server())
      .get(`/api/v1/guest/collections/${sc.collectionId}/content/${sc.item}`)
      .set('Cookie', cookie);
  const usedBytes = async (sc: Scene) =>
    usageResponseSchema.parse((await admin(sc, '/me/usage').expect(200)).body).storage.usedBytes;

  test('the operator quarantines: 90 days, audited once, no purge job; guests lose it', async () => {
    const sc = await scene();
    const before = Date.now();
    await opPost(sc, `/content/${sc.item}/quarantine`).expect(204);
    await opPost(sc, `/content/${sc.item}/quarantine`, 'Ще раз').expect(204);
    const row = await prisma.contentItem.findUniqueOrThrow({ where: { id: sc.item } });
    expect(row).toMatchObject({
      deletedAt: null,
      quarantineReason: 'Незаконний вміст',
      quarantinedByUserId: sc.operator.userId,
    });
    const days = (row.purgeAfter!.getTime() - before) / DAY_MS;
    expect(days).toBeGreaterThan(89.99);
    expect(days).toBeLessThan(90.01);
    expect(
      await prisma.auditEvent.findMany({ where: { action: 'content.quarantine' } }),
    ).toMatchObject([
      { actorType: 'OPERATOR', metadata: { reason: 'Незаконний вміст', replacedHide: false } },
    ]);
    expect(await queuedJobs(prisma, 'content.purge')).toHaveLength(0);

    // Guests: gone everywhere, the contributor's own delete included.
    await guestGet(sc, sc.b).expect(404);
    const list = await request(server())
      .get(`/api/v1/guest/collections/${sc.collectionId}/content?scope=all`)
      .set('Cookie', sc.b)
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain(sc.item);
    const own = await request(server())
      .get(`/api/v1/guest/collections/${sc.collectionId}/content?scope=own`)
      .set('Cookie', sc.a)
      .expect(200);
    expect(JSON.stringify(own.body)).not.toContain(sc.item);
    // A replay of the text's creation must not hand it back.
    await request(server())
      .post(`/api/v1/guest/collections/${sc.collectionId}/texts`)
      .set('Origin', ORIGIN)
      .set('Cookie', sc.a)
      .set('Idempotency-Key', sc.textKey)
      .send({ body: 'Привіт' })
      .expect(404);
    await request(server())
      .delete(`/api/v1/guest/collections/${sc.collectionId}/content/${sc.item}`)
      .set('Origin', ORIGIN)
      .set('Cookie', sc.a)
      .expect(404);
    // Reports on it stay open (the decision is separate, [P3]).
    expect(
      (await prisma.contentReport.findUniqueOrThrow({ where: { id: sc.reportId } })).status,
    ).toBe('OPEN');
  });

  test('a quarantine replaces the operator hide and keeps an admin hide', async () => {
    const sc = await scene();
    await opPost(sc, `/content/${sc.item}/hide`, 'Спершу приховано').expect(204);
    await opPost(sc, `/content/${sc.item}/quarantine`).expect(204);
    expect(await prisma.contentItem.findUniqueOrThrow({ where: { id: sc.item } })).toMatchObject({
      hiddenBy: null,
      hiddenReason: null,
    });
    expect(
      (await prisma.auditEvent.findFirstOrThrow({ where: { action: 'content.quarantine' } }))
        .metadata,
    ).toMatchObject({ replacedHide: true });

    const other = await scene();
    await adminPost(other, `/content/${other.item}/hide`).expect(200);
    await opPost(other, `/content/${other.item}/quarantine`).expect(204);
    expect(
      (await prisma.contentItem.findUniqueOrThrow({ where: { id: other.item } })).hiddenBy,
    ).toBe('ADMIN');
  });

  test('its admin sees it greyed with the reason, cannot hide, show or download it, may delete it', async () => {
    const sc = await scene();
    await opPost(sc, `/content/${sc.item}/quarantine`).expect(204);

    const page = adminContentPageSchema.parse(
      (await admin(sc, `/collections/${sc.collectionId}/content`).expect(200)).body,
    );
    expect(page.items[0]!.moderation.quarantined).toMatchObject({ reason: 'Незаконний вміст' });
    const counts = contentCountsSchema.parse(
      (await admin(sc, `/collections/${sc.collectionId}/content/counts`).expect(200)).body,
    );
    expect(counts).toMatchObject({ total: 1, quarantined: 1, active: 0, hiddenByOperator: 0 });
    const only = async (state: string) =>
      adminContentPageSchema.parse(
        (await admin(sc, `/collections/${sc.collectionId}/content?state=${state}`).expect(200))
          .body,
      ).items;
    expect(await only('QUARANTINED')).toHaveLength(1);
    expect(await only('HIDDEN_OPERATOR')).toHaveLength(0);
    expect(await only('ACTIVE')).toHaveLength(0);

    const detail = adminContentDetailSchema.parse(
      (await admin(sc, `/content/${sc.item}`).expect(200)).body,
    );
    expect(detail).toMatchObject({ originalUrl: null, downloadUrl: null });

    for (const action of ['hide', 'unhide']) {
      const res = await adminPost(sc, `/content/${sc.item}/${action}`).expect(409);
      expect(res.body).toMatchObject({ code: 'CONTENT_MODERATED' });
    }
    // Their own data: the admin may delete it for good (the usual prompt purge).
    await request(server())
      .delete(`/api/v1/content/${sc.item}`)
      .set('Origin', ORIGIN)
      .set('Cookie', sc.owner.cookie)
      .expect(204);
    expect(await queuedJobs(prisma, 'content.purge')).toHaveLength(1);
  });

  test('quarantined bytes leave the quota and the collection size; a restore brings them back', async () => {
    const sc = await scene();
    expect(await usedBytes(sc)).toBe(FRAME_BYTES);
    await opPost(sc, `/content/${sc.item}/quarantine`).expect(204);
    expect(await usedBytes(sc)).toBe(0);
    expect((await admin(sc, `/collections/${sc.collectionId}`).expect(200)).body).toMatchObject({
      storageBytes: 0,
      contentCount: 1,
    });

    await opPost(sc, `/content/${sc.item}/restore`, 'Помилка оператора').expect(204);
    await opPost(sc, `/content/${sc.item}/restore`, 'Ще раз').expect(204);
    expect(await usedBytes(sc)).toBe(FRAME_BYTES);
    await guestGet(sc, sc.b).expect(200);
    expect(await prisma.contentItem.findUniqueOrThrow({ where: { id: sc.item } })).toMatchObject({
      quarantinedAt: null,
      purgeAfter: null,
    });
    expect(
      await prisma.auditEvent.findMany({ where: { action: 'content.restore' } }),
    ).toMatchObject([{ actorType: 'OPERATOR', metadata: { reason: 'Помилка оператора' } }]);
  });

  test('the operator sees the quarantine: queue state, purge date, no original link', async () => {
    const sc = await scene();
    await opPost(sc, `/content/${sc.item}/quarantine`).expect(204);
    const op = (path: string) =>
      request(server()).get(`/api/v1/operator${path}`).set('Cookie', sc.operator.cookie);
    const queue = operatorReportPageSchema.parse((await op('/reports').expect(200)).body);
    expect(queue.items[0]!.content).toMatchObject({ state: 'QUARANTINED' });
    const detail = operatorReportDetailSchema.parse(
      (await op(`/reports/${sc.reportId}`).expect(200)).body,
    );
    expect(detail.content).toMatchObject({ deleted: false, originalUrl: null });
    expect(detail.content!.quarantined).toMatchObject({ reason: 'Незаконний вміст' });
  });

  test('outside the reported scope, and for anyone but the operator, it is 404', async () => {
    const sc = await scene();
    const lone = await prisma.contentItem.create({
      data: {
        collectionId: sc.collectionId,
        frameNo: 99,
        kind: 'TEXT',
        textBody: 'Без скарг',
        processingStatus: 'NOT_REQUIRED',
      },
    });
    for (const action of ['quarantine', 'restore']) {
      await opPost(sc, `/content/${lone.id}/${action}`).expect(404);
      await request(server())
        .post(`/api/v1/operator/content/${sc.item}/${action}`)
        .set('Origin', ORIGIN)
        .set('Cookie', sc.owner.cookie)
        .send({ reason: 'x' })
        .expect(404);
    }
    expect(await prisma.contentItem.count({ where: { quarantinedAt: { not: null } } })).toBe(0);
  });

  test('the sweep purges a quarantine past its date, through the usual purge', async () => {
    const sc = await scene();
    await opPost(sc, `/content/${sc.item}/quarantine`).expect(204);
    const later = await scene();
    await opPost(later, `/content/${later.item}/quarantine`).expect(204);
    // The first one's 90 days are over (the clock moved on); the second one's are not.
    await prisma.contentItem.update({
      where: { id: sc.item },
      data: { purgeAfter: new Date(Date.now() - 3600_000) },
    });
    const sweep = new MaintenanceSweepHandler(
      app.get(PrismaService),
      app.get(ContentDeletion, { strict: false }),
      app.get<JobQueue>(JOB_QUEUE, { strict: false }),
      {
        WORKER_PURGE_BATCH_SIZE: 500,
        GUEST_SESSION_IDLE_DAYS: 400,
        REPORT_EMAIL_RETENTION_DAYS: 90,
        AUTH_TOKEN_RETENTION_DAYS: 30,
      },
    );
    await sweep.handle();
    expect(
      (await prisma.contentItem.findUniqueOrThrow({ where: { id: sc.item } })).deletedAt,
    ).not.toBeNull();
    expect(
      (await prisma.contentItem.findUniqueOrThrow({ where: { id: later.item } })).deletedAt,
    ).toBeNull();
    expect(await prisma.auditEvent.findMany({ where: { action: 'content.delete' } })).toMatchObject(
      [{ actorType: 'SYSTEM', metadata: { reason: 'quarantine_expired' } }],
    );
    expect((await queuedJobs(prisma, 'content.purge')).map((job) => job.data)).toMatchObject([
      { contentItemId: sc.item },
    ]);
    // Again: nothing more.
    await sweep.handle();
    expect(await prisma.auditEvent.count({ where: { action: 'content.delete' } })).toBe(1);
  });
});
