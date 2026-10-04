import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { bulkDeleteContentResponseSchema, contentCountsSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { createTestPrisma, queuedJobs, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';

const prisma = createTestPrisma();

/** Inserts `count` texts numbered from 1 and returns their ids, oldest first. */
async function seedTexts(collectionId: string, count: number): Promise<string[]> {
  const rows = await prisma.contentItem.createManyAndReturn({
    data: Array.from({ length: count }, (_, i) => ({
      collectionId,
      frameNo: i + 1,
      kind: 'TEXT' as const,
      textBody: `Побажання ${i + 1}`,
      processingStatus: 'NOT_REQUIRED' as const,
    })),
    select: { id: true },
  });
  await prisma.collection.update({ where: { id: collectionId }, data: { nextFrameNo: count + 1 } });
  return rows.map((row) => row.id);
}

/** Admin bulk delete [C7]; Review Focus 1 (another owner's ids) and 3 (retries). */
describe('admin bulk delete', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv());
    await app.init();
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const bulk = (cookie: string, collectionId: string, ids: string[]) =>
    request(server())
      .post(`/api/v1/collections/${collectionId}/content/bulk-delete`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ ids });
  const sorted = (ids: string[]) => [...ids].sort();

  async function owners() {
    const olena = await signInAs(app, prisma, 'olena@example.com');
    const mine = await seedCollection(prisma, tokens, { ownerId: olena.userId });
    const bohdan = await signInAs(app, prisma, 'bohdan@example.com');
    const theirs = await seedCollection(prisma, tokens, { ownerId: bohdan.userId });
    return { olena, bohdan, mine: mine.collectionId, theirs: theirs.collectionId };
  }

  test("3 own ids + 1 of another owner's collection: 3 deleted, 1 notFound and untouched", async () => {
    const { olena, mine, theirs } = await owners();
    const own = await seedTexts(mine, 4);
    const [foreign] = await seedTexts(theirs, 1);
    const ids = [own[0]!, own[1]!, own[2]!, foreign!];

    const res = bulkDeleteContentResponseSchema.parse(
      (await bulk(olena.cookie, mine, ids).expect(200)).body,
    );
    expect(res).toEqual({
      deleted: sorted(own.slice(0, 3)),
      alreadyDeleted: [],
      notFound: [foreign],
    });
    expect(
      (await prisma.contentItem.findUniqueOrThrow({ where: { id: foreign! } })).deletedAt,
    ).toBeNull();
    expect(
      (await prisma.contentItem.findUniqueOrThrow({ where: { id: own[3]! } })).deletedAt,
    ).toBeNull();

    const events = await prisma.auditEvent.findMany({ where: { action: 'content.delete' } });
    expect(sorted(events.map((event) => event.targetId))).toEqual(sorted(own.slice(0, 3)));
    for (const event of events) {
      expect(event).toMatchObject({ actorType: 'ADMIN', actorId: olena.userId });
      expect(event.metadata).toMatchObject({ kind: 'TEXT', bulk: true });
    }
    const jobs = await queuedJobs(prisma, 'content.purge');
    expect(
      sorted(jobs.map((job) => (job.data as { contentItemId: string }).contentItemId)),
    ).toEqual(sorted(own.slice(0, 3)));

    const counts = contentCountsSchema.parse(
      (
        await request(server())
          .get(`/api/v1/collections/${mine}/content/counts`)
          .set('Cookie', olena.cookie)
          .expect(200)
      ).body,
    );
    expect(counts.total).toBe(1);
  });

  test('a retry of the same request: the frames are alreadyDeleted, still 3 audits and 3 jobs', async () => {
    const { olena, mine } = await owners();
    const ids = await seedTexts(mine, 3);
    await bulk(olena.cookie, mine, ids).expect(200);
    const retry = bulkDeleteContentResponseSchema.parse(
      (await bulk(olena.cookie, mine, ids).expect(200)).body,
    );
    expect(retry).toEqual({ deleted: [], alreadyDeleted: sorted(ids), notFound: [] });
    expect(await prisma.auditEvent.count({ where: { action: 'content.delete' } })).toBe(3);
    expect(await queuedJobs(prisma, 'content.purge')).toHaveLength(3);
  });

  test('two concurrent requests for the same frames audit each frame once', async () => {
    const { olena, mine } = await owners();
    const ids = await seedTexts(mine, 5);
    const [a, b] = await Promise.all([
      bulk(olena.cookie, mine, ids).expect(200),
      bulk(olena.cookie, mine, ids).expect(200),
    ]);
    const answers = [a, b].map((res) => bulkDeleteContentResponseSchema.parse(res.body));
    expect(sorted(answers.flatMap((answer) => answer.deleted))).toEqual(sorted(ids));
    expect(await prisma.auditEvent.count({ where: { action: 'content.delete' } })).toBe(5);
  });

  test('a nonexistent id is notFound; ids in upper case resolve to the stored frames', async () => {
    const { olena, mine } = await owners();
    const [id] = await seedTexts(mine, 1);
    const ghost = randomUUID();
    const res = bulkDeleteContentResponseSchema.parse(
      (await bulk(olena.cookie, mine, [id!.toUpperCase(), ghost]).expect(200)).body,
    );
    expect(res).toEqual({ deleted: [id], alreadyDeleted: [], notFound: [ghost] });
  });

  test('admin B on A’s collection → 404, nothing deleted', async () => {
    const { bohdan, mine } = await owners();
    const ids = await seedTexts(mine, 2);
    const res = await bulk(bohdan.cookie, mine, ids).expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(await prisma.contentItem.count({ where: { deletedAt: { not: null } } })).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  test('a collection being deleted → 404', async () => {
    const { olena, mine } = await owners();
    const ids = await seedTexts(mine, 1);
    await prisma.collection.update({
      where: { id: mine },
      data: { status: 'DELETING', deletionRequestedAt: new Date() },
    });
    await bulk(olena.cookie, mine, ids).expect(404);
  });

  test.each([
    ['101 ids', () => Array.from({ length: 101 }, () => randomUUID())],
    ['no ids', () => []],
    ['a duplicate', () => [randomUUID()].flatMap((id) => [id, id])],
    ['not a UUID', () => ['86']],
  ])('%s → 400 VALIDATION_FAILED', async (_case, ids) => {
    const { olena, mine } = await owners();
    const res = await bulk(olena.cookie, mine, ids()).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  test('signed out → 401; no Origin → 403', async () => {
    const { olena, mine } = await owners();
    const ids = await seedTexts(mine, 1);
    await request(server())
      .post(`/api/v1/collections/${mine}/content/bulk-delete`)
      .set('Origin', ORIGIN)
      .send({ ids })
      .expect(401);
    await request(server())
      .post(`/api/v1/collections/${mine}/content/bulk-delete`)
      .set('Cookie', olena.cookie)
      .send({ ids })
      .expect(403);
    expect(await prisma.contentItem.count({ where: { deletedAt: { not: null } } })).toBe(0);
  });
});
