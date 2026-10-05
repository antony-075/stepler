import { definitionOf } from '@stepler/templates/core';
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Writes the collection's PUBLISHED guest page version (classic defaults unless overridden), as
 * a collection created through the API would have. For tests that seed collections directly.
 */
export async function setPublishedPage(
  prisma: PrismaClient,
  collectionId: string,
  data: Partial<Prisma.GuestPageVersionUncheckedCreateInput> = {},
) {
  const classic = definitionOf('classic')!;
  return prisma.guestPageVersion.upsert({
    where: { collectionId_state: { collectionId, state: 'PUBLISHED' } },
    create: {
      collectionId,
      state: 'PUBLISHED',
      templateId: classic.id,
      templateVersion: classic.version,
      settings: classic.defaults,
      ...data,
    },
    update: data,
  });
}

/**
 * A COVER image row of the collection made the published cover. `PENDING` unless overridden;
 * `READY` needs `width` and `height` (CHECK "CollectionImage_ready_dimensions").
 */
export async function seedPublishedCover(
  prisma: PrismaClient,
  collectionId: string,
  data: Partial<Prisma.CollectionImageUncheckedCreateInput> = {},
) {
  const image = await prisma.collectionImage.create({
    data: {
      collectionId,
      slot: 'COVER',
      source: 'FRAME',
      mimeType: 'image/jpeg',
      originalSizeBytes: 1000n,
      ...data,
    },
  });
  await setPublishedPage(prisma, collectionId, { coverImageId: image.id });
  return image;
}
