import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { type GuestLink, guestLinkListResponseSchema, guestLinkSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { signInAs } from './support/sessions.js';

const ORIGIN = 'http://localhost:3000';
const OPERATOR = 'op@stepler.test';
const prisma = createTestPrisma();

const UPLOAD_ONLY = {
  canUploadPhotos: true,
  canUploadVideos: true,
  canUploadDocuments: true,
  canSubmitText: false,
  canViewGallery: false,
  canDeleteOwn: false,
};
const VIEW_ONLY = {
  ...UPLOAD_ONLY,
  canUploadPhotos: false,
  canUploadVideos: false,
  canUploadDocuments: false,
  canViewGallery: true,
};

/** Rounds per rotate race test, and their timeout (see the race tests). */
const RACE_ROUNDS = 5;
const RACE_TIMEOUT_MS = 30_000;

/** Every token issued during this file, so Review Focus 3 can look for any of them. */
const issuedTokens = new Set<string>();

function tokenOf(link: GuestLink): string {
  const token = link.url?.split('/g/')[1];
  if (token === undefined) throw new Error('link has no URL');
  return token;
}

function parseLink(body: unknown): GuestLink {
  const link = guestLinkSchema.parse(body);
  if (link.url !== null) issuedTokens.add(tokenOf(link));
  return link;
}

describe('guest link management', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(
      testEnv({ OPERATOR_EMAILS: OPERATOR, LIMIT_GUEST_LINKS_PER_COLLECTION: '2' }),
    );
    await listenOnLoopback(app);
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    // Review Focus 3: no audit metadata, from any flow in this file, holds a token.
    const metadata = JSON.stringify(
      (await prisma.auditEvent.findMany({ select: { metadata: true } })).map((e) => e.metadata),
    );
    for (const token of issuedTokens) expect(metadata).not.toContain(token);
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Audit rows are kept across tests on purpose (see afterAll); the rest is reset.
    await prisma.$executeRawUnsafe(
      'TRUNCATE "GuestLink", "Collection", "AuthSession", "AuthAccount", "User" CASCADE',
    );
  });

  const post = (cookie: string, path: string, body: object = {}) =>
    request(server()).post(`/api/v1${path}`).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const patch = (cookie: string, id: string, body: object) =>
    request(server())
      .patch(`/api/v1/guest-links/${id}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);
  const del = (cookie: string, id: string) =>
    request(server())
      .delete(`/api/v1/guest-links/${id}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
  const list = async (cookie: string, collectionId: string) =>
    guestLinkListResponseSchema
      .parse(
        (
          await request(server())
            .get(`/api/v1/collections/${collectionId}/guest-links`)
            .set('Cookie', cookie)
            .expect(200)
        ).body,
      )
      .items.map((link) => parseLink(link));

  /** Signs in an owner and creates a collection (with its default link) through the API. */
  async function ownerWithCollection(email = 'a@stepler.test') {
    const owner = await signInAs(app, prisma, email);
    const res = await post(owner.cookie, '/collections', { title: 'Wedding' }).expect(201);
    const collectionId = (res.body as { id: string }).id;
    const [defaultLink] = await list(owner.cookie, collectionId);
    if (defaultLink === undefined) throw new Error('no default link');
    return { ...owner, collectionId, defaultLink };
  }

  const createLink = (cookie: string, collectionId: string, label = 'Фотограф') =>
    post(cookie, `/collections/${collectionId}/guest-links`, { label, permissions: UPLOAD_ONLY });

  const auditCount = (action: string) => prisma.auditEvent.count({ where: { action } });

  describe('create', () => {
    test('an additional link → 201 with a URL, audited without its label', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      const before = await auditCount('guest_link.create');
      const res = await createLink(cookie, collectionId, '  Фотограф ').expect(201);
      expect(res.headers['cache-control']).toContain('no-store');
      const link = parseLink(res.body);
      expect(link).toMatchObject({
        isDefault: false,
        label: 'Фотограф',
        status: 'ACTIVE',
        permissions: UPLOAD_ONLY,
      });
      expect(link.url).toMatch(/^http:\/\/localhost:3000\/g\/[A-Za-z0-9_-]{43}$/);
      expect(await auditCount('guest_link.create')).toBe(before + 1);
      const event = await prisma.auditEvent.findFirstOrThrow({ where: { targetId: link.id } });
      expect(event).toMatchObject({ collectionId, targetType: 'guest_link', actorType: 'ADMIN' });
      expect(JSON.stringify(event.metadata)).not.toContain('Фотограф');
    });

    test('rejects invalid bodies', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      for (const body of [
        { permissions: UPLOAD_ONLY },
        {
          label: 'A',
          permissions: {
            ...UPLOAD_ONLY,
            canUploadPhotos: false,
            canUploadVideos: false,
            canUploadDocuments: false,
          },
        },
        { label: 'x'.repeat(61), permissions: UPLOAD_ONLY },
        { label: 'A', permissions: UPLOAD_ONLY, isDefault: true },
      ]) {
        const res = await post(cookie, `/collections/${collectionId}/guest-links`, body).expect(
          400,
        );
        expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
    });

    test('[G8] at the limit → 409; revoking one frees a slot; the default does not count', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      const first = parseLink((await createLink(cookie, collectionId, 'One').expect(201)).body);
      await createLink(cookie, collectionId, 'Two').expect(201);
      const res = await createLink(cookie, collectionId, 'Three').expect(409);
      expect(res.body).toMatchObject({ code: 'GUEST_LINK_LIMIT_REACHED' });
      await post(cookie, `/guest-links/${first.id}/revoke`).expect(200);
      await createLink(cookie, collectionId, 'Three').expect(201);
    });

    test('two concurrent creates at 1 of 2 → one 201 and one 409', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      await createLink(cookie, collectionId, 'One').expect(201);
      const results = await Promise.all([
        createLink(cookie, collectionId, 'Two'),
        createLink(cookie, collectionId, 'Three'),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(await prisma.guestLink.count({ where: { collectionId, isDefault: false } })).toBe(2);
    });
  });

  describe('update', () => {
    test('permissions: invalid → 400, view-only → 200; audited as booleans only', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      const link = parseLink((await createLink(cookie, collectionId, 'Секрет').expect(201)).body);
      const none = {
        ...UPLOAD_ONLY,
        canUploadPhotos: false,
        canUploadVideos: false,
        canUploadDocuments: false,
      };
      const invalid = await patch(cookie, link.id, { permissions: none }).expect(400);
      expect(invalid.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      await patch(cookie, link.id, {}).expect(400);

      const res = await patch(cookie, link.id, {
        label: 'Новий підпис',
        permissions: VIEW_ONLY,
      }).expect(200);
      expect(parseLink(res.body)).toMatchObject({ label: 'Новий підпис', permissions: VIEW_ONLY });
      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'guest_link.update', targetId: link.id },
      });
      expect(event.metadata).toEqual({
        fromCanUploadPhotos: true,
        fromCanUploadVideos: true,
        fromCanUploadDocuments: true,
        fromCanSubmitText: false,
        fromCanViewGallery: false,
        fromCanDeleteOwn: false,
        toCanUploadPhotos: false,
        toCanUploadVideos: false,
        toCanUploadDocuments: false,
        toCanSubmitText: false,
        toCanViewGallery: true,
        toCanDeleteOwn: false,
        labelChanged: true,
      });
      expect(JSON.stringify(event.metadata)).not.toMatch(/Секрет|Новий/);
    });

    test('canDeleteOwn without anything to add → 400 DELETE_OWN_REQUIRES_CONTRIBUTION (create and update) [C15]', async () => {
      const { cookie, collectionId, defaultLink } = await ownerWithCollection();
      const deleteOnly = { ...VIEW_ONLY, canDeleteOwn: true };
      const created = await post(cookie, `/collections/${collectionId}/guest-links`, {
        label: 'Проектор',
        permissions: deleteOnly,
      }).expect(400);
      const updated = await patch(cookie, defaultLink.id, { permissions: deleteOnly }).expect(400);
      for (const res of [created, updated]) {
        expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
        expect(JSON.stringify(res.body)).toContain('DELETE_OWN_REQUIRES_CONTRIBUTION');
      }
      expect(
        (await prisma.guestLink.findUniqueOrThrow({ where: { id: defaultLink.id } })).canDeleteOwn,
      ).toBe(defaultLink.permissions.canDeleteOwn);
    });

    test('the default link takes permissions but no label', async () => {
      const { cookie, defaultLink } = await ownerWithCollection();
      const res = await patch(cookie, defaultLink.id, { label: 'Main' }).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      const ok = await patch(cookie, defaultLink.id, {
        permissions: { ...defaultLink.permissions, canViewGallery: true },
      }).expect(200);
      expect(parseLink(ok.body)).toMatchObject({
        label: null,
        permissions: { canViewGallery: true },
      });
    });
  });

  describe('pause and resume', () => {
    test('deactivate twice → INACTIVE both times, audited once; activate → ACTIVE', async () => {
      const { cookie, defaultLink } = await ownerWithCollection();
      const path = `/guest-links/${defaultLink.id}`;
      const before = await auditCount('guest_link.deactivate');
      const first = await post(cookie, `${path}/deactivate`).expect(200);
      const second = await post(cookie, `${path}/deactivate`).expect(200);
      expect([parseLink(first.body).status, parseLink(second.body).status]).toEqual([
        'INACTIVE',
        'INACTIVE',
      ]);
      // A paused link keeps its URL.
      expect(parseLink(second.body).url).toBe(defaultLink.url);
      expect(await auditCount('guest_link.deactivate')).toBe(before + 1);
      const resumed = await post(cookie, `${path}/activate`).expect(200);
      expect(parseLink(resumed.body).status).toBe('ACTIVE');
      await post(cookie, `${path}/activate`).expect(200);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'guest_link.activate', targetId: defaultLink.id },
        }),
      ).toBe(1);
    });
  });

  describe('revoke', () => {
    test('the default link cannot be revoked', async () => {
      const { cookie, defaultLink } = await ownerWithCollection();
      const res = await post(cookie, `/guest-links/${defaultLink.id}/revoke`).expect(409);
      expect(res.body).toMatchObject({ code: 'DEFAULT_LINK_NOT_REVOCABLE' });
      expect(
        (await prisma.guestLink.findUniqueOrThrow({ where: { id: defaultLink.id } })).status,
      ).toBe('ACTIVE');
    });

    test('revoking wipes the ciphertext, is idempotent, and freezes the link', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      const link = parseLink((await createLink(cookie, collectionId).expect(201)).body);
      const res = await post(cookie, `/guest-links/${link.id}/revoke`).expect(200);
      const revoked = parseLink(res.body);
      expect(revoked).toMatchObject({ status: 'REVOKED', url: null });
      expect(revoked.revokedAt).not.toBeNull();
      expect(JSON.stringify(res.body)).not.toContain(tokenOf(link));
      const row = await prisma.guestLink.findUniqueOrThrow({ where: { id: link.id } });
      expect(row).toMatchObject({ tokenCiphertext: null, tokenKeyId: null });

      const again = await post(cookie, `/guest-links/${link.id}/revoke`).expect(200);
      expect(parseLink(again.body).revokedAt).toBe(revoked.revokedAt);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'guest_link.revoke', targetId: link.id },
        }),
      ).toBe(1);

      for (const call of [
        () => patch(cookie, link.id, { permissions: VIEW_ONLY }),
        () => post(cookie, `/guest-links/${link.id}/activate`),
        () => post(cookie, `/guest-links/${link.id}/deactivate`),
      ]) {
        const refused = await call().expect(409);
        expect(refused.body).toMatchObject({ code: 'LINK_REVOKED' });
      }
    });
  });

  describe('delete', () => {
    test('the default link cannot be deleted', async () => {
      const { cookie, defaultLink } = await ownerWithCollection();
      const res = await del(cookie, defaultLink.id).expect(409);
      expect(res.body).toMatchObject({ code: 'DEFAULT_LINK_NOT_REVOCABLE' });
      const row = await prisma.guestLink.findUniqueOrThrow({ where: { id: defaultLink.id } });
      expect(row).toMatchObject({ status: 'ACTIVE', hiddenAt: null });
    });

    test('deleting a live link revokes it and hides it; the record stays; again is a no-op', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      const link = parseLink((await createLink(cookie, collectionId).expect(201)).body);
      await post(cookie, `/guest-links/${link.id}/deactivate`).expect(200);
      const res = await del(cookie, link.id).expect(204);
      expect(res.text).toBe('');

      const row = await prisma.guestLink.findUniqueOrThrow({ where: { id: link.id } });
      expect(row).toMatchObject({ status: 'REVOKED', tokenCiphertext: null, tokenKeyId: null });
      expect(row.revokedAt).not.toBeNull();
      expect(row.hiddenAt).not.toBeNull();
      expect((await list(cookie, collectionId)).map((item) => item.id)).not.toContain(link.id);

      await del(cookie, link.id).expect(204);
      const events = await prisma.auditEvent.findMany({
        where: { action: 'guest_link.delete', targetId: link.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0]?.metadata).toEqual({ fromStatus: 'INACTIVE' });
      // A deleted link is revoked: nothing else can change it.
      const refused = await post(cookie, `/guest-links/${link.id}/activate`).expect(409);
      expect(refused.body).toMatchObject({ code: 'LINK_REVOKED' });
    });

    test('a revoked link can be removed from the list of revoked links', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      const kept = parseLink((await createLink(cookie, collectionId, 'Kept').expect(201)).body);
      const gone = parseLink((await createLink(cookie, collectionId, 'Gone').expect(201)).body);
      await post(cookie, `/guest-links/${kept.id}/revoke`).expect(200);
      const revoked = parseLink(
        (await post(cookie, `/guest-links/${gone.id}/revoke`).expect(200)).body,
      );
      await del(cookie, gone.id).expect(204);

      const ids = (await list(cookie, collectionId)).map((item) => item.id);
      expect(ids).toContain(kept.id);
      expect(ids).not.toContain(gone.id);
      const row = await prisma.guestLink.findUniqueOrThrow({ where: { id: gone.id } });
      // Still revoked when it was: deleting does not rewrite the revocation.
      expect(row.revokedAt?.toISOString()).toBe(revoked.revokedAt);
    });

    test('concurrent deletes are audited once', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      const link = parseLink((await createLink(cookie, collectionId).expect(201)).body);
      const results = await Promise.all([del(cookie, link.id), del(cookie, link.id)]);
      expect(results.map((res) => res.status)).toEqual([204, 204]);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'guest_link.delete', targetId: link.id },
        }),
      ).toBe(1);
    });
  });

  describe('rotate the default link', () => {
    const rotate = (cookie: string, collectionId: string, expectedLinkId: string) =>
      post(cookie, `/collections/${collectionId}/guest-links/default/rotate`, { expectedLinkId });

    test('Review Focus 1: two concurrent rotates give one new link', async () => {
      const { cookie, collectionId, defaultLink } = await ownerWithCollection();
      const results = await Promise.all([
        rotate(cookie, collectionId, defaultLink.id),
        rotate(cookie, collectionId, defaultLink.id),
      ]);
      expect(results.map((res) => res.status)).toEqual([200, 200]);
      const [a, b] = results.map((res) => parseLink(res.body));
      expect(a?.id).toBe(b?.id);
      expect(a?.id).not.toBe(defaultLink.id);
      expect(a?.url).not.toBe(defaultLink.url);
      expect(a).toMatchObject({ isDefault: true, status: 'ACTIVE' });

      expect(
        await prisma.guestLink.count({
          where: { collectionId, isDefault: true, status: { not: 'REVOKED' } },
        }),
      ).toBe(1);
      const old = await prisma.guestLink.findUniqueOrThrow({ where: { id: defaultLink.id } });
      expect(old).toMatchObject({ status: 'REVOKED', replacedById: a?.id, tokenCiphertext: null });
      const events = await prisma.auditEvent.findMany({
        where: { action: 'guest_link.rotate', collectionId },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        targetType: 'guest_link',
        targetId: a?.id,
        metadata: { replacedLinkId: defaultLink.id },
      });

      // The list no longer shows the rotated-out default.
      const links = await list(cookie, collectionId);
      expect(links.map((link) => link.id)).toEqual([a?.id]);
    });

    test('a stale expectedLinkId returns the current default without rotating', async () => {
      const { cookie, collectionId, defaultLink } = await ownerWithCollection();
      const rotated = parseLink(
        (await rotate(cookie, collectionId, defaultLink.id).expect(200)).body,
      );
      const stale = parseLink(
        (await rotate(cookie, collectionId, defaultLink.id).expect(200)).body,
      );
      expect(stale.id).toBe(rotated.id);
      expect(
        await prisma.auditEvent.count({ where: { action: 'guest_link.rotate', collectionId } }),
      ).toBe(1);
    });

    test('[G7] rotating a paused default keeps it paused, with the same permissions', async () => {
      const { cookie, collectionId, defaultLink } = await ownerWithCollection();
      const permissions = { ...defaultLink.permissions, canViewGallery: true };
      await patch(cookie, defaultLink.id, { permissions }).expect(200);
      await post(cookie, `/guest-links/${defaultLink.id}/deactivate`).expect(200);
      const rotated = parseLink(
        (await rotate(cookie, collectionId, defaultLink.id).expect(200)).body,
      );
      expect(rotated).toMatchObject({ status: 'INACTIVE', permissions });
      expect(rotated.id).not.toBe(defaultLink.id);
    });

    test('a token encrypted under another APP_SECRET → url null, and rotate still works', async () => {
      const { cookie, collectionId, defaultLink } = await ownerWithCollection();
      const foreign = new GuestLinkTokens({
        APP_SECRET: Buffer.alloc(32, 9),
        APP_ORIGIN: ORIGIN,
      }).generate();
      await prisma.guestLink.update({
        where: { id: defaultLink.id },
        data: { tokenHash: foreign.tokenHash, tokenCiphertext: foreign.tokenCiphertext },
      });
      const extra = parseLink((await createLink(cookie, collectionId).expect(201)).body);

      const links = await list(cookie, collectionId);
      expect(links.map((link) => [link.id, link.url])).toEqual([
        [defaultLink.id, null],
        [extra.id, extra.url],
      ]);
      const rotated = parseLink(
        (await rotate(cookie, collectionId, defaultLink.id).expect(200)).body,
      );
      expect(rotated.id).not.toBe(defaultLink.id);
      expect(rotated.url).toMatch(/^http:\/\/localhost:3000\/g\/[A-Za-z0-9_-]{43}$/);
      expect((await list(cookie, collectionId))[0]).toMatchObject({
        id: rotated.id,
        url: rotated.url,
      });
    });

    /*
     * The two race tests below run RACE_ROUNDS rounds each. Every round has its own owner and
     * collection, so a round never truncates tables under another request; and they get
     * RACE_TIMEOUT_MS, because vitest does not cancel a test that times out: under CPU load the
     * default 5 s expired mid-loop, the loop kept firing requests (and its own TRUNCATE) while
     * the next test's beforeEach TRUNCATE ran, and the two deadlocked on table locks (40P01).
     */
    test('rotate racing a pause never loses the pause', { timeout: RACE_TIMEOUT_MS }, async () => {
      for (let i = 0; i < RACE_ROUNDS; i++) {
        const { cookie, collectionId, defaultLink } = await ownerWithCollection(
          `race-${i}@stepler.test`,
        );
        const [rotated, paused] = await Promise.all([
          rotate(cookie, collectionId, defaultLink.id),
          post(cookie, `/guest-links/${defaultLink.id}/deactivate`),
        ]);
        expect(rotated.status).toBe(200);
        // Paused first → the replacement copies INACTIVE; rotated first → the pause sees 409.
        expect([200, 409]).toContain(paused.status);
        const [live] = await list(cookie, collectionId);
        expect(live).toMatchObject({
          id: parseLink(rotated.body).id,
          status: paused.status === 200 ? 'INACTIVE' : 'ACTIVE',
        });
      }
    });

    test(
      'rotate racing a permission change never loses the change',
      { timeout: RACE_TIMEOUT_MS },
      async () => {
        for (let i = 0; i < RACE_ROUNDS; i++) {
          const { cookie, collectionId, defaultLink } = await ownerWithCollection(
            `race-${i}@stepler.test`,
          );
          const permissions = { ...defaultLink.permissions, canViewGallery: true };
          const [rotated, updated] = await Promise.all([
            rotate(cookie, collectionId, defaultLink.id),
            patch(cookie, defaultLink.id, { permissions }),
          ]);
          expect(rotated.status).toBe(200);
          expect([200, 409]).toContain(updated.status);
          const [live] = await list(cookie, collectionId);
          expect(live).toMatchObject({
            id: parseLink(rotated.body).id,
            permissions: updated.status === 200 ? permissions : defaultLink.permissions,
          });
        }
      },
    );

    test('rejects a malformed expectedLinkId', async () => {
      const { cookie, collectionId } = await ownerWithCollection();
      const res = await rotate(cookie, collectionId, 'nope').expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('authorization (Review Focus 2, part 2)', () => {
    type Route = (cookie: string, ids: { collectionId: string; linkId: string }) => request.Test;
    const routes: Record<string, Route> = {
      'POST /collections/:id/guest-links': (cookie, { collectionId }) =>
        createLink(cookie, collectionId, 'Hijack'),
      'PATCH /guest-links/:id': (cookie, { linkId }) =>
        patch(cookie, linkId, { permissions: VIEW_ONLY }),
      'POST /guest-links/:id/deactivate': (cookie, { linkId }) =>
        post(cookie, `/guest-links/${linkId}/deactivate`),
      'POST /guest-links/:id/activate': (cookie, { linkId }) =>
        post(cookie, `/guest-links/${linkId}/activate`),
      'POST /guest-links/:id/revoke': (cookie, { linkId }) =>
        post(cookie, `/guest-links/${linkId}/revoke`),
      'DELETE /guest-links/:id': (cookie, { linkId }) => del(cookie, linkId),
      'POST /collections/:id/guest-links/default/rotate': (cookie, { collectionId, linkId }) =>
        post(cookie, `/collections/${collectionId}/guest-links/default/rotate`, {
          expectedLinkId: linkId,
        }),
    };
    const actors = ['another admin', 'a non-owner operator'] as const;
    const cases = actors.flatMap((actor) =>
      Object.keys(routes).flatMap((route) =>
        (['default', 'additional'] as const).map((target) => ({ actor, route, target })),
      ),
    );

    test.each(cases)(
      '$route by $actor on the $target link → 404',
      async ({ actor, route, target }) => {
        const owner = await ownerWithCollection();
        const additional = parseLink(
          (await createLink(owner.cookie, owner.collectionId, 'Mine').expect(201)).body,
        );
        const link = target === 'default' ? owner.defaultLink : additional;
        const caller = await signInAs(
          app,
          prisma,
          actor === 'a non-owner operator' ? OPERATOR : 'b@stepler.test',
        );
        const rowsBefore = await prisma.guestLink.findMany({ orderBy: { id: 'asc' } });
        const auditBefore = await prisma.auditEvent.count();

        const res = await routes[route]?.(caller.cookie, {
          collectionId: owner.collectionId,
          linkId: link.id,
        });
        expect(res?.status).toBe(404);
        expect(res?.body).toMatchObject({ code: 'NOT_FOUND' });
        const text = JSON.stringify(res?.body);
        for (const own of [owner.defaultLink, additional]) expect(text).not.toContain(tokenOf(own));

        expect(await prisma.guestLink.findMany({ orderBy: { id: 'asc' } })).toEqual(rowsBefore);
        expect(await prisma.auditEvent.count()).toBe(auditBefore);
      },
    );

    test.each(Object.keys(routes))(
      '%s on a DELETING collection → 404 for its owner',
      async (route) => {
        const owner = await ownerWithCollection();
        await request(server())
          .delete(`/api/v1/collections/${owner.collectionId}`)
          .set('Cookie', owner.cookie)
          .set('Origin', ORIGIN)
          .expect(204);
        const rowsBefore = await prisma.guestLink.findMany({ orderBy: { id: 'asc' } });
        const res = await routes[route]?.(owner.cookie, {
          collectionId: owner.collectionId,
          linkId: owner.defaultLink.id,
        });
        expect(res?.status).toBe(404);
        expect(await prisma.guestLink.findMany({ orderBy: { id: 'asc' } })).toEqual(rowsBefore);
      },
    );
  });
});
