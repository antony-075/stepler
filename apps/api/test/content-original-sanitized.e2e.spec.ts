import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { adminContentDetailSchema, guestContentDetailSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import type { ContentKind, ProcessingStatus } from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { joinAsGuest, seedCollection, SHARED_GALLERY } from './support/guests.js';
import { signInAs } from './support/sessions.js';

const prisma = createTestPrisma();

/**
 * ADR 0008 addendum 2026-10-05: a photo's or video's original carries where it was taken until
 * the worker strips it (`sanitizedAt`), so no link to it is issued before then, to the guest who
 * added it or to the admin. One that could not be sanitised (`FAILED`) stays the admin's only.
 */
describe('original links wait for location stripping', () => {
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

  async function scene() {
    const owner = await signInAs(app, prisma, 'olena@example.com');
    const { collectionId, link } = await seedCollection(prisma, tokens, {
      ownerId: owner.userId,
      permissions: SHARED_GALLERY,
    });
    const guest = await joinAsGuest(server(), collectionId, link.token);
    const [session] = await prisma.guestSession.findMany();
    let frameNo = 0;
    const add = async (
      kind: ContentKind,
      processingStatus: ProcessingStatus,
      sanitizedAt: Date | null,
      sanitizeFailedAt: Date | null = null,
    ) => {
      const item = await prisma.contentItem.create({
        data: {
          collectionId,
          frameNo: ++frameNo,
          kind,
          contributorGuestSessionId: session!.id,
          processingStatus,
          sanitizedAt,
          sanitizeFailedAt,
          mediaObjects: {
            create: {
              role: 'ORIGINAL',
              storageKey: `collections/${collectionId}/test/${randomUUID()}`,
              mimeType: kind === 'DOCUMENT' ? 'application/pdf' : 'image/jpeg',
              sizeBytes: 1000n,
            },
          },
        },
      });
      return item.id;
    };
    const asGuest = async (id: string) =>
      guestContentDetailSchema.parse(
        (
          await request(server())
            .get(`/api/v1/guest/collections/${collectionId}/content/${id}`)
            .set('Cookie', guest)
            .expect(200)
        ).body,
      );
    const asAdmin = async (id: string) =>
      adminContentDetailSchema.parse(
        (
          await request(server())
            .get(`/api/v1/content/${id}`)
            .set('Cookie', owner.cookie)
            .expect(200)
        ).body,
      );
    return { add, asGuest, asAdmin };
  }

  const links = (detail: { originalUrl: string | null; downloadUrl: string | null }) => ({
    original: detail.originalUrl !== null,
    download: detail.downloadUrl !== null,
  });
  const none = { original: false, download: false };
  const both = { original: true, download: true };

  test.each([['PHOTO'], ['VIDEO']] as const)(
    'a %s still being processed: no original for its guest or the admin',
    async (kind) => {
      const { add, asGuest, asAdmin } = await scene();
      const id = await add(kind, 'PENDING', null);
      expect(links(await asGuest(id))).toEqual(none);
      expect(links(await asAdmin(id))).toEqual(none);
    },
  );

  test('a legacy READY photo not backfilled yet: no original for anyone', async () => {
    const { add, asGuest, asAdmin } = await scene();
    const id = await add('PHOTO', 'READY', null);
    expect(links(await asGuest(id))).toEqual(none);
    expect(links(await asAdmin(id))).toEqual(none);
  });

  test('once sanitised: both get it', async () => {
    const { add, asGuest, asAdmin } = await scene();
    const id = await add('PHOTO', 'READY', new Date());
    expect(links(await asGuest(id))).toEqual(both);
    expect(links(await asAdmin(id))).toEqual(both);
  });

  test('sanitised, but the previews failed: both get it', async () => {
    const { add, asGuest, asAdmin } = await scene();
    const id = await add('VIDEO', 'FAILED', new Date());
    expect(links(await asGuest(id))).toEqual(both);
    expect(links(await asAdmin(id))).toEqual(both);
  });

  test('could not be sanitised (FAILED): the admin only', async () => {
    const { add, asGuest, asAdmin } = await scene();
    const id = await add('PHOTO', 'FAILED', null);
    expect(links(await asGuest(id))).toEqual(none);
    expect(links(await asAdmin(id))).toEqual(both);
  });

  test('given up on (sanitizeFailedAt), previews kept: the admin only', async () => {
    const { add, asGuest, asAdmin } = await scene();
    const id = await add('PHOTO', 'READY', null, new Date());
    expect(links(await asGuest(id))).toEqual(none);
    expect(links(await asAdmin(id))).toEqual(both);
  });

  test('documents are not sanitised and are always served (download only)', async () => {
    const { add, asGuest, asAdmin } = await scene();
    const id = await add('DOCUMENT', 'NOT_REQUIRED', null);
    expect(links(await asGuest(id))).toEqual({ original: false, download: true });
    expect(links(await asAdmin(id))).toEqual({ original: false, download: true });
  });
});
