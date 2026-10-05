import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { currentLegalVersion, LEGAL_DOCUMENTS, meResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/create-app.js';
import { listenOnLoopback } from './support/app.js';
import { createTestPrisma, resetDatabase } from './support/database.js';
import { testEnv } from './support/env.js';
import { signInAs } from './support/sessions.js';

const ORIGIN = 'http://localhost:3000';
const OPERATOR = 'op@stepler.test';
const prisma = createTestPrisma();

const current = (document: 'TERMS' | 'PRIVACY') => currentLegalVersion(document).version;
const BOTH = {
  acceptances: [
    { document: 'TERMS', version: current('TERMS') },
    { document: 'PRIVACY', version: current('PRIVACY') },
  ],
};

describe('legal acceptance (ADR 0016)', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    app = await createApp(testEnv({ OPERATOR_EMAILS: OPERATOR }));
    await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  /** A pre-slice account: signed in, no acceptance rows. */
  const unaccepted = (email = 'a@stepler.test') => signInAs(app, prisma, email, true, false);

  const accept = (cookie: string, body: unknown, requestId?: string) => {
    const req = request(server())
      .post('/api/v1/me/legal-acceptances')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    if (requestId !== undefined) req.set('x-request-id', requestId);
    return req.send(body as object);
  };

  test('no cookie → 401 on GET /me and POST /me/legal-acceptances', async () => {
    await request(server()).get('/api/v1/me').expect(401);
    const res = await request(server())
      .post('/api/v1/me/legal-acceptances')
      .set('Origin', ORIGIN)
      .send(BOTH)
      .expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  test('GET /me reports nothing accepted for an account without rows', async () => {
    const { cookie } = await unaccepted();
    const res = await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(200);
    const me = meResponseSchema.parse(res.body);
    expect(me.legal.accepted).toBe(false);
    expect(me.legal.documents).toEqual(
      LEGAL_DOCUMENTS.map((entry) => ({
        document: entry.document,
        requiredVersion: entry.version,
        acceptedVersion: null,
        acceptedAt: null,
      })),
    );
  });

  describe('Review Focus 1: the gate', () => {
    const gated = (cookie: string) => [
      request(server()).get('/api/v1/collections').set('Cookie', cookie),
      request(server())
        .post('/api/v1/collections')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ title: 'Весілля' }),
      request(server()).get('/api/v1/me/usage').set('Cookie', cookie),
      request(server()).get(`/api/v1/collections/${randomUUID()}/content`).set('Cookie', cookie),
    ];

    test('every account route except the exempt three → 403 LEGAL_ACCEPTANCE_REQUIRED', async () => {
      const { cookie } = await unaccepted();
      for (const res of await Promise.all(gated(cookie))) {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'LEGAL_ACCEPTANCE_REQUIRED' });
      }
      expect(await prisma.collection.count()).toBe(0);
    });

    test('operators are gated too', async () => {
      const { cookie } = await unaccepted(OPERATOR);
      const res = await request(server()).get('/api/v1/collections').set('Cookie', cookie);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'LEGAL_ACCEPTANCE_REQUIRED' });
      // The operator flag still shows on the exempt profile route.
      const me = await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(200);
      expect(me.body).toMatchObject({ isOperator: true });
    });

    test('GET /me, PATCH /me and logout stay open; public guest routes answer for themselves', async () => {
      const { cookie } = await unaccepted();
      await request(server()).get('/api/v1/me').set('Cookie', cookie).expect(200);
      const patched = await request(server())
        .patch('/api/v1/me')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ locale: 'en' })
        .expect(200);
      expect(patched.body).toMatchObject({ locale: 'en', legal: { accepted: false } });
      // Only the locale: a name waits for the acceptance.
      const named = await request(server())
        .patch('/api/v1/me')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ displayName: 'Оля' })
        .expect(403);
      expect(named.body).toMatchObject({ code: 'LEGAL_ACCEPTANCE_REQUIRED' });
      expect((await prisma.user.findFirstOrThrow()).displayName).toBeNull();

      const guest = await request(server())
        .post('/api/v1/guest/links/resolve')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ linkToken: 'not-a-real-token' });
      expect(guest.status).toBe(404);

      await request(server())
        .post('/api/v1/auth/logout')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(204);
    });

    test('an accepted account passes the gate', async () => {
      const { cookie } = await signInAs(app, prisma, 'ok@stepler.test');
      await request(server()).get('/api/v1/collections').set('Cookie', cookie).expect(200);
    });
  });

  test('accepting both → 200 MeResponse; rows carry the request id and no IP', async () => {
    const { cookie, userId } = await unaccepted();
    const res = await accept(cookie, BOTH, 'legal-req-0001').expect(200);
    const me = meResponseSchema.parse(res.body);
    expect(me.legal.accepted).toBe(true);
    for (const doc of me.legal.documents) {
      expect(doc.acceptedVersion).toBe(doc.requiredVersion);
      expect(new Date(doc.acceptedAt ?? '').toISOString()).toBe(doc.acceptedAt);
    }

    const rows = await prisma.legalAcceptance.findMany({ where: { userId } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.requestId).toBe('legal-req-0001');
      expect(Object.keys(row).sort()).toEqual(
        ['acceptedAt', 'document', 'id', 'requestId', 'userId', 'version'].sort(),
      );
    }
    await request(server()).get('/api/v1/collections').set('Cookie', cookie).expect(200);
  });

  test('Review Focus 3: repeated and parallel acceptances → one row per document and version', async () => {
    const { cookie, userId } = await unaccepted();
    await accept(cookie, BOTH).expect(200);
    await accept(cookie, BOTH).expect(200);
    expect(await prisma.legalAcceptance.count({ where: { userId } })).toBe(2);

    const other = await unaccepted('b@stepler.test');
    const results = await Promise.all([accept(other.cookie, BOTH), accept(other.cookie, BOTH)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.legalAcceptance.count({ where: { userId: other.userId } })).toBe(2);
  });

  test('Review Focus 2 (b): an outdated version → 400 LEGAL_VERSION_OUTDATED, nothing written', async () => {
    const { cookie } = await unaccepted();
    const outdated = await accept(cookie, {
      acceptances: [{ document: 'TERMS', version: 'v9' }],
    }).expect(400);
    expect(outdated.body).toMatchObject({ code: 'LEGAL_VERSION_OUTDATED' });

    const mixed = await accept(cookie, {
      acceptances: [
        { document: 'TERMS', version: current('TERMS') },
        { document: 'PRIVACY', version: 'v9' },
      ],
    }).expect(400);
    expect(mixed.body).toMatchObject({ code: 'LEGAL_VERSION_OUTDATED' });
    expect(await prisma.legalAcceptance.count()).toBe(0);
  });

  test('partial acceptance: one document is not enough; the second completes it', async () => {
    const { cookie } = await unaccepted();
    const first = await accept(cookie, {
      acceptances: [{ document: 'TERMS', version: current('TERMS') }],
    }).expect(200);
    const afterTerms = meResponseSchema.parse(first.body).legal;
    expect(afterTerms.accepted).toBe(false);
    expect(afterTerms.documents[0]?.acceptedVersion).toBe(current('TERMS'));
    await request(server()).get('/api/v1/collections').set('Cookie', cookie).expect(403);

    const second = await accept(cookie, {
      acceptances: [{ document: 'PRIVACY', version: current('PRIVACY') }],
    }).expect(200);
    expect(meResponseSchema.parse(second.body).legal.accepted).toBe(true);
    await request(server()).get('/api/v1/collections').set('Cookie', cookie).expect(200);
    // Accepted: the name can change now.
    await request(server())
      .patch('/api/v1/me')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ displayName: 'Оля' })
      .expect(200);
  });

  test('malformed bodies → 400 VALIDATION_FAILED', async () => {
    const { cookie } = await unaccepted();
    const item = { document: 'TERMS', version: current('TERMS') };
    for (const body of [
      { acceptances: [] },
      { acceptances: [item, item, item] },
      { acceptances: [{ document: 'TERMS', version: '1' }] },
      { acceptances: [{ document: 'COOKIES', version: 'v1' }] },
      {},
    ]) {
      const res = await accept(cookie, body).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    expect(await prisma.legalAcceptance.count()).toBe(0);
  });

  test('the database refuses a malformed version and cascades rows with the user', async () => {
    const { cookie, userId } = await unaccepted();
    await expect(
      prisma.legalAcceptance.create({ data: { userId, document: 'TERMS', version: 'x1' } }),
    ).rejects.toThrow();
    await accept(cookie, BOTH).expect(200);
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.legalAcceptance.count()).toBe(0);
  });
});
