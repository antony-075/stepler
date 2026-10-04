import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { resolveGuestLinkResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { generateToken } from '../src/auth/tokens.js';
import { createApp } from '../src/create-app.js';
import type {
  CollectionStatus,
  GuestLinkStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';
import { GuestLinkTokens } from '../src/guest-access/guest-link-tokens.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { signInAs } from './support/sessions.js';

const ORIGIN = 'http://localhost:3000';
const prisma = createTestPrisma();

class CaptureStream extends Writable {
  output = '';
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.output += chunk.toString();
    done();
  }
}

interface Seeded {
  token: string;
  linkId: string;
  collectionId: string;
}

/** Inserts an owner, a collection and its default link in the given states; returns the token. */
async function seed(
  tokens: GuestLinkTokens,
  states: { link?: GuestLinkStatus; collection?: CollectionStatus; owner?: UserStatus } = {},
): Promise<Seeded> {
  const { link = 'ACTIVE', collection = 'ACTIVE', owner = 'ACTIVE' } = states;
  const user = await prisma.user.create({
    data: {
      email: `${generateToken().slice(0, 10)}@stepler.test`,
      status: owner,
      ...(owner === 'BLOCKED' ? { blockedAt: new Date() } : {}),
    },
  });
  const row = await prisma.collection.create({
    data: {
      ownerId: user.id,
      title: 'Весілля',
      description: 'Опис',
      status: collection,
      ...(collection === 'ARCHIVED' ? { archivedAt: new Date() } : {}),
      ...(collection === 'DELETING' ? { deletionRequestedAt: new Date() } : {}),
    },
  });
  const issued = tokens.generate();
  const revoked = link === 'REVOKED';
  const created = await prisma.guestLink.create({
    data: {
      collectionId: row.id,
      isDefault: true,
      status: link,
      revokedAt: revoked ? new Date() : null,
      tokenHash: issued.tokenHash,
      tokenCiphertext: revoked ? null : issued.tokenCiphertext,
      tokenKeyId: revoked ? null : issued.tokenKeyId,
      canUploadPhotos: true,
      canUploadVideos: true,
      canUploadDocuments: true,
      canSubmitText: true,
      canViewGallery: false,
      canDeleteOwn: true,
    },
  });
  return { token: issued.token, linkId: created.id, collectionId: row.id };
}

describe('guest link resolution', () => {
  let app: INestApplication;
  let tokens: GuestLinkTokens;
  const logs = new CaptureStream();
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ LOG_LEVEL: 'info' }), { logDestination: logs });
    await listenOnLoopback(app);
    tokens = app.get(GuestLinkTokens);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    logs.output = '';
  });

  const resolve = (linkToken: string) =>
    request(server()).post('/api/v1/guest/links/resolve').set('Origin', ORIGIN).send({ linkToken });

  describe('state matrix (Review Focus 4, [G5])', () => {
    const linkStates: GuestLinkStatus[] = ['ACTIVE', 'INACTIVE', 'REVOKED'];
    const collectionStates: CollectionStatus[] = ['ACTIVE', 'ARCHIVED', 'DELETING'];
    const ownerStates: UserStatus[] = ['ACTIVE', 'BLOCKED'];

    function expected(
      link: GuestLinkStatus,
      collection: CollectionStatus,
      owner: UserStatus,
    ): [number, string | null] {
      if (collection === 'DELETING' || owner === 'BLOCKED') return [410, 'COLLECTION_UNAVAILABLE'];
      if (link === 'REVOKED') return [410, 'LINK_REVOKED'];
      if (collection === 'ARCHIVED') return [403, 'COLLECTION_ARCHIVED'];
      if (link === 'INACTIVE') return [403, 'LINK_INACTIVE'];
      return [200, null];
    }

    const cases = linkStates.flatMap((link) =>
      collectionStates.flatMap((collection) =>
        ownerStates.map((owner) => {
          const [status, code] = expected(link, collection, owner);
          return { link, collection, owner, status, code };
        }),
      ),
    );

    test.each(cases)(
      'link $link, collection $collection, owner $owner → $status $code',
      async ({ link, collection, owner, status, code }) => {
        const { token } = await seed(tokens, { link, collection, owner });
        const res = await resolve(token).expect(status);
        if (code === null) {
          resolveGuestLinkResponseSchema.parse(res.body);
        } else {
          expect(res.body).toMatchObject({ code });
          // Failure states never show the collection's title [G5].
          expect(JSON.stringify(res.body)).not.toContain('Весілля');
        }
      },
    );
  });

  test('a live link → its collection id, title, description and permissions only, not cached', async () => {
    const { token, linkId, collectionId } = await seed(tokens);
    const res = await resolve(token).expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(resolveGuestLinkResponseSchema.parse(res.body)).toEqual({
      collectionId,
      collection: { title: 'Весілля', description: 'Опис' },
      permissions: {
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: false,
        canDeleteOwn: true,
      },
    });
    // The collection id is needed for the session exchange [C3]; the link id stays private.
    expect(JSON.stringify(res.body)).not.toContain(linkId);
  });

  test('malformed and unknown tokens → the same 404; a rotated-out token → 410', async () => {
    const owner = await signInAs(app, prisma, 'a@stepler.test');
    const created = await request(server())
      .post('/api/v1/collections')
      .set('Cookie', owner.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'A' })
      .expect(201);
    const collectionId = (created.body as { id: string }).id;
    const listed = await request(server())
      .get(`/api/v1/collections/${collectionId}/guest-links`)
      .set('Cookie', owner.cookie)
      .expect(200);
    const link = (listed.body as { items: { id: string; url: string }[] }).items[0];
    const oldToken = link?.url.split('/g/')[1] ?? '';
    await request(server())
      .post(`/api/v1/collections/${collectionId}/guest-links/default/rotate`)
      .set('Cookie', owner.cookie)
      .set('Origin', ORIGIN)
      .send({ expectedLinkId: link?.id })
      .expect(200);

    const malformed = await resolve('x').expect(404);
    const unknown = await resolve(generateToken()).expect(404);
    const withoutId = (body: object) => ({ ...body, requestId: undefined });
    expect(withoutId(malformed.body as object)).toEqual(withoutId(unknown.body as object));
    expect(malformed.body).toMatchObject({ code: 'NOT_FOUND' });
    const rotated = await resolve(oldToken).expect(410);
    expect(rotated.body).toMatchObject({ code: 'LINK_REVOKED' });
  });

  test('pause, resume and permission changes take effect on the next resolve', async () => {
    const owner = await signInAs(app, prisma, 'a@stepler.test');
    const created = await request(server())
      .post('/api/v1/collections')
      .set('Cookie', owner.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'A' })
      .expect(201);
    const collectionId = (created.body as { id: string }).id;
    const listed = await request(server())
      .get(`/api/v1/collections/${collectionId}/guest-links`)
      .set('Cookie', owner.cookie)
      .expect(200);
    const link = (listed.body as { items: { id: string; url: string }[] }).items[0];
    const token = link?.url.split('/g/')[1] ?? '';
    const admin = (path: string, body: object = {}) =>
      request(server())
        .post(`/api/v1/guest-links/${link?.id}${path}`)
        .set('Cookie', owner.cookie)
        .set('Origin', ORIGIN)
        .send(body);

    await admin('/deactivate').expect(200);
    expect((await resolve(token).expect(403)).body).toMatchObject({ code: 'LINK_INACTIVE' });
    await admin('/activate').expect(200);
    await resolve(token).expect(200);

    await request(server())
      .patch(`/api/v1/guest-links/${link?.id}`)
      .set('Cookie', owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        permissions: {
          canUploadPhotos: true,
          canUploadVideos: true,
          canUploadDocuments: false,
          canSubmitText: true,
          canViewGallery: true,
          canDeleteOwn: true,
        },
      })
      .expect(200);
    const after = resolveGuestLinkResponseSchema.parse((await resolve(token).expect(200)).body);
    expect(after.permissions.canViewGallery).toBe(true);
    // Upload types are separate: documents off, photos and videos on.
    expect(after.permissions).toMatchObject({
      canUploadPhotos: true,
      canUploadVideos: true,
      canUploadDocuments: false,
    });
  });

  test('public, but the CSRF origin check applies', async () => {
    const { token } = await seed(tokens);
    const res = await request(server())
      .post('/api/v1/guest/links/resolve')
      .send({ linkToken: token })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'CSRF_ORIGIN_MISMATCH' });
    // No session cookie is needed.
    await resolve(token).expect(200);
  });

  test('rejects invalid bodies', async () => {
    for (const body of [{}, { linkToken: '' }, { linkToken: 'x'.repeat(201) }, { token: 'x' }]) {
      const res = await request(server())
        .post('/api/v1/guest/links/resolve')
        .set('Origin', ORIGIN)
        .send(body)
        .expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  test('Review Focus 3: neither a valid nor an invalid token reaches the logs', async () => {
    const { token } = await seed(tokens);
    const invalid = generateToken();
    await resolve(token).expect(200);
    await resolve(invalid).expect(404);
    // Also via a Referer from the guest page, should a browser ever send one.
    await request(server())
      .post('/api/v1/guest/links/resolve')
      .set('Origin', ORIGIN)
      .set('Referer', `${ORIGIN}/g/${token}`)
      .send({ linkToken: token })
      .expect(200);
    expect(logs.output).toContain('/api/v1/guest/links/resolve');
    for (const secret of [token, invalid]) expect(logs.output).not.toContain(secret);
  });
});

describe('guest link resolution rate limit', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE: '2' }));
    await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  test('the third resolve in a minute → 429 RATE_LIMITED with Retry-After', async () => {
    const resolve = () =>
      request(server())
        .post('/api/v1/guest/links/resolve')
        .set('Origin', ORIGIN)
        .send({ linkToken: generateToken() });
    await resolve().expect(404);
    await resolve().expect(404);
    const res = await resolve().expect(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });
});
