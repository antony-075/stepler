import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  adminContentItemSchema,
  adminContentPageSchema,
  collectionDetailSchema,
} from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { ORIGIN, seedCollection } from './support/guests.js';
import { signInAs } from './support/sessions.js';

// Slice 9 plan, Task 4: the admin hides and shows frames; the moderation state on content; the
// blocked collection on the collection DTO.

const OPERATOR = 'op@stepler.test';
const prisma = createTestPrisma();

describe('admin hide and unhide (R3)', () => {
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

  /** A signed-in owner, their collection and one text frame. */
  async function scene() {
    const owner = await signInAs(app, prisma, `owner-${randomUUID()}@example.com`);
    const { collectionId } = await seedCollection(prisma, tokens, { ownerId: owner.userId });
    const item = await prisma.contentItem.create({
      data: {
        collectionId,
        frameNo: 1,
        kind: 'TEXT',
        textBody: 'Вітаємо!',
        processingStatus: 'NOT_REQUIRED',
      },
    });
    await prisma.collection.update({ where: { id: collectionId }, data: { nextFrameNo: 2 } });
    return { owner, collectionId, itemId: item.id };
  }

  const act = (cookie: string, id: string, action: 'hide' | 'unhide', origin = ORIGIN) =>
    request(server())
      .post(`/api/v1/content/${id}/${action}`)
      .set('Cookie', cookie)
      .set('Origin', origin);
  const auditOf = (action: string) => prisma.auditEvent.findMany({ where: { action } });

  test('the owner hides and shows a frame; each change is audited once', async () => {
    const { owner, itemId, collectionId } = await scene();

    const hidden = adminContentItemSchema.parse(
      (await act(owner.cookie, itemId, 'hide').expect(200)).body,
    );
    expect(hidden.moderation).toMatchObject({
      hidden: { by: 'ADMIN', reason: null },
      openReports: 0,
    });
    expect(await auditOf('content.hide')).toMatchObject([
      {
        actorType: 'ADMIN',
        actorId: owner.userId,
        collectionId,
        targetType: 'content',
        targetId: itemId,
        metadata: { by: 'ADMIN' },
      },
    ]);
    // Again: the same answer, no second event.
    await act(owner.cookie, itemId, 'hide').expect(200);
    expect(await auditOf('content.hide')).toHaveLength(1);

    // The admin's feed still has it, with its state.
    const page = adminContentPageSchema.parse(
      (
        await request(server())
          .get(`/api/v1/collections/${collectionId}/content`)
          .set('Cookie', owner.cookie)
          .expect(200)
      ).body,
    );
    expect(page.items.map((i) => [i.id, i.moderation.hidden?.by])).toEqual([[itemId, 'ADMIN']]);

    const shown = adminContentItemSchema.parse(
      (await act(owner.cookie, itemId, 'unhide').expect(200)).body,
    );
    expect(shown.moderation.hidden).toBeNull();
    expect(await auditOf('content.unhide')).toMatchObject([
      { actorType: 'ADMIN', targetId: itemId, metadata: { by: 'ADMIN' } },
    ]);
    await act(owner.cookie, itemId, 'unhide').expect(200);
    expect(await auditOf('content.unhide')).toHaveLength(1);
  });

  test("an operator-hidden frame: the owner's hide changes nothing, the unhide is 409", async () => {
    const { owner, itemId } = await scene();
    await prisma.contentItem.update({
      where: { id: itemId },
      data: {
        hiddenAt: new Date(),
        hiddenBy: 'OPERATOR',
        hiddenByUserId: randomUUID(),
        hiddenReason: 'Порушення приватності',
      },
    });

    const hide = adminContentItemSchema.parse(
      (await act(owner.cookie, itemId, 'hide').expect(200)).body,
    );
    expect(hide.moderation.hidden).toMatchObject({
      by: 'OPERATOR',
      reason: 'Порушення приватності',
    });
    const res = await act(owner.cookie, itemId, 'unhide').expect(409);
    expect(res.body).toMatchObject({ code: 'CONTENT_MODERATED' });
    expect(await prisma.contentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({
      hiddenBy: 'OPERATOR',
      hiddenReason: 'Порушення приватності',
    });
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  test.each(['hide', 'unhide'] as const)(
    '%s: only the owner, on a live frame of a live collection',
    async (action) => {
      const { owner, itemId, collectionId } = await scene();
      const other = await signInAs(app, prisma, `other-${randomUUID()}@example.com`);
      const operator = await signInAs(app, prisma, OPERATOR);
      for (const cookie of [other.cookie, operator.cookie]) {
        expect((await act(cookie, itemId, action).expect(404)).body).toMatchObject({
          code: 'NOT_FOUND',
        });
      }
      await request(server())
        .post(`/api/v1/content/${itemId}/${action}`)
        .set('Origin', ORIGIN)
        .expect(401);
      expect(
        (await act(owner.cookie, itemId, action, 'https://evil.example').expect(403)).body,
      ).toMatchObject({
        code: 'CSRF_ORIGIN_MISMATCH',
      });
      await act(owner.cookie, randomUUID(), action).expect(404);

      await prisma.contentItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
      await act(owner.cookie, itemId, action).expect(404);
      await prisma.contentItem.update({ where: { id: itemId }, data: { deletedAt: null } });

      await prisma.collection.update({
        where: { id: collectionId },
        data: { status: 'DELETING', deletionRequestedAt: new Date() },
      });
      await act(owner.cookie, itemId, action).expect(404);
      expect(await prisma.auditEvent.count()).toBe(0);
      expect(await prisma.contentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({
        hiddenAt: null,
      });
    },
  );

  test('the collection says whether the operator blocked it', async () => {
    const { owner, collectionId } = await scene();
    const read = async () =>
      collectionDetailSchema.parse(
        (
          await request(server())
            .get(`/api/v1/collections/${collectionId}`)
            .set('Cookie', owner.cookie)
            .expect(200)
        ).body,
      );
    expect((await read()).blocked).toBeNull();
    const at = new Date('2026-10-06T10:00:00.000Z');
    await prisma.collection.update({
      where: { id: collectionId },
      data: { blockedAt: at, blockedReason: 'Порушення умов' },
    });
    expect((await read()).blocked).toEqual({ at: at.toISOString(), reason: 'Порушення умов' });
  });

  test('state counts and the state filter (F1), per collection and ANDed with the kind', async () => {
    const { owner, itemId, collectionId } = await scene();
    const frame = (frameNo: number, kind: 'TEXT' | 'PHOTO', extra: Record<string, unknown> = {}) =>
      prisma.contentItem.create({
        data: {
          collectionId,
          frameNo,
          kind,
          textBody: kind === 'TEXT' ? 'Ще' : null,
          processingStatus: kind === 'TEXT' ? 'NOT_REQUIRED' : 'PENDING',
          ...extra,
        },
      });
    const report = (contentId: string, extra: Record<string, unknown> = {}) =>
      prisma.contentReport.create({
        data: {
          contentId,
          collectionId,
          reporterGuestSessionId: randomUUID(),
          idempotencyKey: randomUUID(),
          reason: 'SPAM',
          ...extra,
        },
      });
    const hide = (by: 'ADMIN' | 'OPERATOR') => ({
      hiddenAt: new Date(),
      hiddenBy: by,
      hiddenByUserId: owner.userId,
      hiddenReason: by === 'OPERATOR' ? 'Спам' : null,
    });
    // #1 reported twice; #2 its report dismissed (active); #3 hidden by the admin and reported;
    // #4 a photo hidden by the operator; #5 deleted (counts nowhere).
    const dismissed = await frame(2, 'TEXT');
    const hiddenAdmin = await frame(3, 'TEXT', hide('ADMIN'));
    const hiddenOperator = await frame(4, 'PHOTO', hide('OPERATOR'));
    const deleted = await frame(5, 'TEXT', { deletedAt: new Date() });
    await report(itemId);
    await report(itemId);
    await report(dismissed.id, { adminDismissedAt: new Date() });
    await report(hiddenAdmin.id);
    await report(deleted.id);

    const counts = await request(server())
      .get(`/api/v1/collections/${collectionId}/content/counts`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(counts.body).toMatchObject({
      total: 4,
      active: 1,
      hiddenByAdmin: 1,
      hiddenByOperator: 1,
      reported: 2,
    });

    const ids = async (query: string) =>
      adminContentPageSchema
        .parse(
          (
            await request(server())
              .get(`/api/v1/collections/${collectionId}/content?${query}`)
              .set('Cookie', owner.cookie)
              .expect(200)
          ).body,
        )
        .items.map((i) => i.id);
    expect(await ids('state=REPORTED')).toEqual([hiddenAdmin.id, itemId]);
    expect(await ids('state=ACTIVE')).toEqual([dismissed.id]);
    expect(await ids('state=HIDDEN_ADMIN')).toEqual([hiddenAdmin.id]);
    expect(await ids('state=HIDDEN_OPERATOR')).toEqual([hiddenOperator.id]);
    expect(await ids('state=HIDDEN_OPERATOR&kind=TEXT')).toEqual([]);
    expect(await ids('state=REPORTED&kind=TEXT')).toEqual([hiddenAdmin.id, itemId]);
    // Several states are OR (deduped); six values are refused.
    expect(await ids('state=HIDDEN_ADMIN&state=HIDDEN_OPERATOR')).toEqual([
      hiddenOperator.id,
      hiddenAdmin.id,
    ]);
    expect(await ids('state=ACTIVE&state=ACTIVE&state=HIDDEN_OPERATOR')).toEqual([
      hiddenOperator.id,
      dismissed.id,
    ]);
    await request(server())
      .get(
        `/api/v1/collections/${collectionId}/content?state=ACTIVE&state=ACTIVE&state=ACTIVE&state=ACTIVE&state=ACTIVE&state=ACTIVE`,
      )
      .set('Cookie', owner.cookie)
      .expect(400);
    await request(server())
      .get(`/api/v1/collections/${collectionId}/content?state=hidden`)
      .set('Cookie', owner.cookie)
      .expect(400);
    const reported = adminContentPageSchema.parse(
      (
        await request(server())
          .get(`/api/v1/collections/${collectionId}/content?state=REPORTED`)
          .set('Cookie', owner.cookie)
          .expect(200)
      ).body,
    );
    expect(reported.items.find((i) => i.id === itemId)?.moderation.openReports).toBe(2);
  });
});
