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

describe('upload session and media object schema', () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  let sequence = 0;
  const check = (constraint: string) => ({ kind: 'check', constraint });

  async function setup() {
    const ownerId = (await prisma.user.create({ data: { email: `u${sequence++}@x.io` } })).id;
    const collectionId = (await prisma.collection.create({ data: { ownerId, title: 'A' } })).id;
    const link = await prisma.guestLink.create({
      data: {
        collectionId,
        isDefault: true,
        tokenHash: `ulink-${sequence++}`,
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
      data: { collectionId, currentLinkId: link.id, tokenHash: `usession-${sequence++}` },
    });
    return { collectionId, linkId: link.id, sessionId: session.id };
  }

  /** A valid one-part upload; tests override fields to break one rule. */
  function upload(
    ids: { collectionId: string; linkId: string; sessionId: string },
    overrides: Record<string, unknown> = {},
  ) {
    const n = sequence++;
    return prisma.uploadSession.create({
      data: {
        collectionId: ids.collectionId,
        guestSessionId: ids.sessionId,
        guestLinkId: ids.linkId,
        clientUploadId: `0199a000-0000-7000-8000-${String(n).padStart(12, '0')}`,
        kind: 'PHOTO',
        originalFilename: 'IMG_1.jpg',
        declaredMime: 'image/jpeg',
        declaredSizeBytes: 1000n,
        storageKey: `collections/${ids.collectionId}/uploads/${n}/original`,
        multipartUploadId: `mp-${n}`,
        partSizeBytes: 10_485_760n,
        partCount: 1,
        expiresAt: new Date(Date.now() + 3600_000),
        ...overrides,
      },
    });
  }

  test('only files are uploaded, with a positive size', async () => {
    const ids = await setup();
    expect(await violation(upload(ids, { kind: 'TEXT' }))).toEqual(
      check('UploadSession_kind_is_file'),
    );
    expect(await violation(upload(ids, { declaredSizeBytes: 0n }))).toEqual(
      check('UploadSession_size_positive'),
    );
  });

  test('every upload has a positive part size and at least one part', async () => {
    const ids = await setup();
    const rule = check('UploadSession_parts_positive');
    expect(await violation(upload(ids, { partCount: 0 }))).toEqual(rule);
    expect(await violation(upload(ids, { partSizeBytes: 0n }))).toEqual(rule);
  });

  test('COMPLETED iff completedAt; REJECTED iff a reason', async () => {
    const ids = await setup();
    expect(await violation(upload(ids, { status: 'COMPLETED' }))).toEqual(
      check('UploadSession_completed_consistent'),
    );
    expect(await violation(upload(ids, { completedAt: new Date() }))).toEqual(
      check('UploadSession_completed_consistent'),
    );
    expect(await violation(upload(ids, { status: 'REJECTED' }))).toEqual(
      check('UploadSession_reject_reason'),
    );
    expect(await violation(upload(ids, { rejectReason: 'FILE_TYPE_NOT_ALLOWED' }))).toEqual(
      check('UploadSession_reject_reason'),
    );
    await upload(ids, { status: 'REJECTED', rejectReason: 'FILE_TYPE_NOT_ALLOWED' });
    await upload(ids, { status: 'COMPLETED', completedAt: new Date() });
  });

  test('clientUploadId is unique per guest session; storage keys are unique', async () => {
    const ids = await setup();
    const first = await upload(ids);
    expect(await violation(upload(ids, { clientUploadId: first.clientUploadId }))).toEqual({
      kind: 'unique',
      constraint: 'UploadSession_guestSessionId_clientUploadId_key',
    });
    expect(await violation(upload(ids, { storageKey: first.storageKey }))).toEqual({
      kind: 'unique',
      constraint: 'UploadSession_storageKey_key',
    });
  });

  test("the guest session and link belong to the upload's own collection", async () => {
    const x = await setup();
    const y = await setup();
    await expect(upload({ ...x, sessionId: y.sessionId })).rejects.toThrow();
    await expect(upload({ ...x, linkId: y.linkId })).rejects.toThrow();
    expect(await prisma.uploadSession.count()).toBe(0);
  });

  test('media objects: one per role, positive size, gone with their item; uploads keep going', async () => {
    const ids = await setup();
    const item = await prisma.contentItem.create({
      data: {
        collectionId: ids.collectionId,
        contributorGuestSessionId: ids.sessionId,
        frameNo: 1,
        kind: 'PHOTO',
        processingStatus: 'PENDING',
      },
    });
    const media = (role: 'ORIGINAL' | 'THUMBNAIL', sizeBytes: bigint, key = `k-${sequence++}`) =>
      prisma.mediaObject.create({
        data: { contentItemId: item.id, role, storageKey: key, mimeType: 'image/jpeg', sizeBytes },
      });
    expect(await violation(media('ORIGINAL', 0n))).toEqual(check('MediaObject_size_positive'));
    await media('ORIGINAL', 1000n);
    expect(await violation(media('ORIGINAL', 1000n))).toEqual({
      kind: 'unique',
      constraint: 'MediaObject_contentItemId_role_key',
    });
    const completed = await upload(ids, {
      status: 'COMPLETED',
      completedAt: new Date(),
      contentItemId: item.id,
    });
    await prisma.contentItem.delete({ where: { id: item.id } });
    expect(await prisma.mediaObject.count()).toBe(0);
    const after = await prisma.uploadSession.findUniqueOrThrow({ where: { id: completed.id } });
    expect(after.contentItemId).toBeNull();
    expect(after.status).toBe('COMPLETED');
  });

  test('deleting a guest session or the collection deletes its uploads', async () => {
    const ids = await setup();
    await upload(ids);
    await prisma.guestSession.delete({ where: { id: ids.sessionId } });
    expect(await prisma.uploadSession.count()).toBe(0);
    const other = await setup();
    await upload(other);
    await prisma.collection.delete({ where: { id: other.collectionId } });
    expect(await prisma.uploadSession.count()).toBe(0);
  });

  test('a link with uploads cannot be deleted on its own', async () => {
    const ids = await setup();
    await upload(ids);
    await prisma.guestSession.update({
      where: { id: ids.sessionId },
      data: { currentLinkId: ids.linkId },
    });
    await expect(prisma.guestLink.delete({ where: { id: ids.linkId } })).rejects.toThrow();
  });

  describe('upload purpose [A1]', () => {
    /** A valid COVER upload of the collection's owner. */
    async function coverUpload(
      ids: { collectionId: string },
      overrides: Record<string, unknown> = {},
    ) {
      const { ownerId } = await prisma.collection.findUniqueOrThrow({
        where: { id: ids.collectionId },
      });
      const n = sequence++;
      return prisma.uploadSession.create({
        data: {
          collectionId: ids.collectionId,
          purpose: 'COVER',
          uploaderUserId: ownerId,
          clientUploadId: `0199a000-0000-7000-8000-${String(n).padStart(12, '0')}`,
          kind: 'PHOTO',
          originalFilename: 'cover.jpg',
          declaredMime: 'image/jpeg',
          declaredSizeBytes: 1000n,
          storageKey: `collections/${ids.collectionId}/uploads/${n}/original`,
          multipartUploadId: `mp-${n}`,
          partSizeBytes: 10_485_760n,
          partCount: 1,
          expiresAt: new Date(Date.now() + 3600_000),
          ...overrides,
        },
      });
    }

    test('a CONTENT upload has its guest session and link; a COVER upload its uploader', async () => {
      const ids = await setup();
      const rule = check('UploadSession_purpose_actor');
      expect(await violation(upload(ids, { guestSessionId: null }))).toEqual(rule);
      expect(await violation(upload(ids, { guestLinkId: null }))).toEqual(rule);
      expect(await violation(coverUpload(ids, { uploaderUserId: null }))).toEqual(rule);
      // A cover upload carries nothing of a guest; a content upload no uploader.
      expect(
        await violation(
          coverUpload(ids, { guestSessionId: ids.sessionId, guestLinkId: ids.linkId }),
        ),
      ).toEqual(rule);
      const { ownerId } = await prisma.collection.findUniqueOrThrow({
        where: { id: ids.collectionId },
      });
      expect(await violation(upload(ids, { uploaderUserId: ownerId }))).toEqual(rule);
      await coverUpload(ids);
    });

    test('a cover is always a photo', async () => {
      const ids = await setup();
      expect(await violation(coverUpload(ids, { kind: 'VIDEO' }))).toEqual(
        check('UploadSession_cover_is_photo'),
      );
    });

    test('clientUploadId is unique per uploader; deleting the user deletes their cover uploads', async () => {
      const ids = await setup();
      const first = await coverUpload(ids);
      expect(await violation(coverUpload(ids, { clientUploadId: first.clientUploadId }))).toEqual({
        kind: 'unique',
        constraint: 'UploadSession_uploaderUserId_clientUploadId_key',
      });
      // The same id as a guest's upload is another key: no clash.
      await upload(ids, { clientUploadId: first.clientUploadId });
      await prisma.collection.delete({ where: { id: ids.collectionId } });
      await prisma.user.delete({ where: { id: first.uploaderUserId ?? '' } });
      expect(await prisma.uploadSession.count()).toBe(0);
    });
  });
});

describe('collection cover schema [A2]', () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  let sequence = 0;
  const check = (constraint: string) => ({ kind: 'check', constraint });

  async function collection(): Promise<string> {
    const ownerId = (await prisma.user.create({ data: { email: `c${sequence++}@x.io` } })).id;
    return (await prisma.collection.create({ data: { ownerId, title: 'A' } })).id;
  }

  /** A valid pending cover; tests override one field to break one rule. */
  const cover = (collectionId: string, overrides: Record<string, unknown> = {}) =>
    prisma.collectionCover.create({
      data: {
        collectionId,
        source: 'UPLOAD',
        mimeType: 'image/jpeg',
        originalSizeBytes: 1000n,
        ...overrides,
      },
    });

  test('the welcome message is 1 to 160 code points when set', async () => {
    const id = await collection();
    const rule = check('Collection_welcome_length');
    await prisma.collection.update({
      where: { id },
      data: { welcomeMessage: '😀'.repeat(160) },
    });
    expect(
      await violation(
        prisma.collection.update({ where: { id }, data: { welcomeMessage: '😀'.repeat(161) } }),
      ),
    ).toEqual(rule);
    expect(
      await violation(prisma.collection.update({ where: { id }, data: { welcomeMessage: '' } })),
    ).toEqual(rule);
    await prisma.collection.update({ where: { id }, data: { welcomeMessage: null } });
  });

  test('sizes: a positive original and a non-negative derived size', async () => {
    const id = await collection();
    const rule = check('CollectionCover_sizes');
    expect(await violation(cover(id, { originalSizeBytes: 0n }))).toEqual(rule);
    expect(await violation(cover(id, { derivedSizeBytes: -1n }))).toEqual(rule);
  });

  test('READY iff both dimensions are recorded', async () => {
    const id = await collection();
    const rule = check('CollectionCover_ready_dimensions');
    expect(await violation(cover(id, { status: 'READY' }))).toEqual(rule);
    expect(await violation(cover(id, { status: 'READY', width: 100 }))).toEqual(rule);
    expect(await violation(cover(id, { width: 100, height: 100 }))).toEqual(rule);
    expect(await violation(cover(id, { status: 'FAILED', width: 100, height: 100 }))).toEqual(rule);
    await cover(id, { status: 'READY', width: 100, height: 100, derivedSizeBytes: 500n });
  });

  test('one cover per collection; deleting the collection deletes it', async () => {
    const id = await collection();
    await cover(id);
    expect(await violation(cover(id, { source: 'FRAME' }))).toEqual({
      kind: 'unique',
      constraint: 'CollectionCover_collectionId_key',
    });
    await cover(await collection());
    await prisma.collection.delete({ where: { id } });
    expect(await prisma.collectionCover.count()).toBe(1);
  });
});
