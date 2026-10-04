import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { guestLinkListResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { hashToken } from '../src/auth/tokens.js';
import { createApp } from '../src/create-app.js';
import type { CollectionStatus } from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { signInAs } from './support/sessions.js';

const ORIGIN = 'http://localhost:3000';
const OPERATOR = 'op@stepler.test';
const prisma = createTestPrisma();

/** A collection inserted directly, without links: what a pre-slice-2 collection looks like. */
async function seedCollection(ownerId: string, status: CollectionStatus = 'ACTIVE') {
  return prisma.collection.create({
    data: {
      ownerId,
      title: 'Seeded',
      status,
      ...(status === 'ARCHIVED' ? { archivedAt: new Date() } : {}),
      ...(status === 'DELETING' ? { deletionRequestedAt: new Date() } : {}),
    },
  });
}

describe('guest link list', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
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
  });

  const list = (cookie: string, collectionId: string) =>
    request(server()).get(`/api/v1/collections/${collectionId}/guest-links`).set('Cookie', cookie);

  /** Inserts a link row directly, with a real token, for list-shape tests. */
  async function insertLink(
    collectionId: string,
    data: { isDefault: boolean; label?: string; revokedAt?: Date; createdAt?: Date },
  ) {
    const issued = tokens.generate();
    const revoked = data.revokedAt !== undefined;
    return prisma.guestLink.create({
      data: {
        collectionId,
        isDefault: data.isDefault,
        label: data.label ?? null,
        status: revoked ? 'REVOKED' : 'ACTIVE',
        revokedAt: data.revokedAt ?? null,
        tokenHash: issued.tokenHash,
        tokenCiphertext: revoked ? null : issued.tokenCiphertext,
        tokenKeyId: revoked ? null : issued.tokenKeyId,
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: false,
        canDeleteOwn: true,
        ...(data.createdAt === undefined ? {} : { createdAt: data.createdAt }),
      },
    });
  }

  test('a new collection lists its default link with a URL that resolves to its row', async () => {
    const { cookie } = await signInAs(app, prisma, 'a@stepler.test');
    const created = await request(server())
      .post('/api/v1/collections')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Wedding' })
      .expect(201);
    const collectionId = (created.body as { id: string }).id;

    const res = await list(cookie, collectionId).expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
    const body = guestLinkListResponseSchema.parse(res.body);
    expect(body.items).toHaveLength(1);
    const [link] = body.items;
    expect(link).toMatchObject({
      isDefault: true,
      label: null,
      status: 'ACTIVE',
      revokedAt: null,
      permissions: {
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: false,
        canDeleteOwn: true,
      },
    });
    expect(link?.url).toMatch(/^http:\/\/localhost:3000\/g\/[A-Za-z0-9_-]{43}$/);
    const token = link?.url?.split('/g/')[1] ?? '';
    const row = await prisma.guestLink.findUniqueOrThrow({ where: { id: link?.id ?? '' } });
    expect(hashToken(token)).toBe(row.tokenHash);
    // The list does not create a second link.
    await list(cookie, collectionId).expect(200);
    expect(await prisma.guestLink.count()).toBe(1);
  });

  test('[G4] a legacy collection gets its default link on first read, audited as SYSTEM', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const { id } = await seedCollection(userId);

    const body = guestLinkListResponseSchema.parse((await list(cookie, id).expect(200)).body);
    expect(body.items.map((link) => link.isDefault)).toEqual([true]);
    const events = await prisma.auditEvent.findMany({ where: { action: 'guest_link.create' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      collectionId: id,
      actorType: 'SYSTEM',
      actorId: null,
      targetType: 'guest_link',
      targetId: body.items[0]?.id,
      metadata: { isDefault: true },
    });
  });

  test('[G4] two concurrent first reads create exactly one default link', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const { id } = await seedCollection(userId);
    const [a, b] = await Promise.all([list(cookie, id), list(cookie, id)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const ids = [a, b].map((res) => guestLinkListResponseSchema.parse(res.body).items[0]?.id);
    expect(ids[0]).toBe(ids[1]);
    expect(await prisma.guestLink.count({ where: { collectionId: id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'guest_link.create' } })).toBe(1);
  });

  test('an archived collection lists its links too', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const { id } = await seedCollection(userId, 'ARCHIVED');
    const body = guestLinkListResponseSchema.parse((await list(cookie, id).expect(200)).body);
    expect(body.items).toHaveLength(1);
  });

  test('order: default, live additional oldest first, then the 10 most recently revoked', async () => {
    const { cookie, userId } = await signInAs(app, prisma, 'a@stepler.test');
    const { id } = await seedCollection(userId);
    const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 10, minutes));
    // A rotated-out default is never listed.
    await insertLink(id, { isDefault: true, revokedAt: at(1), createdAt: at(0) });
    const live = await insertLink(id, { isDefault: true, createdAt: at(1) });
    await insertLink(id, { isDefault: false, label: 'Second', createdAt: at(3) });
    await insertLink(id, { isDefault: false, label: 'First', createdAt: at(2) });
    for (let i = 0; i < 12; i++) {
      await insertLink(id, {
        isDefault: false,
        label: `Revoked ${i}`,
        createdAt: at(4),
        revokedAt: at(10 + i),
      });
    }

    const body = guestLinkListResponseSchema.parse((await list(cookie, id).expect(200)).body);
    expect(body.items[0]?.id).toBe(live.id);
    expect(body.items.map((link) => link.label)).toEqual([
      null,
      'First',
      'Second',
      ...[11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((i) => `Revoked ${i}`),
    ]);
    const revoked = body.items.filter((link) => link.status === 'REVOKED');
    expect(revoked.every((link) => link.url === null && link.revokedAt !== null)).toBe(true);
    // The existing live default was used, not a new one.
    expect(await prisma.guestLink.count({ where: { collectionId: id, isDefault: true } })).toBe(2);
  });

  test('a malformed collection id → 400', async () => {
    const { cookie } = await signInAs(app, prisma, 'a@stepler.test');
    const res = await list(cookie, 'not-a-uuid').expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  test('requires a session', async () => {
    const { userId } = await signInAs(app, prisma, 'a@stepler.test');
    const { id } = await seedCollection(userId);
    await request(server()).get(`/api/v1/collections/${id}/guest-links`).expect(401);
  });

  describe('authorization (Review Focus 2, part 1)', () => {
    const actors = [
      'another admin',
      'a non-owner operator',
      'the owner of a DELETING collection',
    ] as const;

    test.each(actors)('GET …/guest-links by %s → 404, no link created', async (actor) => {
      const owner = await signInAs(app, prisma, 'a@stepler.test');
      const deleting = actor === 'the owner of a DELETING collection';
      const target = await seedCollection(owner.userId, deleting ? 'DELETING' : 'ACTIVE');
      const caller = deleting
        ? owner
        : await signInAs(
            app,
            prisma,
            actor === 'a non-owner operator' ? OPERATOR : 'b@stepler.test',
          );
      const res = await list(caller.cookie, target.id).expect(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(await prisma.guestLink.count()).toBe(0);
      expect(await prisma.auditEvent.count()).toBe(0);
    });
  });
});
