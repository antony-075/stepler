import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestPrisma, resetDatabase } from './support/database.js';

// The content moderation migration's rules (slice 9 plan, Task 2), against the real schema.

const prisma = createTestPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

/** Runs `sql` and returns the violated constraint's name, or `null` when it succeeded. */
async function violation(sql: string, ...values: unknown[]): Promise<string | null> {
  try {
    await prisma.$executeRawUnsafe(sql, ...values);
    return null;
  } catch (error) {
    const text = String((error as Error).message);
    return /"([A-Za-z_]+)"/.exec(text.slice(text.indexOf('constraint')))?.[1] ?? text;
  }
}

async function scene() {
  const owner = await prisma.user.create({ data: { email: 'olena@example.com' } });
  const collection = await prisma.collection.create({
    data: { ownerId: owner.id, title: 'Весілля' },
  });
  const item = await prisma.contentItem.create({
    data: {
      collectionId: collection.id,
      frameNo: 1,
      kind: 'TEXT',
      textBody: 'Вітаємо!',
      processingStatus: 'NOT_REQUIRED',
    },
  });
  return { owner, collection, item };
}

const insertReport = (
  contentId: string,
  collectionId: string,
  sessionId: string,
  extra = '',
  extraValues = '',
) =>
  violation(
    `INSERT INTO "ContentReport"
       ("contentId", "collectionId", "reporterGuestSessionId", "idempotencyKey", "reason"${extra})
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'SPAM'${extraValues})`,
    contentId,
    collectionId,
    sessionId,
    randomUUID(),
  );

describe('content moderation migration', () => {
  test('a hide sets the time, who and the account together; the operator gives a reason', async () => {
    const { owner, item } = await scene();
    expect(
      await violation(
        `UPDATE "ContentItem" SET "hiddenAt" = now(), "hiddenByUserId" = $1::uuid WHERE "id" = $2::uuid`,
        owner.id,
        item.id,
      ),
    ).toBe('ContentItem_hidden_consistent');
    expect(
      await violation(
        `UPDATE "ContentItem" SET "hiddenAt" = now(), "hiddenBy" = 'OPERATOR', "hiddenByUserId" = $1::uuid WHERE "id" = $2::uuid`,
        owner.id,
        item.id,
      ),
    ).toBe('ContentItem_operator_hide_reason');
    expect(
      await violation(
        `UPDATE "ContentItem" SET "hiddenAt" = now(), "hiddenBy" = 'OPERATOR', "hiddenByUserId" = $1::uuid, "hiddenReason" = '' WHERE "id" = $2::uuid`,
        owner.id,
        item.id,
      ),
    ).toBe('ContentItem_hidden_reason_length');
    expect(
      await violation(
        `UPDATE "ContentItem" SET "hiddenAt" = now(), "hiddenBy" = 'ADMIN', "hiddenByUserId" = $1::uuid WHERE "id" = $2::uuid`,
        owner.id,
        item.id,
      ),
    ).toBeNull();
  });

  test('one OPEN report per guest session and item; a decided one allows a new one', async () => {
    const { owner, collection, item } = await scene();
    const session = randomUUID();
    expect(await insertReport(item.id, collection.id, session)).toBeNull();
    expect(await insertReport(item.id, collection.id, session)).toBe(
      'ContentReport_one_open_per_guest',
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "ContentReport" SET "status" = 'DISMISSED', "resolvedAt" = now(),
         "resolvedByUserId" = $1::uuid, "resolutionNote" = 'Ні' `,
      owner.id,
    );
    expect(await insertReport(item.id, collection.id, session)).toBeNull();
    // Another session may report the same item.
    expect(await insertReport(item.id, collection.id, randomUUID())).toBeNull();
  });

  test('a decision without its time violates resolved_consistent; a contact needs its locale', async () => {
    const { collection, item } = await scene();
    expect(
      await insertReport(item.id, collection.id, randomUUID(), `, "status"`, `, 'DISMISSED'`),
    ).toBe('ContentReport_resolved_consistent');
    expect(
      await insertReport(
        item.id,
        collection.id,
        randomUUID(),
        `, "reporterEmail"`,
        `, 'r@example.com'`,
      ),
    ).toBe('ContentReport_contact_consistent');
    expect(
      await insertReport(
        item.id,
        collection.id,
        randomUUID(),
        `, "reporterEmail", "reporterLocale"`,
        `, 'r@example.com', 'en'`,
      ),
    ).toBeNull();
    expect(
      await insertReport(item.id, collection.id, randomUUID(), `, "description"`, `, ''`),
    ).toBe('ContentReport_description_length');
  });

  test('a block has a reason', async () => {
    const { collection } = await scene();
    expect(
      await violation(
        `UPDATE "Collection" SET "blockedAt" = now() WHERE "id" = $1::uuid`,
        collection.id,
      ),
    ).toBe('Collection_blocked_consistent');
    expect(
      await violation(
        `UPDATE "Collection" SET "blockedAt" = now(), "blockedReason" = $2 WHERE "id" = $1::uuid`,
        collection.id,
        'x'.repeat(501),
      ),
    ).toBe('Collection_blocked_reason_length');
    expect(
      await violation(
        `UPDATE "Collection" SET "blockedAt" = now(), "blockedReason" = 'Спам' WHERE "id" = $1::uuid`,
        collection.id,
      ),
    ).toBeNull();
  });

  test('the guest feed and own indexes skip hidden frames', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE indexname IN ('ContentItem_guest_feed_idx', 'ContentItem_own_idx')`,
    );
    expect(rows.map((row) => row.indexname).sort()).toEqual([
      'ContentItem_guest_feed_idx',
      'ContentItem_own_idx',
    ]);
    for (const row of rows) expect(row.indexdef).toContain('"hiddenAt" IS NULL');
  });

  test('reports outlive their collection (no foreign keys)', async () => {
    const { collection, item } = await scene();
    expect(await insertReport(item.id, collection.id, randomUUID())).toBeNull();
    await prisma.collection.delete({ where: { id: collection.id } });
    expect(await prisma.contentReport.count({ where: { collectionId: collection.id } })).toBe(1);
  });
});
