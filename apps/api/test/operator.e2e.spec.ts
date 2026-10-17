import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { operatorReportDetailSchema, operatorReportPageSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection, SHARED_GALLERY } from './support/guests.js';
import { givePassword, signInAs } from './support/sessions.js';

// Slice 9 plan, Task 7 (Review Focus 3 and 4): the operator console's API — who gets in, the
// reported scope, the queue and detail, the decision, content actions and blocking.

const OPERATOR = 'op@stepler.test';
const REPORTER_EMAIL = 'r@stepler.test';
const prisma = createTestPrisma();

describe('operator API', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(
      testEnv({
        OPERATOR_EMAILS: OPERATOR,
        LIMIT_AUTH_EMAILS_PER_IP_PER_HOUR: '10000',
        LIMIT_LOGIN_ATTEMPTS_PER_IP_PER_HOUR: '10000',
      }),
    );
    await listenOnLoopback(app);
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const text = async (collectionId: string, cookie: string, body: string) =>
    (
      (
        await request(server())
          .post(`/api/v1/guest/collections/${collectionId}/texts`)
          .set('Origin', ORIGIN)
          .set('Cookie', cookie)
          .set('Idempotency-Key', randomUUID())
          .send({ body })
          .expect(201)
      ).body as { id: string }
    ).id;

  const fileReport = async (
    collectionId: string,
    cookie: string,
    contentId: string,
    body: Record<string, unknown> = { reason: 'PRIVACY', locale: 'uk' },
  ) =>
    (
      (
        await request(server())
          .post(`/api/v1/guest/collections/${collectionId}/content/${contentId}/reports`)
          .set('Origin', ORIGIN)
          .set('Cookie', cookie)
          .set('Idempotency-Key', randomUUID())
          .send(body)
          .expect(201)
      ).body as { id: string }
    ).id;

  /**
   * An owner's collection with guest A's frames, one of them reported by guests B (with an
   * address) and C; and another owner's collection that nobody reported.
   */
  async function scene(ownerEmail = `owner-${randomUUID()}@example.com`) {
    const owner = await signInAs(app, prisma, ownerEmail);
    const seeded = await seedCollection(prisma, tokens, {
      ownerId: owner.userId,
      permissions: SHARED_GALLERY,
    });
    const join = () => joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    const [a, b, c] = [await join(), await join(), await join()];
    const reported = await text(seeded.collectionId, a, 'Перше');
    const unreported = await text(seeded.collectionId, a, 'Друге');
    const reportB = await fileReport(seeded.collectionId, b, reported, {
      reason: 'PRIVACY',
      description: 'Це я на фото',
      email: REPORTER_EMAIL,
      locale: 'en',
    });
    const reportC = await fileReport(seeded.collectionId, c, reported, {
      reason: 'SPAM',
      locale: 'uk',
    });
    const other = await seedCollection(prisma, tokens);
    const operator = await signInAs(app, prisma, OPERATOR);
    return { ...seeded, owner, operator, a, b, reported, unreported, reportB, reportC, other };
  }

  type Scene = Awaited<ReturnType<typeof scene>>;

  const as = (cookie: string | null) => ({
    get: (path: string) => {
      const req = request(server()).get(`/api/v1/operator${path}`);
      return cookie === null ? req : req.set('Cookie', cookie);
    },
    send: (method: 'post' | 'patch', path: string, body: unknown, origin = ORIGIN) => {
      const req = request(server())[method](`/api/v1/operator${path}`).set('Origin', origin);
      return (cookie === null ? req : req.set('Cookie', cookie)).send(body as object);
    },
  });

  /** Every operator route, aimed at ids the scene reported. */
  const routes = (sc: Scene) => [
    { method: 'get' as const, path: '/session' },
    { method: 'get' as const, path: '/reports' },
    { method: 'get' as const, path: `/reports/${sc.reportB}` },
    {
      method: 'patch' as const,
      path: `/reports/${sc.reportB}`,
      body: { status: 'DISMISSED', note: 'Ні' },
    },
    ...['hide', 'unhide', 'quarantine', 'restore'].map((action) => ({
      method: 'post' as const,
      path: `/content/${sc.reported}/${action}`,
      body: { reason: 'Причина' },
    })),
    ...['block', 'unblock'].map((action) => ({
      method: 'post' as const,
      path: `/collections/${sc.collectionId}/${action}`,
      body: { reason: 'Причина' },
    })),
    ...['block', 'unblock'].map((action) => ({
      method: 'post' as const,
      path: `/users/${sc.ownerId}/${action}`,
      body: { reason: 'Причина' },
    })),
  ];

  const call = (cookie: string | null, route: ReturnType<typeof routes>[number]) =>
    route.method === 'get'
      ? as(cookie).get(route.path)
      : as(cookie).send(route.method, route.path, route.body);

  test('only the verified, accepted operator gets in; nothing is written for anyone else', async () => {
    const sc = await scene();
    // An account whose address is configured but not verified is not the operator.
    const unverified = await signInAs(app, prisma, 'op2@stepler.test', false);
    const app2 = await createApp(testEnv({ OPERATOR_EMAILS: `${OPERATOR},op2@stepler.test` }));
    await listenOnLoopback(app2);
    try {
      const server2 = app2.getHttpServer() as Server;
      for (const route of routes(sc)) {
        const req =
          route.method === 'get'
            ? request(server2).get(`/api/v1/operator${route.path}`)
            : request(server2)
                [route.method](`/api/v1/operator${route.path}`)
                .set('Origin', ORIGIN)
                .send(route.body);
        const res = await req.set('Cookie', unverified.cookie);
        expect(res.status, `${route.method} ${route.path}`).toBe(404);
      }
    } finally {
      await app2.close();
    }

    const noLegal = await signInAs(app, prisma, `nolegal-${randomUUID()}@example.com`, true, false);
    for (const route of routes(sc)) {
      const label = `${route.method} ${route.path}`;
      expect((await call(sc.owner.cookie, route)).status, label).toBe(404);
      expect((await call(null, route)).status, label).toBe(401);
      expect((await call(noLegal.cookie, route)).status, label).toBe(403);
      if (route.method !== 'get') {
        const res = await as(sc.operator.cookie).send(
          route.method,
          route.path,
          route.body,
          'https://evil.example',
        );
        expect(res.status, label).toBe(403);
        expect(res.body, label).toMatchObject({ code: 'CSRF_ORIGIN_MISMATCH' });
      }
    }
    // The operator without legal acceptance is stopped by the gate too.
    await prisma.legalAcceptance.deleteMany({ where: { userId: sc.operator.userId } });
    const gated = await as(sc.operator.cookie).get('/session').expect(403);
    expect(gated.body).toMatchObject({ code: 'LEGAL_ACCEPTANCE_REQUIRED' });

    expect(await prisma.auditEvent.count({ where: { actorType: 'OPERATOR' } })).toBe(0);
    expect(await prisma.contentReport.count({ where: { status: { not: 'OPEN' } } })).toBe(0);
    expect(await prisma.collection.count({ where: { blockedAt: { not: null } } })).toBe(0);
  });

  test('outside the reported scope everything is 404 and nothing changes ([P5])', async () => {
    const sc = await scene();
    const op = as(sc.operator.cookie);
    const reason = { reason: 'Причина' };
    const attempts = [
      ...['hide', 'unhide', 'quarantine', 'restore'].map((a) =>
        op.send('post', `/content/${sc.unreported}/${a}`, reason),
      ),
      ...['block', 'unblock'].map((a) =>
        op.send('post', `/collections/${sc.other.collectionId}/${a}`, reason),
      ),
      ...['block', 'unblock'].map((a) =>
        op.send('post', `/users/${sc.other.ownerId}/${a}`, reason),
      ),
      op.get(`/reports/${randomUUID()}`),
      op.send('patch', `/reports/${randomUUID()}`, { status: 'ACTIONED', note: 'Так' }),
      op.send('post', `/content/${randomUUID()}/hide`, reason),
    ];
    for (const attempt of attempts) {
      const res = await attempt;
      expect(res.status).toBe(404);
    }
    expect(await prisma.auditEvent.count({ where: { actorType: 'OPERATOR' } })).toBe(0);
    expect(
      await prisma.contentItem.count({
        where: {
          OR: [
            { hiddenAt: { not: null } },
            { deletedAt: { not: null } },
            { quarantinedAt: { not: null } },
          ],
        },
      }),
    ).toBe(0);
    expect(await prisma.user.count({ where: { status: 'BLOCKED' } })).toBe(0);
  });

  test('the queue: newest first, cursor pages, one status at a time', async () => {
    const sc = await scene();
    const third = await fileReport(sc.collectionId, sc.b, sc.unreported);
    const op = as(sc.operator.cookie);
    const first = operatorReportPageSchema.parse(
      (await op.get('/reports?limit=2').expect(200)).body,
    );
    expect(first.items.map((r) => r.id)).toEqual([third, sc.reportC]);
    expect(first.items[1]).toMatchObject({
      reason: 'SPAM',
      status: 'OPEN',
      content: { id: sc.reported, kind: 'TEXT', frameNo: 1, state: 'VISIBLE' },
      collection: { id: sc.collectionId, title: 'Весілля' },
      openReportsOnItem: 2,
    });
    const second = operatorReportPageSchema.parse(
      (await op.get(`/reports?limit=2&cursor=${first.nextCursor ?? ''}`).expect(200)).body,
    );
    expect(second.items.map((r) => r.id)).toEqual([sc.reportB]);
    expect(second.nextCursor).toBeNull();
    await op.get('/reports?cursor=nonsense').expect(400);

    await op
      .send('patch', `/reports/${third}`, { status: 'DISMISSED', note: 'Не порушення' })
      .expect(200);
    const dismissed = operatorReportPageSchema.parse(
      (await op.get('/reports?status=DISMISSED').expect(200)).body,
    );
    expect(dismissed.items.map((r) => r.id)).toEqual([third]);
  });

  test('the detail: minimal context, whether a contact was left, never the address', async () => {
    const sc = await scene();
    const res = await as(sc.operator.cookie).get(`/reports/${sc.reportB}`).expect(200);
    expect(res.text).not.toContain(REPORTER_EMAIL);
    const detail = operatorReportDetailSchema.parse(res.body);
    expect(detail.report).toMatchObject({
      id: sc.reportB,
      reason: 'PRIVACY',
      description: 'Це я на фото',
      hasReporterContact: true,
      resolution: null,
    });
    expect(detail.otherReports.map((r) => r.id)).toEqual([sc.reportC]);
    expect(detail.content).toMatchObject({
      id: sc.reported,
      text: 'Перше',
      deleted: false,
      hidden: null,
    });
    expect(detail.collection).toMatchObject({
      id: sc.collectionId,
      status: 'ACTIVE',
      blocked: null,
    });
    expect(detail.owner).toMatchObject({ id: sc.ownerId, status: 'ACTIVE' });
    expect(detail.owner?.email).toMatch(/^owner-/);
  });

  test('resolve decides every open report on the frame, once ([P2])', async () => {
    const sc = await scene();
    const op = as(sc.operator.cookie);
    const res = await op
      .send('patch', `/reports/${sc.reportC}`, { status: 'ACTIONED', note: ' Приховано ' })
      .expect(200);
    const detail = operatorReportDetailSchema.parse(res.body);
    expect(detail.report.resolution).toMatchObject({ status: 'ACTIONED', note: 'Приховано' });
    for (const id of [sc.reportB, sc.reportC]) {
      expect(await prisma.contentReport.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: 'ACTIONED',
        resolutionNote: 'Приховано',
        resolvedByUserId: sc.operator.userId,
      });
    }
    expect(await prisma.auditEvent.count({ where: { action: 'report.resolve' } })).toBe(2);
    // Only the reporter who left an address gets the decision mail.
    expect((await queuedJobs(prisma, 'mail.report-decision')).map((j) => j.data)).toMatchObject([
      { reportId: sc.reportB },
    ]);

    await op
      .send('patch', `/reports/${sc.reportB}`, { status: 'ACTIONED', note: 'Ще раз' })
      .expect(200);
    expect(await prisma.auditEvent.count({ where: { action: 'report.resolve' } })).toBe(2);
    expect(await queuedJobs(prisma, 'mail.report-decision')).toHaveLength(1);
    const conflict = await op
      .send('patch', `/reports/${sc.reportB}`, { status: 'DISMISSED', note: 'Ні' })
      .expect(409);
    expect(conflict.body).toMatchObject({ code: 'REPORT_RESOLVED' });
    await op.send('patch', `/reports/${sc.reportB}`, { status: 'OPEN', note: 'x' }).expect(400);
  });

  test('content: hide, unhide and quarantine, each with a reason and audited', async () => {
    const sc = await scene();
    const op = as(sc.operator.cookie);
    const guestRead = () =>
      request(server())
        .get(`/api/v1/guest/collections/${sc.collectionId}/content/${sc.reported}`)
        .set('Cookie', sc.b);

    await op
      .send('post', `/content/${sc.reported}/hide`, { reason: 'Порушення приватності' })
      .expect(204);
    expect(
      await prisma.contentItem.findUniqueOrThrow({ where: { id: sc.reported } }),
    ).toMatchObject({
      hiddenBy: 'OPERATOR',
      hiddenReason: 'Порушення приватності',
      hiddenByUserId: sc.operator.userId,
    });
    await guestRead().expect(404);
    await op.send('post', `/content/${sc.reported}/hide`, { reason: 'Ще раз' }).expect(204);
    expect(await prisma.auditEvent.findMany({ where: { action: 'content.hide' } })).toMatchObject([
      { actorType: 'OPERATOR', metadata: { by: 'OPERATOR', reason: 'Порушення приватності' } },
    ]);
    // The decision is separate ([P3]).
    expect(
      (await prisma.contentReport.findUniqueOrThrow({ where: { id: sc.reportB } })).status,
    ).toBe('OPEN');

    await op.send('post', `/content/${sc.reported}/unhide`, { reason: 'Помилка' }).expect(204);
    await guestRead().expect(200);

    const empty = await op
      .send('post', `/content/${sc.reported}/quarantine`, { reason: '  ' })
      .expect(400);
    expect(empty.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    // The operator's deletion is a quarantine (slice 9b): no purge job, the row stays.
    await op
      .send('post', `/content/${sc.reported}/quarantine`, { reason: 'Незаконний вміст' })
      .expect(204);
    await op.send('post', `/content/${sc.reported}/quarantine`, { reason: 'Ще раз' }).expect(204);
    expect(
      await prisma.auditEvent.findMany({ where: { action: 'content.quarantine' } }),
    ).toMatchObject([{ actorType: 'OPERATOR', metadata: { reason: 'Незаконний вміст' } }]);
    expect(await queuedJobs(prisma, 'content.purge')).toHaveLength(0);
    await guestRead().expect(404);
    // Deleted later (by its admin): the detail says so.
    await prisma.contentItem.update({
      where: { id: sc.reported },
      data: { deletedAt: new Date() },
    });
    // The detail of a deleted frame.
    const detail = operatorReportDetailSchema.parse(
      (await op.get(`/reports/${sc.reportB}`).expect(200)).body,
    );
    expect(detail.content).toMatchObject({
      deleted: true,
      text: null,
      media: null,
      originalUrl: null,
    });
  });

  test('blocking a collection closes it to guests; its admin sees why; unblocking reopens it', async () => {
    const sc = await scene();
    const op = as(sc.operator.cookie);
    const context = () =>
      request(server())
        .get(`/api/v1/guest/collections/${sc.collectionId}/context`)
        .set('Cookie', sc.b);

    await op
      .send('post', `/collections/${sc.collectionId}/block`, { reason: 'Порушення умов' })
      .expect(204);
    await op
      .send('post', `/collections/${sc.collectionId}/block`, { reason: 'Ще раз' })
      .expect(204);
    expect((await context().expect(410)).body).toMatchObject({ code: 'COLLECTION_UNAVAILABLE' });
    const admin = await request(server())
      .get(`/api/v1/collections/${sc.collectionId}`)
      .set('Cookie', sc.owner.cookie)
      .expect(200);
    expect(admin.body).toMatchObject({ blocked: { reason: 'Порушення умов' } });

    await op
      .send('post', `/collections/${sc.collectionId}/unblock`, { reason: 'Виправлено' })
      .expect(204);
    await context().expect(200);
    expect(
      (
        await prisma.auditEvent.findMany({
          where: { action: { startsWith: 'collection.' } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      ).map((e) => [e.action, (e.metadata as { reason: string }).reason]),
    ).toEqual([
      ['collection.block', 'Порушення умов'],
      ['collection.unblock', 'Виправлено'],
    ]);
  });

  test('blocking an account revokes its sessions and sign-in; its collections close; unblocking restores sign-in', async () => {
    const ownerEmail = `owner-${randomUUID()}@stepler.test`;
    const sc = await scene(ownerEmail);
    const op = as(sc.operator.cookie);
    const PASSWORD = 'Pa55word!';
    await givePassword(app, prisma, sc.ownerId, PASSWORD);
    const login = () =>
      request(server())
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: ownerEmail, password: PASSWORD });
    await login().expect(200);

    await op
      .send('post', `/users/${sc.ownerId}/block`, { reason: 'Систематичні порушення' })
      .expect(204);
    await op.send('post', `/users/${sc.ownerId}/block`, { reason: 'Ще раз' }).expect(204);
    expect(await prisma.authSession.count({ where: { userId: sc.ownerId } })).toBe(0);
    await request(server()).get('/api/v1/collections').set('Cookie', sc.owner.cookie).expect(401);
    expect((await login().expect(403)).body).toMatchObject({ code: 'ACCOUNT_BLOCKED' });
    const resolve = await request(server())
      .post('/api/v1/guest/links/resolve')
      .set('Origin', ORIGIN)
      .send({ linkToken: sc.link.token })
      .expect(410);
    expect(resolve.body).toMatchObject({ code: 'COLLECTION_UNAVAILABLE' });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: sc.ownerId } })).toMatchObject({
      status: 'BLOCKED',
      blockedReason: 'Систематичні порушення',
    });

    await op
      .send('post', `/users/${sc.ownerId}/unblock`, { reason: 'Оскарження прийнято' })
      .expect(204);
    await login().expect(200);
    expect(
      (
        await prisma.auditEvent.findMany({
          where: { action: { startsWith: 'account.' } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      ).map((e) => [e.action, e.targetType, e.collectionId]),
    ).toEqual([
      ['account.block', 'user', null],
      ['account.unblock', 'user', null],
    ]);
  });
});
