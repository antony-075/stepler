import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { constraintViolation } from '../src/database/constraint-violation.js';
import { createTestPrisma, resetDatabase } from './support/database.js';

const prisma = createTestPrisma();

async function violation(
  promise: Promise<unknown>,
): Promise<ReturnType<typeof constraintViolation>> {
  try {
    await promise;
  } catch (error) {
    return constraintViolation(error);
  }
  throw new Error('expected a constraint violation');
}

describe('identity schema', () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('email is unique case-insensitively (citext)', async () => {
    await prisma.user.create({ data: { email: 'Anton@Example.com' } });
    expect(await violation(prisma.user.create({ data: { email: 'anton@example.com' } }))).toEqual({
      kind: 'unique',
      constraint: 'User_email_key',
    });
    expect(await prisma.user.findUnique({ where: { email: 'ANTON@example.COM' } })).not.toBeNull();
  });

  test('BLOCKED requires blockedAt, and blockedAt requires BLOCKED', async () => {
    const blocked = { kind: 'check', constraint: 'User_blocked_consistent' };
    expect(
      await violation(prisma.user.create({ data: { email: 'a@x.io', status: 'BLOCKED' } })),
    ).toEqual(blocked);
    expect(
      await violation(prisma.user.create({ data: { email: 'b@x.io', blockedAt: new Date() } })),
    ).toEqual(blocked);
    await prisma.user.create({
      data: { email: 'c@x.io', status: 'BLOCKED', blockedAt: new Date() },
    });
  });

  test('displayName is at most 80 characters', async () => {
    await prisma.user.create({ data: { email: 'a@x.io', displayName: 'x'.repeat(80) } });
    expect(
      await violation(
        prisma.user.create({ data: { email: 'b@x.io', displayName: 'x'.repeat(81) } }),
      ),
    ).toEqual({ kind: 'check', constraint: 'User_displayName_length' });
  });

  test('provider accounts are unique per provider', async () => {
    const user = await prisma.user.create({ data: { email: 'a@x.io' } });
    await prisma.authAccount.create({
      data: { userId: user.id, provider: 'GOOGLE', providerAccountId: 'g-1' },
    });
    expect(
      await violation(
        prisma.authAccount.create({
          data: { userId: user.id, provider: 'GOOGLE', providerAccountId: 'g-1' },
        }),
      ),
    ).toEqual({ kind: 'unique', constraint: 'AuthAccount_provider_providerAccountId_key' });
  });

  test('deleting a user cascades to accounts and sessions', async () => {
    const user = await prisma.user.create({ data: { email: 'a@x.io' } });
    await prisma.authAccount.create({
      data: { userId: user.id, provider: 'EMAIL', providerAccountId: 'a@x.io' },
    });
    await prisma.authSession.create({
      data: { userId: user.id, tokenHash: 'h1', expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.authAccount.count()).toBe(0);
    expect(await prisma.authSession.count()).toBe(0);
  });

  test('ids from sequential inserts are UUIDv7 and sort by creation', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await prisma.user.create({ data: { email: `u${i}@x.io` } })).id);
    }
    expect(ids.every((id) => id[14] === '7')).toBe(true);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('collection schema', () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function owner(): Promise<string> {
    return (await prisma.user.create({ data: { email: 'owner@x.io' } })).id;
  }

  test('ARCHIVED requires archivedAt', async () => {
    const ownerId = await owner();
    expect(
      await violation(
        prisma.collection.create({ data: { ownerId, title: 'A', status: 'ARCHIVED' } }),
      ),
    ).toEqual({ kind: 'check', constraint: 'Collection_archived_consistent' });
    await prisma.collection.create({
      data: { ownerId, title: 'A', status: 'ARCHIVED', archivedAt: new Date() },
    });
  });

  test('DELETING requires deletionRequestedAt', async () => {
    const ownerId = await owner();
    expect(
      await violation(
        prisma.collection.create({ data: { ownerId, title: 'A', status: 'DELETING' } }),
      ),
    ).toEqual({ kind: 'check', constraint: 'Collection_deleting_consistent' });
  });

  test('title is 1 to 100 characters and description at most 1000', async () => {
    const ownerId = await owner();
    await prisma.collection.create({ data: { ownerId, title: 'x'.repeat(100) } });
    expect(
      await violation(prisma.collection.create({ data: { ownerId, title: 'x'.repeat(101) } })),
    ).toEqual({ kind: 'check', constraint: 'Collection_title_length' });
    expect(await violation(prisma.collection.create({ data: { ownerId, title: '' } }))).toEqual({
      kind: 'check',
      constraint: 'Collection_title_length',
    });
    expect(
      await violation(
        prisma.collection.create({ data: { ownerId, title: 'A', description: 'x'.repeat(1001) } }),
      ),
    ).toEqual({ kind: 'check', constraint: 'Collection_description_length' });
  });

  test('a user who owns a collection cannot be deleted', async () => {
    const ownerId = await owner();
    await prisma.collection.create({ data: { ownerId, title: 'A' } });
    await expect(prisma.user.delete({ where: { id: ownerId } })).rejects.toThrow();
    expect(await prisma.user.count()).toBe(1);
  });

  test('audit events survive deleting their collection (no foreign key)', async () => {
    const ownerId = await owner();
    const collection = await prisma.collection.create({ data: { ownerId, title: 'A' } });
    await prisma.auditEvent.create({
      data: {
        collectionId: collection.id,
        actorType: 'ADMIN',
        actorId: ownerId,
        action: 'collection.create',
        targetType: 'collection',
        targetId: collection.id,
      },
    });
    await prisma.collection.delete({ where: { id: collection.id } });
    expect(await prisma.auditEvent.count({ where: { targetId: collection.id } })).toBe(1);
  });
});

describe('guest link schema', () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  let sequence = 0;
  async function collection(): Promise<string> {
    const ownerId = (await prisma.user.create({ data: { email: `o${sequence++}@x.io` } })).id;
    return (await prisma.collection.create({ data: { ownerId, title: 'A' } })).id;
  }

  /** A valid live default link; tests override one field to break one rule. */
  function link(collectionId: string, overrides: Record<string, unknown> = {}) {
    return prisma.guestLink.create({
      data: {
        collectionId,
        isDefault: true,
        tokenHash: `hash-${sequence++}`,
        tokenCiphertext: 'ct',
        tokenKeyId: 'app-secret-v1',
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: false,
        canDeleteOwn: true,
        ...overrides,
      },
    });
  }

  const revoked = {
    status: 'REVOKED',
    revokedAt: new Date(),
    tokenCiphertext: null,
    tokenKeyId: null,
  };
  const check = (constraint: string) => ({ kind: 'check', constraint });

  test('a link allows at least one of upload, text or gallery', async () => {
    const id = await collection();
    expect(
      await violation(
        link(id, {
          canUploadPhotos: false,
          canUploadVideos: false,
          canUploadDocuments: false,
          canSubmitText: false,
          canDeleteOwn: false,
        }),
      ),
    ).toEqual(check('GuestLink_has_capability'));
    await link(id, {
      canUploadPhotos: false,
      canUploadVideos: false,
      canUploadDocuments: false,
      canSubmitText: false,
      canViewGallery: true,
      canDeleteOwn: false,
    });
  });

  test('delete-own needs a contribution permission', async () => {
    const id = await collection();
    expect(
      await violation(
        link(id, {
          canUploadPhotos: false,
          canUploadVideos: false,
          canUploadDocuments: false,
          canSubmitText: false,
          canViewGallery: true,
        }),
      ),
    ).toEqual(check('GuestLink_delete_own_needs_contribution'));
  });

  test('any one upload type is a contribution, also for delete-own', async () => {
    const id = await collection();
    for (const only of ['canUploadPhotos', 'canUploadVideos', 'canUploadDocuments'] as const) {
      await link(id, {
        isDefault: false,
        label: only,
        canUploadPhotos: false,
        canUploadVideos: false,
        canUploadDocuments: false,
        canSubmitText: false,
        canViewGallery: false,
        canDeleteOwn: true,
        [only]: true,
      });
    }
  });

  test('REVOKED if and only if revokedAt is set', async () => {
    const id = await collection();
    expect(await violation(link(id, { ...revoked, revokedAt: null }))).toEqual(
      check('GuestLink_revoked_consistent'),
    );
    expect(await violation(link(id, { revokedAt: new Date() }))).toEqual(
      check('GuestLink_revoked_consistent'),
    );
  });

  test('a live link keeps its ciphertext and key id; a revoked one keeps neither', async () => {
    const id = await collection();
    const rule = check('GuestLink_ciphertext_while_live');
    expect(await violation(link(id, { tokenCiphertext: null, tokenKeyId: null }))).toEqual(rule);
    expect(await violation(link(id, { tokenKeyId: null }))).toEqual(rule);
    expect(
      await violation(link(id, { ...revoked, tokenCiphertext: 'ct', tokenKeyId: 'k' })),
    ).toEqual(rule);
    await link(id, revoked);
  });

  test('only a revoked link can point at its replacement', async () => {
    const id = await collection();
    const old = await link(id, revoked);
    const live = await link(id);
    expect(
      await violation(link(id, { isDefault: false, label: 'B', replacedById: old.id })),
    ).toEqual(check('GuestLink_replaced_only_revoked'));
    await prisma.guestLink.update({ where: { id: old.id }, data: { replacedById: live.id } });
  });

  test('only a revoked additional link can be hidden', async () => {
    const id = await collection();
    const rule = check('GuestLink_hidden_only_revoked_additional');
    const hiddenAt = new Date();
    expect(await violation(link(id, { isDefault: false, label: 'B', hiddenAt }))).toEqual(rule);
    expect(await violation(link(id, { ...revoked, hiddenAt }))).toEqual(rule);
    await link(id, { ...revoked, isDefault: false, label: 'B', hiddenAt });
  });

  test('labels: none on the default link, 1 to 60 characters on additional links', async () => {
    const id = await collection();
    const rule = check('GuestLink_label_rules');
    expect(await violation(link(id, { label: 'A' }))).toEqual(rule);
    expect(await violation(link(id, { isDefault: false }))).toEqual(rule);
    expect(await violation(link(id, { isDefault: false, label: '' }))).toEqual(rule);
    expect(await violation(link(id, { isDefault: false, label: 'x'.repeat(61) }))).toEqual(rule);
    await link(id, { isDefault: false, label: 'x'.repeat(60) });
  });

  test('one live default link per collection; revoked defaults do not count', async () => {
    const id = await collection();
    await link(id, revoked);
    await link(id);
    expect(await violation(link(id))).toEqual({
      kind: 'unique',
      constraint: 'GuestLink_one_live_default',
    });
    expect(await violation(link(id, { status: 'INACTIVE' }))).toEqual({
      kind: 'unique',
      constraint: 'GuestLink_one_live_default',
    });
    await link(await collection());
  });

  test('deleting a collection deletes its links', async () => {
    const id = await collection();
    await link(id);
    await link(id, { isDefault: false, label: 'B' });
    await prisma.collection.delete({ where: { id } });
    expect(await prisma.guestLink.count()).toBe(0);
  });
});

describe('guest session and content schema', () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  let sequence = 0;
  const check = (constraint: string) => ({ kind: 'check', constraint });

  /** A collection with a live default link and one guest session on it. */
  async function setup() {
    const ownerId = (await prisma.user.create({ data: { email: `o${sequence++}@x.io` } })).id;
    const collectionId = (await prisma.collection.create({ data: { ownerId, title: 'A' } })).id;
    const link = await prisma.guestLink.create({
      data: {
        collectionId,
        isDefault: true,
        tokenHash: `link-${sequence++}`,
        tokenCiphertext: 'ct',
        tokenKeyId: 'app-secret-v1',
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: false,
        canDeleteOwn: true,
      },
    });
    const session = await prisma.guestSession.create({
      data: { collectionId, currentLinkId: link.id, tokenHash: `session-${sequence++}` },
    });
    return { collectionId, linkId: link.id, sessionId: session.id };
  }

  /** A valid text item; tests override one field to break one rule. */
  function item(
    ids: { collectionId: string; sessionId: string },
    overrides: Record<string, unknown> = {},
  ) {
    return prisma.contentItem.create({
      data: {
        collectionId: ids.collectionId,
        contributorGuestSessionId: ids.sessionId,
        frameNo: ++sequence,
        kind: 'TEXT',
        textBody: 'Вітаємо!',
        processingStatus: 'NOT_REQUIRED',
        ...overrides,
      },
    });
  }

  test('frame numbers start at 1 and are unique per collection', async () => {
    const ids = await setup();
    const collection = await prisma.collection.findUniqueOrThrow({
      where: { id: ids.collectionId },
    });
    expect(collection.nextFrameNo).toBe(1);
    await item(ids, { frameNo: 7 });
    expect(await violation(item(ids, { frameNo: 7 }))).toEqual({
      kind: 'unique',
      constraint: 'ContentItem_collectionId_frameNo_key',
    });
    await item(await setup(), { frameNo: 7 });
    expect(await violation(item(ids, { frameNo: 0 }))).toEqual(check('ContentItem_frame_positive'));
    expect(
      await violation(
        prisma.collection.update({ where: { id: ids.collectionId }, data: { nextFrameNo: 0 } }),
      ),
    ).toEqual(check('Collection_next_frame_positive'));
  });

  test('a TEXT item has a body and only a TEXT item has one', async () => {
    const ids = await setup();
    const rule = check('ContentItem_text_consistent');
    expect(await violation(item(ids, { textBody: null }))).toEqual(rule);
    expect(
      await violation(item(ids, { kind: 'DOCUMENT', processingStatus: 'NOT_REQUIRED' })),
    ).toEqual(rule);
  });

  test('a text is 1 to 5000 code points', async () => {
    const ids = await setup();
    const rule = check('ContentItem_text_length');
    await item(ids, { textBody: '😀'.repeat(5000) });
    expect(await violation(item(ids, { textBody: '😀'.repeat(5001) }))).toEqual(rule);
    expect(await violation(item(ids, { textBody: 'a'.repeat(5001) }))).toEqual(rule);
    expect(await violation(item(ids, { textBody: '' }))).toEqual(rule);
  });

  test('a contributor name is 1 to 80 characters, on the session and on the item', async () => {
    const ids = await setup();
    await item(ids, { contributorName: 'я'.repeat(80) });
    expect(await violation(item(ids, { contributorName: 'я'.repeat(81) }))).toEqual(
      check('ContentItem_name_length'),
    );
    expect(await violation(item(ids, { contributorName: '' }))).toEqual(
      check('ContentItem_name_length'),
    );
    await prisma.guestSession.update({
      where: { id: ids.sessionId },
      data: { contributorName: 'я'.repeat(80) },
    });
    expect(
      await violation(
        prisma.guestSession.update({
          where: { id: ids.sessionId },
          data: { contributorName: 'я'.repeat(81) },
        }),
      ),
    ).toEqual(check('GuestSession_name_length'));
  });

  test('texts and documents need no processing; photos and videos do', async () => {
    const ids = await setup();
    const rule = check('ContentItem_processing_by_kind');
    expect(await violation(item(ids, { processingStatus: 'PENDING' }))).toEqual(rule);
    expect(
      await violation(
        item(ids, { kind: 'PHOTO', textBody: null, processingStatus: 'NOT_REQUIRED' }),
      ),
    ).toEqual(rule);
    await item(ids, { kind: 'PHOTO', textBody: null, processingStatus: 'PENDING' });
    await item(ids, { kind: 'VIDEO', textBody: null, processingStatus: 'FAILED' });
    await item(ids, { kind: 'DOCUMENT', textBody: null, processingStatus: 'NOT_REQUIRED' });
  });

  test('an idempotency key is unique per guest session', async () => {
    const ids = await setup();
    const idempotencyKey = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
    await item(ids, { idempotencyKey });
    expect(await violation(item(ids, { idempotencyKey }))).toEqual({
      kind: 'unique',
      constraint: 'ContentItem_contributorGuestSessionId_idempotencyKey_key',
    });
    await item(await setup(), { idempotencyKey });
  });

  test('deleting a guest session keeps its items, without the session', async () => {
    const ids = await setup();
    const { id } = await item(ids);
    await prisma.guestSession.delete({ where: { id: ids.sessionId } });
    const row = await prisma.contentItem.findUniqueOrThrow({ where: { id } });
    expect(row.contributorGuestSessionId).toBeNull();
  });

  test("a session's link and an item's session belong to the row's own collection", async () => {
    const x = await setup();
    const y = await setup();
    await expect(
      prisma.guestSession.create({
        data: { collectionId: x.collectionId, currentLinkId: y.linkId, tokenHash: 'cross' },
      }),
    ).rejects.toThrow();
    await expect(item({ collectionId: x.collectionId, sessionId: y.sessionId })).rejects.toThrow();
    await expect(
      prisma.guestSession.update({
        where: { id: x.sessionId },
        data: { currentLinkId: y.linkId },
      }),
    ).rejects.toThrow();
    expect(await prisma.contentItem.count()).toBe(0);
  });

  test('a link a session points at cannot be deleted', async () => {
    const ids = await setup();
    await expect(prisma.guestLink.delete({ where: { id: ids.linkId } })).rejects.toThrow();
    expect(await prisma.guestLink.count()).toBe(1);
  });

  test('deleting a collection deletes its sessions and items', async () => {
    const ids = await setup();
    await item(ids);
    await prisma.collection.delete({ where: { id: ids.collectionId } });
    expect(await prisma.guestSession.count()).toBe(0);
    expect(await prisma.contentItem.count()).toBe(0);
  });
});
