import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { contentCountsSchema, type GuestLinkPermissions } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
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

const prisma = createTestPrisma();
const NO_DELETE: GuestLinkPermissions = { ...SHARED_GALLERY, canDeleteOwn: false };

/** Review Focus 1 for guest deletion [C15]: only own items, only when the link allows it. */
describe('guest own-content deletion', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv());
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

  const remove = (collectionId: string, cookie: string, id: string) =>
    request(server())
      .delete(`/api/v1/guest/collections/${collectionId}/content/${id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
  const text = async (collectionId: string, cookie: string, body: string) => {
    const res = await request(server())
      .post(`/api/v1/guest/collections/${collectionId}/texts`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ body })
      .expect(201);
    return (res.body as { id: string }).id;
  };
  const deletedAt = async (id: string) =>
    (await prisma.contentItem.findUniqueOrThrow({ where: { id } })).deletedAt;

  /** Guests A and B in one collection (owned by Olena); A wrote one text. */
  async function scene(permissions: GuestLinkPermissions = SHARED_GALLERY) {
    const owner = await signInAs(app, prisma, 'olena@example.com');
    const seeded = await seedCollection(prisma, tokens, { ownerId: owner.userId, permissions });
    const a = await joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    const b = await joinAsGuest(server(), seeded.collectionId, seeded.link.token);
    const itemId = await text(seeded.collectionId, a, 'Вітаємо!');
    return { ...seeded, owner, a, b, itemId };
  }

  test('own item → 204, gone for the admin and from counts at once, one audit and one purge', async () => {
    const { collectionId, a, itemId, owner } = await scene();
    await remove(collectionId, a, itemId).expect(204);

    expect(await deletedAt(itemId)).not.toBeNull();
    const counts = contentCountsSchema.parse(
      (
        await request(server())
          .get(`/api/v1/collections/${collectionId}/content/counts`)
          .set('Cookie', owner.cookie)
          .expect(200)
      ).body,
    );
    expect(counts).toMatchObject({ total: 0, text: 0 });
    const session = await prisma.guestSession.findFirstOrThrow({
      where: { contentItems: { some: { id: itemId } } },
    });
    const events = await prisma.auditEvent.findMany({ where: { action: 'content.delete' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorType: 'GUEST',
      actorId: session.id,
      targetType: 'content',
      targetId: itemId,
      collectionId,
      metadata: { kind: 'TEXT', frameNo: 1, bulk: false },
    });
    // Never the text body in the audit.
    expect(JSON.stringify(events)).not.toContain('Вітаємо');
    const jobs = await queuedJobs(prisma, 'content.purge');
    expect(jobs.map((job) => job.data)).toEqual([
      expect.objectContaining({ contentItemId: itemId }),
    ]);

    // A retry is a no-op: 204, still one audit event and one job.
    await remove(collectionId, a, itemId).expect(204);
    expect(await prisma.auditEvent.count({ where: { action: 'content.delete' } })).toBe(1);
    expect(await queuedJobs(prisma, 'content.purge')).toHaveLength(1);
  });

  test("guest B deletes A's item (visible in the shared gallery) → 404, A's item untouched", async () => {
    const { collectionId, b, itemId } = await scene();
    const res = await remove(collectionId, b, itemId).expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(await deletedAt(itemId)).toBeNull();
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  test("another guest's item through a link without canDeleteOwn → 404, not 403 (no disclosure)", async () => {
    const { collectionId, b, itemId } = await scene(NO_DELETE);
    const res = await remove(collectionId, b, itemId).expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(await deletedAt(itemId)).toBeNull();
  });

  test('own item through a link without canDeleteOwn → 403, untouched', async () => {
    const { collectionId, a, itemId } = await scene(NO_DELETE);
    const res = await remove(collectionId, a, itemId).expect(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(await deletedAt(itemId)).toBeNull();
  });

  test('a session re-bound to a link without canDeleteOwn (F5) → 403 on an item made earlier', async () => {
    const { collectionId, a, itemId } = await scene(CONTRIBUTE_ONLY);
    const narrow = await addLink(prisma, tokens, collectionId, {
      ...CONTRIBUTE_ONLY,
      canDeleteOwn: false,
    });
    await request(server())
      .post(`/api/v1/guest/collections/${collectionId}/session`)
      .set('Origin', ORIGIN)
      .set('Cookie', a)
      .send({ linkToken: narrow.token })
      .expect(200);
    await remove(collectionId, a, itemId).expect(403);
    expect(await deletedAt(itemId)).toBeNull();
  });

  describe('across collections', () => {
    test("a guest of Y with Y's cookie on X's path → 401", async () => {
      const x = await scene();
      const y = await seedCollection(prisma, tokens, { permissions: SHARED_GALLERY });
      const yGuest = await joinAsGuest(server(), y.collectionId, y.link.token);
      const res = await remove(x.collectionId, yGuest, x.itemId).expect(401);
      expect(res.body).toMatchObject({ code: 'GUEST_SESSION_REQUIRED' });
      expect(await deletedAt(x.itemId)).toBeNull();
    });

    test("X's item id on Y's path → 404, even for the guest who made it in X", async () => {
      const x = await scene();
      const y = await seedCollection(prisma, tokens, { permissions: SHARED_GALLERY });
      const yGuest = await joinAsGuest(server(), y.collectionId, y.link.token);
      await remove(y.collectionId, yGuest, x.itemId).expect(404);
      expect(await deletedAt(x.itemId)).toBeNull();
    });
  });

  test.each([
    ['paused', { status: 'INACTIVE' as const }, 403, 'LINK_INACTIVE'],
    [
      'revoked',
      {
        status: 'REVOKED' as const,
        revokedAt: new Date(),
        tokenCiphertext: null,
        tokenKeyId: null,
      },
      410,
      'LINK_REVOKED',
    ],
  ])('a %s link → %i %s, the own item untouched', async (_state, data, status, code) => {
    const { collectionId, a, itemId, link } = await scene();
    await prisma.guestLink.update({ where: { id: link.id }, data });
    const res = await remove(collectionId, a, itemId).expect(status);
    expect(res.body).toMatchObject({ code });
    expect(await deletedAt(itemId)).toBeNull();
  });

  test('no Origin (CSRF check) → 403, untouched', async () => {
    const { collectionId, a, itemId } = await scene();
    await request(server())
      .delete(`/api/v1/guest/collections/${collectionId}/content/${itemId}`)
      .set('Cookie', a)
      .expect(403);
    expect(await deletedAt(itemId)).toBeNull();
  });
});
