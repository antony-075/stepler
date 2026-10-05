import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { guestContentDetailSchema, guestContentPageSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { joinAsGuest, ORIGIN, seedCollection, SHARED_GALLERY } from './support/guests.js';

const prisma = createTestPrisma();
const FILENAME = 'Олена Коваль — Київ.pdf';

/**
 * Review Focus 1 / [C16]: a presigned link is readable by whoever gets it, so another guest's
 * links must not carry the contributor's file name or the frame number (both would otherwise
 * sit in `response-content-disposition`).
 */
describe('guest media links of other guests’ files', () => {
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

  /** Guest A's PDF and photo (frames #087 and #088, with derivatives); A's and B's cookies. */
  async function scene() {
    const { collectionId, link } = await seedCollection(prisma, tokens, {
      permissions: SHARED_GALLERY,
    });
    const a = await joinAsGuest(server(), collectionId, link.token);
    const b = await joinAsGuest(server(), collectionId, link.token);
    // A's session: the one created first.
    const [sessionA] = await prisma.guestSession.findMany({ orderBy: { createdAt: 'asc' } });
    const make = async (frameNo: number, kind: 'DOCUMENT' | 'PHOTO', name: string) => {
      const item = await prisma.contentItem.create({
        data: {
          collectionId,
          frameNo,
          kind,
          originalFilename: name,
          contributorGuestSessionId: sessionA!.id,
          processingStatus: kind === 'PHOTO' ? 'READY' : 'NOT_REQUIRED',
          // A processed photo: its location has been stripped, so its original is served.
          ...(kind === 'PHOTO' ? { sanitizedAt: new Date() } : {}),
        },
      });
      const roles =
        kind === 'PHOTO'
          ? (['ORIGINAL', 'THUMBNAIL', 'PREVIEW'] as const)
          : (['ORIGINAL'] as const);
      for (const role of roles) {
        await prisma.mediaObject.create({
          data: {
            contentItemId: item.id,
            role,
            storageKey: `collections/${collectionId}/test/${randomUUID()}`,
            mimeType: role === 'ORIGINAL' && kind === 'DOCUMENT' ? 'application/pdf' : 'image/jpeg',
            sizeBytes: 1000n,
          },
        });
      }
      return item.id;
    };
    const pdf = await make(87, 'DOCUMENT', FILENAME);
    const photo = await make(88, 'PHOTO', 'Олена на терасі.jpg');
    await prisma.collection.update({ where: { id: collectionId }, data: { nextFrameNo: 89 } });
    return { collectionId, a, b, pdf, photo };
  }

  /** Fully decoded (the name is RFC 5987-encoded, then encoded again in the query). */
  const decoded = (text: string) => decodeURIComponent(decodeURIComponent(text));
  const leaks = (text: string) =>
    ['Олена', 'stepler-087', 'stepler-088'].filter(
      (needle) => text.includes(needle) || decoded(text).includes(needle),
    );

  test("guest B's GET of A's file: a neutral download name, no file name or frame number", async () => {
    const { collectionId, b, pdf, photo } = await scene();
    for (const id of [pdf, photo]) {
      const res = await request(server())
        .get(`/api/v1/guest/collections/${collectionId}/content/${id}`)
        .set('Cookie', b)
        .expect(200);
      const detail = guestContentDetailSchema.parse(res.body);
      expect(detail.downloadUrl).not.toBeNull();
      expect(leaks(JSON.stringify(res.body))).toEqual([]);
      // The saved file is `stepler.<ext>`.
      expect(decoded(detail.downloadUrl ?? '')).toMatch(/filename="stepler\.(pdf|jpg)"/);
    }
  });

  test("guest B's list of everyone's frames carries none of A's names or numbers", async () => {
    const { collectionId, b } = await scene();
    const res = await request(server())
      .get(`/api/v1/guest/collections/${collectionId}/content?scope=all`)
      .set('Cookie', b)
      .expect(200);
    const page = guestContentPageSchema.parse(res.body);
    expect(page.items).toHaveLength(2);
    expect(page.items.some((item) => item.thumbnailUrl !== null)).toBe(true);
    expect(leaks(JSON.stringify(res.body))).toEqual([]);
  });

  test('guest A still downloads their own file under its own name', async () => {
    const { collectionId, a, pdf } = await scene();
    const res = await request(server())
      .get(`/api/v1/guest/collections/${collectionId}/content/${pdf}`)
      .set('Cookie', a)
      .set('Origin', ORIGIN)
      .expect(200);
    const detail = guestContentDetailSchema.parse(res.body);
    expect(decoded(detail.downloadUrl ?? '')).toContain(FILENAME);
  });
});
