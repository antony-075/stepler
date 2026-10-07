import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestPrisma, resetDatabase } from './support/database.js';

// The appeals and quarantine migration's rules (slice 9b plan, Task 2), against the real schema.

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

const insertAppeal = (
  collectionId: string,
  targetId: string,
  userId: string,
  text = 'Це помилка',
  extra = '',
  extraValues = '',
) =>
  violation(
    `INSERT INTO "ModerationAppeal"
       ("collectionId", "targetType", "targetId", "submittedByUserId", "text"${extra})
     VALUES ($1::uuid, 'CONTENT', $2::uuid, $3::uuid, $4${extraValues})`,
    collectionId,
    targetId,
    userId,
    text,
  );

describe('appeals and quarantine migration', () => {
  test('a quarantine sets its four columns together, with a reason of 1 to 500', async () => {
    const { owner, item } = await scene();
    const quarantine = (set: string) =>
      violation(
        // `$1` is typed even when `set` does not use it.
        `UPDATE "ContentItem" SET ${set} WHERE "id" = $2::uuid AND $1::uuid IS NOT NULL`,
        owner.id,
        item.id,
      );
    expect(await quarantine(`"quarantinedAt" = now()`)).toBe('ContentItem_quarantine_consistent');
    expect(
      await quarantine(
        `"quarantinedAt" = now(), "quarantinedByUserId" = $1::uuid, "quarantineReason" = 'Спам'`,
      ),
    ).toBe('ContentItem_quarantine_consistent');
    expect(
      await quarantine(
        `"quarantinedAt" = now(), "quarantinedByUserId" = $1::uuid, "quarantineReason" = '', "purgeAfter" = now() + interval '90 days'`,
      ),
    ).toBe('ContentItem_quarantine_reason_length');
    expect(
      await quarantine(
        `"quarantinedAt" = now(), "quarantinedByUserId" = $1::uuid, "quarantineReason" = 'Спам', "purgeAfter" = now() + interval '90 days'`,
      ),
    ).toBeNull();
  });

  test('a quarantine replaces an operator hide; an admin hide may stay', async () => {
    const { owner, item } = await scene();
    const hideThenQuarantine = (by: string, reason: string) =>
      violation(
        `UPDATE "ContentItem"
            SET "hiddenAt" = now(), "hiddenBy" = '${by}', "hiddenByUserId" = $1::uuid, "hiddenReason" = ${reason},
                "quarantinedAt" = now(), "quarantinedByUserId" = $1::uuid, "quarantineReason" = 'Спам',
                "purgeAfter" = now() + interval '90 days'
          WHERE "id" = $2::uuid`,
        owner.id,
        item.id,
      );
    expect(await hideThenQuarantine('OPERATOR', `'Порушення'`)).toBe(
      'ContentItem_quarantine_not_operator_hidden',
    );
    expect(await hideThenQuarantine('ADMIN', 'NULL')).toBeNull();
  });

  test('the sweep has a partial index over quarantined, undeleted frames', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'ContentItem_quarantine_purge_idx'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain('"quarantinedAt" IS NOT NULL');
    expect(rows[0]!.indexdef).toContain('"deletedAt" IS NULL');
  });

  test('one OPEN appeal per target; a decided one allows a new one', async () => {
    const { owner, collection, item } = await scene();
    expect(await insertAppeal(collection.id, item.id, owner.id)).toBeNull();
    expect(await insertAppeal(collection.id, item.id, owner.id)).toBe(
      'ModerationAppeal_one_open_per_target',
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "ModerationAppeal" SET "status" = 'REJECTED', "resolvedAt" = now(),
         "resolvedByUserId" = $1::uuid, "resolutionNote" = 'Підтверджено'`,
      owner.id,
    );
    expect(await insertAppeal(collection.id, item.id, owner.id)).toBeNull();
    // Another target may have its own open appeal.
    expect(await insertAppeal(collection.id, randomUUID(), owner.id)).toBeNull();
  });

  test('the text is 1 to 1000 characters; a rejection needs a note, an open appeal has none', async () => {
    const { owner, collection, item } = await scene();
    expect(await insertAppeal(collection.id, item.id, owner.id, '')).toBe(
      'ModerationAppeal_text_length',
    );
    expect(await insertAppeal(collection.id, item.id, owner.id, 'я'.repeat(1001))).toBe(
      'ModerationAppeal_text_length',
    );
    expect(
      await insertAppeal(
        collection.id,
        item.id,
        owner.id,
        'Текст',
        `, "status", "resolutionNote"`,
        `, 'REJECTED', 'Ні'`,
      ),
    ).toBe('ModerationAppeal_resolved_consistent');
    expect(
      await insertAppeal(
        collection.id,
        item.id,
        owner.id,
        'Текст',
        `, "status", "resolvedAt", "resolvedByUserId"`,
        `, 'REJECTED', now(), $3::uuid`,
      ),
    ).toBe('ModerationAppeal_rejection_note');
    expect(
      await insertAppeal(
        collection.id,
        item.id,
        owner.id,
        'Текст',
        `, "status", "resolvedAt", "resolvedByUserId", "resolutionNote"`,
        `, 'REJECTED', now(), $3::uuid, ''`,
      ),
    ).toBe('ModerationAppeal_note_length');
    expect(
      await insertAppeal(collection.id, item.id, owner.id, 'Текст', `, "resolutionNote"`, `, 'Ні'`),
    ).toBe('ModerationAppeal_open_has_no_note');
    // Upheld with or without a note is fine.
    expect(
      await insertAppeal(
        collection.id,
        item.id,
        owner.id,
        'Текст',
        `, "status", "resolvedAt", "resolvedByUserId"`,
        `, 'UPHELD', now(), $3::uuid`,
      ),
    ).toBeNull();
  });

  test('appeals outlive their collection (no foreign keys)', async () => {
    const { owner, collection, item } = await scene();
    expect(await insertAppeal(collection.id, item.id, owner.id)).toBeNull();
    await prisma.collection.delete({ where: { id: collection.id } });
    expect(await prisma.moderationAppeal.count({ where: { collectionId: collection.id } })).toBe(1);
  });
});
