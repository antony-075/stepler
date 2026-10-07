import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  adminAppealListSchema,
  adminAppealSchema,
  adminContentDetailSchema,
  operatorAppealDetailSchema,
  operatorAppealPageSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection, SHARED_GALLERY } from './support/guests.js';
import { signInAs } from './support/sessions.js';

// Slice 9b plan, Task 4: the collection admin appeals the operator's measures (a hidden or
// quarantined frame, a blocked collection); the operator upholds (the measure is reversed in the
// same transaction) or rejects with a note the admin reads.

const OPERATOR = 'op@stepler.test';
const prisma = createTestPrisma();

describe('appeals', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  let operator: { cookie: string; userId: string } | undefined;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ OPERATOR_EMAILS: OPERATOR }));
    await listenOnLoopback(app);
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    operator = undefined;
  });

  /**
   * An owner's collection with four texts by guest A, two of them reported by B: `hidden` (the
   * operator hid it), `quarantined` (the operator deleted it), `visible`, `adminHidden`.
   */
  async function scene() {
    const owner = await signInAs(app, prisma, `owner-${randomUUID()}@example.com`);
    const seeded = await seedCollection(prisma, tokens, {
      ownerId: owner.userId,
      permissions: SHARED_GALLERY,
    });
    const join = () => joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    const [a, b] = [await join(), await join()];
    const text = async (body: string) =>
      (
        (
          await request(server())
            .post(`/api/v1/guest/collections/${seeded.collectionId}/texts`)
            .set('Origin', ORIGIN)
            .set('Cookie', a)
            .set('Idempotency-Key', randomUUID())
            .send({ body })
            .expect(201)
        ).body as { id: string }
      ).id;
    const report = async (item: string) =>
      (
        (
          await request(server())
            .post(`/api/v1/guest/collections/${seeded.collectionId}/content/${item}/reports`)
            .set('Origin', ORIGIN)
            .set('Cookie', b)
            .set('Idempotency-Key', randomUUID())
            .send({ reason: 'ILLEGAL', locale: 'uk' })
            .expect(201)
        ).body as { id: string }
      ).id;
    const hidden = await text('Перший');
    const quarantined = await text('Другий');
    const visible = await text('Третій');
    const adminHidden = await text('Четвертий');
    const hiddenReport = await report(hidden);
    await report(quarantined);
    operator ??= await signInAs(app, prisma, OPERATOR);
    const op = operator;
    const opPost = (path: string, body: object = { reason: 'Порушення' }) =>
      request(server())
        .post(`/api/v1/operator${path}`)
        .set('Origin', ORIGIN)
        .set('Cookie', op.cookie)
        .send(body);
    await opPost(`/content/${hidden}/hide`).expect(204);
    await opPost(`/content/${quarantined}/quarantine`).expect(204);
    await request(server())
      .post(`/api/v1/content/${adminHidden}/hide`)
      .set('Origin', ORIGIN)
      .set('Cookie', owner.cookie)
      .expect(200);
    return {
      ...seeded,
      owner,
      operator: op,
      a,
      b,
      hidden,
      quarantined,
      visible,
      adminHidden,
      hiddenReport,
      opPost,
    };
  }

  type Scene = Awaited<ReturnType<typeof scene>>;

  const appealContent = (cookie: string, collectionId: string, item: string, text = 'Помилка') =>
    request(server())
      .post(`/api/v1/collections/${collectionId}/content/${item}/appeals`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ text });
  const appealCollection = (cookie: string, collectionId: string, text = 'Помилка') =>
    request(server())
      .post(`/api/v1/collections/${collectionId}/appeals`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ text });
  const listAppeals = (cookie: string, collectionId: string) =>
    request(server()).get(`/api/v1/collections/${collectionId}/appeals`).set('Cookie', cookie);
  const adminDetail = async (sc: Scene, item: string) =>
    adminContentDetailSchema.parse(
      (
        await request(server())
          .get(`/api/v1/content/${item}`)
          .set('Cookie', sc.owner.cookie)
          .expect(200)
      ).body,
    );
  const decide = (sc: Scene, id: string, body: object) =>
    request(server())
      .patch(`/api/v1/operator/appeals/${id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', sc.operator.cookie)
      .send(body);
  const opGet = (sc: Scene, path: string) =>
    request(server()).get(`/api/v1/operator${path}`).set('Cookie', sc.operator.cookie);
  const guestGet = (sc: Scene, item: string) =>
    request(server())
      .get(`/api/v1/guest/collections/${sc.collectionId}/content/${item}`)
      .set('Cookie', sc.b);

  test('the owner appeals an operator-hidden frame: audited without the text, mailed, visible in-app', async () => {
    const sc = await scene();
    const created = adminAppealSchema.parse(
      (
        await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden, 'Це моя робота').expect(
          201,
        )
      ).body,
    );
    expect(created).toMatchObject({
      status: 'OPEN',
      targetType: 'CONTENT',
      targetId: sc.hidden,
      text: 'Це моя робота',
      resolution: null,
    });
    const [event] = await prisma.auditEvent.findMany({ where: { action: 'appeal.create' } });
    expect(event).toMatchObject({
      actorType: 'ADMIN',
      targetType: 'appeal',
      targetId: created.id,
      metadata: { targetType: 'CONTENT', targetId: sc.hidden },
    });
    expect(JSON.stringify(event?.metadata)).not.toContain('Це моя робота');
    const jobs = await queuedJobs(prisma, 'mail.appeal-received');
    expect(jobs.map((job) => job.data)).toMatchObject([{ appealId: created.id }]);
    expect((await adminDetail(sc, sc.hidden)).appeal).toMatchObject({
      id: created.id,
      status: 'OPEN',
    });
    const list = adminAppealListSchema.parse(
      (await listAppeals(sc.owner.cookie, sc.collectionId).expect(200)).body,
    );
    expect(list.items.map((item) => item.id)).toEqual([created.id]);
  });

  test('what can be appealed, once at a time, and again after a decision', async () => {
    const sc = await scene();
    await appealContent(sc.owner.cookie, sc.collectionId, sc.quarantined).expect(201);
    for (const item of [sc.visible, sc.adminHidden]) {
      const refused = await appealContent(sc.owner.cookie, sc.collectionId, item).expect(409);
      expect(refused.body).toMatchObject({ code: 'APPEAL_NOT_APPLICABLE' });
    }
    // A deleted frame is gone for its admin.
    await request(server())
      .delete(`/api/v1/content/${sc.visible}`)
      .set('Origin', ORIGIN)
      .set('Cookie', sc.owner.cookie)
      .expect(204);
    await appealContent(sc.owner.cookie, sc.collectionId, sc.visible).expect(404);

    const first = adminAppealSchema.parse(
      (await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden).expect(201)).body,
    );
    const again = await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden).expect(409);
    expect(again.body).toMatchObject({ code: 'APPEAL_OPEN' });
    await decide(sc, first.id, { status: 'REJECTED', note: 'Порушення підтверджено' }).expect(200);
    await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden).expect(201);
    const list = adminAppealListSchema.parse(
      (await listAppeals(sc.owner.cookie, sc.collectionId).expect(200)).body,
    );
    expect(list.items.filter((item) => item.targetId === sc.hidden)).toHaveLength(2);

    // The collection: only while blocked.
    const notBlocked = await appealCollection(sc.owner.cookie, sc.collectionId).expect(409);
    expect(notBlocked.body).toMatchObject({ code: 'APPEAL_NOT_APPLICABLE' });
    await sc.opPost(`/collections/${sc.collectionId}/block`).expect(204);
    const blocked = adminAppealSchema.parse(
      (await appealCollection(sc.owner.cookie, sc.collectionId).expect(201)).body,
    );
    expect(blocked).toMatchObject({ targetType: 'COLLECTION', targetId: sc.collectionId });
  });

  test('only the owner: another admin, the operator, anonymous and cross-site requests fail', async () => {
    const sc = await scene();
    await sc.opPost(`/collections/${sc.collectionId}/block`).expect(204);
    const other = await signInAs(app, prisma, `other-${randomUUID()}@example.com`);
    for (const cookie of [other.cookie, sc.operator.cookie]) {
      await appealContent(cookie, sc.collectionId, sc.hidden).expect(404);
      await appealCollection(cookie, sc.collectionId).expect(404);
      await listAppeals(cookie, sc.collectionId).expect(404);
    }
    // Another of the owner's ids under this collection: still 404.
    const theirs = await seedCollection(prisma, tokens, {
      ownerId: other.userId,
      permissions: SHARED_GALLERY,
    });
    await appealContent(other.cookie, theirs.collectionId, sc.hidden).expect(404);
    await request(server())
      .post(`/api/v1/collections/${sc.collectionId}/appeals`)
      .set('Origin', ORIGIN)
      .send({ text: 'x' })
      .expect(401);
    await request(server())
      .post(`/api/v1/collections/${sc.collectionId}/appeals`)
      .set('Origin', 'https://evil.example')
      .set('Cookie', sc.owner.cookie)
      .send({ text: 'x' })
      .expect(403);
    for (const text of ['', ' ', 'x'.repeat(1001), 'a\u0007']) {
      await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden, text).expect(400);
    }
    expect(await prisma.moderationAppeal.count()).toBe(0);
  });

  test('appeals per account per day are limited', async () => {
    const sc = await scene();
    // Twenty earlier appeals of this account today (the default limit), on other targets.
    await prisma.moderationAppeal.createMany({
      data: Array.from({ length: 20 }, () => ({
        collectionId: sc.collectionId,
        targetType: 'CONTENT' as const,
        targetId: randomUUID(),
        submittedByUserId: sc.owner.userId,
        text: 'Раніше',
      })),
    });
    const limited = await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden).expect(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    // A day later they no longer count.
    await prisma.moderationAppeal.updateMany({
      data: { createdAt: new Date(Date.now() - 25 * 3600_000) },
    });
    await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden).expect(201);
  });

  test('the operator queue: newest first, with the measure, cursor-paginated; detail with context', async () => {
    const sc = await scene();
    const first = adminAppealSchema.parse(
      (await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden, 'Перша').expect(201)).body,
    );
    const second = adminAppealSchema.parse(
      (await appealContent(sc.owner.cookie, sc.collectionId, sc.quarantined).expect(201)).body,
    );
    const page = operatorAppealPageSchema.parse((await opGet(sc, '/appeals').expect(200)).body);
    expect(page.items.map((row) => [row.id, row.measure])).toEqual([
      [second.id, 'QUARANTINED'],
      [first.id, 'HIDDEN'],
    ]);
    expect(page.items[0]).toMatchObject({
      content: { id: sc.quarantined, state: 'QUARANTINED' },
      collection: { id: sc.collectionId },
    });
    const one = operatorAppealPageSchema.parse(
      (await opGet(sc, '/appeals?limit=1').expect(200)).body,
    );
    expect(one.items.map((row) => row.id)).toEqual([second.id]);
    const rest = operatorAppealPageSchema.parse(
      (await opGet(sc, `/appeals?limit=1&cursor=${one.nextCursor}`).expect(200)).body,
    );
    expect(rest.items.map((row) => row.id)).toEqual([first.id]);
    expect(rest.nextCursor).toBeNull();
    expect(
      operatorAppealPageSchema.parse((await opGet(sc, '/appeals?status=UPHELD').expect(200)).body)
        .items,
    ).toEqual([]);

    const detail = operatorAppealDetailSchema.parse(
      (await opGet(sc, `/appeals/${first.id}`).expect(200)).body,
    );
    expect(detail).toMatchObject({
      appeal: { id: first.id, text: 'Перша', status: 'OPEN' },
      previousAppeals: [],
      measure: 'HIDDEN',
      content: { id: sc.hidden, hidden: { by: 'OPERATOR' } },
      collection: { id: sc.collectionId },
      relatedReports: [{ id: sc.hiddenReport, status: 'OPEN' }],
    });
    // Not the operator, or no such appeal.
    await request(server())
      .get(`/api/v1/operator/appeals/${first.id}`)
      .set('Cookie', sc.owner.cookie)
      .expect(404);
    await request(server())
      .get('/api/v1/operator/appeals')
      .set('Cookie', sc.owner.cookie)
      .expect(404);
    await opGet(sc, `/appeals/${randomUUID()}`).expect(404);
    await decide(sc, randomUUID(), { status: 'UPHELD' }).expect(404);
  });

  test('upheld: the quarantine, the hide and the block are reversed, audited, idempotent', async () => {
    const sc = await scene();
    const quarantined = adminAppealSchema.parse(
      (await appealContent(sc.owner.cookie, sc.collectionId, sc.quarantined).expect(201)).body,
    );
    const hidden = adminAppealSchema.parse(
      (await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden).expect(201)).body,
    );
    await guestGet(sc, sc.quarantined).expect(404);

    const upheld = operatorAppealDetailSchema.parse(
      (await decide(sc, quarantined.id, { status: 'UPHELD' }).expect(200)).body,
    );
    expect(upheld).toMatchObject({ appeal: { status: 'UPHELD' }, measure: 'NONE' });
    await guestGet(sc, sc.quarantined).expect(200);
    expect(
      (
        await prisma.auditEvent.findMany({
          where: { action: { in: ['appeal.uphold', 'content.restore'] } },
        })
      )
        .map((event) => event.action)
        .sort(),
    ).toEqual(['appeal.uphold', 'content.restore']);
    // A repeat changes nothing; the other decision is a conflict.
    await decide(sc, quarantined.id, { status: 'UPHELD' }).expect(200);
    expect(await prisma.auditEvent.count({ where: { action: 'appeal.uphold' } })).toBe(1);
    const conflict = await decide(sc, quarantined.id, { status: 'REJECTED', note: 'Ні' }).expect(
      409,
    );
    expect(conflict.body).toMatchObject({ code: 'APPEAL_RESOLVED' });

    await decide(sc, hidden.id, { status: 'UPHELD', note: 'Помилка модератора' }).expect(200);
    await guestGet(sc, sc.hidden).expect(200);
    expect((await adminDetail(sc, sc.hidden)).appeal).toMatchObject({
      status: 'UPHELD',
      resolution: { status: 'UPHELD', note: 'Помилка модератора' },
    });

    await sc.opPost(`/collections/${sc.collectionId}/block`).expect(204);
    const context = () =>
      request(server())
        .get(`/api/v1/guest/collections/${sc.collectionId}/context`)
        .set('Cookie', sc.b);
    await context().expect(410);
    const collection = adminAppealSchema.parse(
      (await appealCollection(sc.owner.cookie, sc.collectionId).expect(201)).body,
    );
    await decide(sc, collection.id, { status: 'UPHELD' }).expect(200);
    await context().expect(200);
    expect(await prisma.auditEvent.count({ where: { action: 'collection.unblock' } })).toBe(1);
  });

  test('rejected: a note is required, the admin reads it, the measure and the reports stay', async () => {
    const sc = await scene();
    const appeal = adminAppealSchema.parse(
      (await appealContent(sc.owner.cookie, sc.collectionId, sc.hidden).expect(201)).body,
    );
    await decide(sc, appeal.id, { status: 'REJECTED' }).expect(400);
    await decide(sc, appeal.id, { status: 'REJECTED', note: 'Порушення підтверджено' }).expect(200);
    expect((await adminDetail(sc, sc.hidden)).appeal).toMatchObject({
      status: 'REJECTED',
      resolution: { status: 'REJECTED', note: 'Порушення підтверджено' },
    });
    await guestGet(sc, sc.hidden).expect(404);
    expect(
      (await prisma.contentReport.findUniqueOrThrow({ where: { id: sc.hiddenReport } })).status,
    ).toBe('OPEN');
    expect(await prisma.auditEvent.count({ where: { action: 'appeal.reject' } })).toBe(1);
  });
});
