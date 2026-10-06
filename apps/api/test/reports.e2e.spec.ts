import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import {
  adminContentDetailSchema,
  adminContentPageSchema,
  guestContentItemSchema,
  type GuestLinkPermissions,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { ApiEnv } from '../src/config/env.js';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import {
  addLink,
  CONTRIBUTE_ONLY,
  joinAsGuest,
  ORIGIN,
  seedCollection,
  SHARED_GALLERY,
} from './support/guests.js';
import { signInAs } from './support/sessions.js';

// Slice 9 plan, Task 5: guest reports (R1, [P4]), the admin's report view and dismissal (R2,
// [Q1]), and the reporter's e-mail never leaving the report row (Review Focus 4 and 5).

const OPERATOR = 'op@stepler.test';
const REPORTER_EMAIL = 'r@stepler.test';
const prisma = createTestPrisma();

async function startApp(env: ApiEnv) {
  const app = await createApp(env);
  await listenOnLoopback(app);
  return { app, server: app.getHttpServer() as Server, tokens: app.get(GuestLinkTokens) };
}

type Started = Awaited<ReturnType<typeof startApp>>;

const PRIVACY = {
  reason: 'PRIVACY',
  description: 'Це я на фото',
  email: REPORTER_EMAIL,
  locale: 'en',
} as const;

describe('guest reports', () => {
  let s: Started;

  beforeAll(async () => {
    s = await startApp(testEnv({ OPERATOR_EMAILS: OPERATOR }));
  });

  afterAll(async () => {
    await s.app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const text = async (started: Started, collectionId: string, cookie: string, body: string) =>
    guestContentItemSchema.parse(
      (
        await request(started.server)
          .post(`/api/v1/guest/collections/${collectionId}/texts`)
          .set('Origin', ORIGIN)
          .set('Cookie', cookie)
          .set('Idempotency-Key', randomUUID())
          .send({ body })
          .expect(201)
      ).body,
    ).id;

  /** An owner's collection where guest A wrote two frames; guest B joined through `permissions`. */
  async function scene(started: Started = s, permissions: GuestLinkPermissions = SHARED_GALLERY) {
    const owner = await signInAs(started.app, prisma, `owner-${randomUUID()}@example.com`);
    const seeded = await seedCollection(prisma, started.tokens, {
      ownerId: owner.userId,
      permissions: SHARED_GALLERY,
    });
    const a = await joinAsGuest(started.server, seeded.collectionId, seeded.link.token);
    const link =
      permissions === SHARED_GALLERY
        ? seeded.link
        : await addLink(prisma, started.tokens, seeded.collectionId, permissions);
    const b = await joinAsGuest(started.server, seeded.collectionId, link.token);
    const first = await text(started, seeded.collectionId, a, 'Перше');
    const second = await text(started, seeded.collectionId, a, 'Друге');
    return { ...seeded, owner, a, b, first, second };
  }

  type Scene = Awaited<ReturnType<typeof scene>>;

  const report = (
    sc: Scene,
    cookie: string,
    contentId: string,
    body: Record<string, unknown> = PRIVACY,
    key: string = randomUUID(),
    started: Started = s,
  ) =>
    request(started.server)
      .post(`/api/v1/guest/collections/${sc.collectionId}/content/${contentId}/reports`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send(body);
  const admin = (sc: Scene, path: string) =>
    request(s.server).get(`/api/v1${path}`).set('Cookie', sc.owner.cookie);

  test('guest B reports guest A’s frame: one row, one audit event, one mail job, no contact anywhere', async () => {
    const sc = await scene();
    const res = await report(sc, sc.b, sc.first).expect(201);
    const { id } = res.body as { id: string };

    const row = await prisma.contentReport.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      contentId: sc.first,
      collectionId: sc.collectionId,
      reason: 'PRIVACY',
      description: 'Це я на фото',
      reporterEmail: REPORTER_EMAIL,
      reporterLocale: 'en',
      status: 'OPEN',
      adminDismissedAt: null,
    });
    const events = await prisma.auditEvent.findMany({ where: { action: 'report.create' } });
    expect(events).toMatchObject([
      { actorType: 'GUEST', targetType: 'report', targetId: id, collectionId: sc.collectionId },
    ]);
    const metadata = JSON.stringify(events[0]?.metadata);
    expect(metadata).not.toContain(REPORTER_EMAIL);
    expect(metadata).not.toContain('Це я на фото');

    const jobs = await queuedJobs(prisma, 'mail.report-received');
    expect(jobs).toHaveLength(1);
    const data = jobs[0]?.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(['reportId', 'requestId']);
    expect(data.reportId).toBe(id);
  });

  test('without an e-mail no locale is kept', async () => {
    const sc = await scene();
    const { id } = (await report(sc, sc.b, sc.first, { reason: 'SPAM', locale: 'uk' }).expect(201))
      .body as { id: string };
    expect(await prisma.contentReport.findUniqueOrThrow({ where: { id } })).toMatchObject({
      reporterEmail: null,
      reporterLocale: null,
      description: null,
    });
  });

  test('replays and duplicates return the first report and queue nothing more', async () => {
    const sc = await scene();
    const key = randomUUID();
    const { id } = (await report(sc, sc.b, sc.first, PRIVACY, key).expect(201)).body as {
      id: string;
    };
    expect((await report(sc, sc.b, sc.first, PRIVACY, key).expect(200)).body).toEqual({ id });
    const conflict = await report(sc, sc.b, sc.first, { ...PRIVACY, reason: 'SPAM' }, key).expect(
      409,
    );
    expect(conflict.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    // A new key on the same frame from the same session: still the open report [P4].
    expect(
      (await report(sc, sc.b, sc.first, { reason: 'SPAM', locale: 'uk' }).expect(200)).body,
    ).toEqual({ id });
    expect(await prisma.contentReport.count()).toBe(1);
    expect(await queuedJobs(prisma, 'mail.report-received')).toHaveLength(1);
    expect(await prisma.auditEvent.count({ where: { action: 'report.create' } })).toBe(1);
  });

  test('two identical requests at once make one report', async () => {
    const sc = await scene();
    const key = randomUUID();
    const [first, second] = await Promise.all([
      report(sc, sc.b, sc.second, PRIVACY, key),
      report(sc, sc.b, sc.second, PRIVACY, key),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body).toEqual(second.body);
    expect(await prisma.contentReport.count()).toBe(1);
    expect(await queuedJobs(prisma, 'mail.report-received')).toHaveLength(1);
  });

  test('only another guest’s frame the guest can see', async () => {
    const sc = await scene();
    // Their own frame.
    expect((await report(sc, sc.a, sc.first).expect(403)).body).toMatchObject({
      code: 'FORBIDDEN',
    });
    // Hidden and deleted frames are gone.
    await prisma.contentItem.update({
      where: { id: sc.first },
      data: { hiddenAt: new Date(), hiddenBy: 'ADMIN', hiddenByUserId: sc.owner.userId },
    });
    await report(sc, sc.b, sc.first).expect(404);
    await prisma.contentItem.update({ where: { id: sc.second }, data: { deletedAt: new Date() } });
    await report(sc, sc.b, sc.second).expect(404);
    // Another collection's frame under this collection's path.
    const other = await scene();
    await report(sc, sc.b, other.first).expect(404);
    await report(sc, sc.b, randomUUID()).expect(404);
    // No session.
    await request(s.server)
      .post(`/api/v1/guest/collections/${sc.collectionId}/content/${other.first}/reports`)
      .set('Origin', ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send(PRIVACY)
      .expect(401);
    // A missing key, an invalid body.
    await request(s.server)
      .post(`/api/v1/guest/collections/${other.collectionId}/content/${other.first}/reports`)
      .set('Origin', ORIGIN)
      .set('Cookie', other.b)
      .send(PRIVACY)
      .expect(400);
    await report(other, other.b, other.first, { ...PRIVACY, email: 'x' }).expect(400);
    // A blocked collection.
    await prisma.collection.update({
      where: { id: other.collectionId },
      data: { blockedAt: new Date(), blockedReason: 'Спам' },
    });
    expect((await report(other, other.b, other.first).expect(410)).body).toMatchObject({
      code: 'COLLECTION_UNAVAILABLE',
    });
    expect(await prisma.contentReport.count()).toBe(0);
  });

  test('a contribution-only guest cannot report what they cannot see', async () => {
    const sc = await scene(s, CONTRIBUTE_ONLY);
    await report(sc, sc.b, sc.first).expect(404);
    expect(await prisma.contentReport.count()).toBe(0);
  });

  test('the admin sees the reasons and descriptions, never the contact, and can dismiss', async () => {
    const sc = await scene();
    const { id } = (await report(sc, sc.b, sc.first).expect(201)).body as { id: string };

    const detailRes = await admin(sc, `/content/${sc.first}`).expect(200);
    expect(detailRes.text).not.toContain(REPORTER_EMAIL);
    const detail = adminContentDetailSchema.parse(detailRes.body);
    expect(detail.reports).toEqual([
      {
        id,
        reason: 'PRIVACY',
        description: 'Це я на фото',
        createdAt: expect.any(String) as string,
      },
    ]);
    expect(detail.moderation.openReports).toBe(1);

    const listRes = await admin(sc, `/collections/${sc.collectionId}/content`).expect(200);
    expect(listRes.text).not.toContain(REPORTER_EMAIL);
    const reportedOnly = adminContentPageSchema.parse(
      (await admin(sc, `/collections/${sc.collectionId}/content?reported=true`).expect(200)).body,
    );
    expect(reportedOnly.items.map((i) => [i.id, i.moderation.openReports])).toEqual([
      [sc.first, 1],
    ]);
    expect(
      (await admin(sc, `/collections/${sc.collectionId}/content/counts`).expect(200)).body,
    ).toMatchObject({ reported: 1 });

    // Another admin or the operator (not the owner) cannot dismiss.
    const other = await signInAs(s.app, prisma, `other-${randomUUID()}@example.com`);
    const operator = await signInAs(s.app, prisma, OPERATOR);
    for (const cookie of [other.cookie, operator.cookie]) {
      await request(s.server)
        .post(`/api/v1/content/${sc.first}/reports/dismiss`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(404);
    }

    const dismiss = () =>
      request(s.server)
        .post(`/api/v1/content/${sc.first}/reports/dismiss`)
        .set('Origin', ORIGIN)
        .set('Cookie', sc.owner.cookie)
        .expect(204);
    await dismiss();
    await dismiss();
    const after = adminContentDetailSchema.parse((await admin(sc, `/content/${sc.first}`)).body);
    expect(after.reports).toEqual([]);
    expect(after.moderation.openReports).toBe(0);
    expect(
      (await admin(sc, `/collections/${sc.collectionId}/content/counts`).expect(200)).body,
    ).toMatchObject({ reported: 0 });
    // Still open for the operator [Q1]; one audit event.
    const row = await prisma.contentReport.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('OPEN');
    expect(row.adminDismissedAt).not.toBeNull();
    expect(
      await prisma.auditEvent.findMany({ where: { action: 'report.admin_dismiss' } }),
    ).toMatchObject([{ actorType: 'ADMIN', targetType: 'report', targetId: id }]);
  });

  describe('limits', () => {
    test('per guest session per hour, counted from rows', async () => {
      const limited = await startApp(
        testEnv({ OPERATOR_EMAILS: OPERATOR, LIMIT_REPORTS_PER_GUEST_SESSION_PER_HOUR: '2' }),
      );
      try {
        const sc = await scene(limited);
        const third = await text(limited, sc.collectionId, sc.a, 'Третє');
        await report(sc, sc.b, sc.first, PRIVACY, randomUUID(), limited).expect(201);
        await report(sc, sc.b, sc.second, PRIVACY, randomUUID(), limited).expect(201);
        const res = await report(sc, sc.b, third, PRIVACY, randomUUID(), limited).expect(429);
        expect(res.body).toMatchObject({ code: 'RATE_LIMITED' });
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      } finally {
        await limited.app.close();
      }
    });

    test('per client IP per hour, across sessions', async () => {
      const limited = await startApp(
        testEnv({ OPERATOR_EMAILS: OPERATOR, LIMIT_REPORTS_PER_IP_PER_HOUR: '3' }),
      );
      try {
        const sc = await scene(limited);
        for (let i = 0; i < 3; i++) {
          const cookie = await joinAsGuest(limited.server, sc.collectionId, sc.link.token);
          await report(sc, cookie, sc.first, PRIVACY, randomUUID(), limited).expect(201);
        }
        const cookie = await joinAsGuest(limited.server, sc.collectionId, sc.link.token);
        const res = await report(sc, cookie, sc.first, PRIVACY, randomUUID(), limited).expect(429);
        expect(res.body).toMatchObject({ code: 'RATE_LIMITED' });
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      } finally {
        await limited.app.close();
      }
    });
  });
});
