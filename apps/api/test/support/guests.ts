import { freshTrialEnd, grantTestPlan } from './billing.js';
import { setPublishedPage } from './guest-page.js';
import type { Server } from 'node:http';
import type { GuestLinkPermissions } from '@stepler/contracts';
import request from 'supertest';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { GuestLinkTokens } from '../../src/guest-access/guest-link-tokens.js';

export const ORIGIN = 'http://localhost:3000';

export const CONTRIBUTE_ONLY: GuestLinkPermissions = {
  canUploadPhotos: true,
  canUploadVideos: true,
  canUploadDocuments: true,
  canSubmitText: true,
  canViewGallery: false,
  canDeleteOwn: true,
};

export const SHARED_GALLERY: GuestLinkPermissions = { ...CONTRIBUTE_ONLY, canViewGallery: true };

export interface SeededLink {
  id: string;
  token: string;
}

let sequence = 0;

/** Inserts a live link with the given permissions and returns its raw token. */
export async function addLink(
  prisma: PrismaClient,
  tokens: GuestLinkTokens,
  collectionId: string,
  permissions: GuestLinkPermissions = CONTRIBUTE_ONLY,
  isDefault = false,
): Promise<SeededLink> {
  const issued = tokens.generate();
  const row = await prisma.guestLink.create({
    data: {
      collectionId,
      isDefault,
      label: isDefault ? null : `Link ${++sequence}`,
      tokenHash: issued.tokenHash,
      tokenCiphertext: issued.tokenCiphertext,
      tokenKeyId: issued.tokenKeyId,
      ...permissions,
    },
  });
  return { id: row.id, token: issued.token };
}

/**
 * An owner (or the given one), an active collection and its live default link. Faster than the
 * API and independent of it; API-level setup is covered by the collection tests.
 */
export async function seedCollection(
  prisma: PrismaClient,
  tokens: GuestLinkTokens,
  options: { ownerId?: string; permissions?: GuestLinkPermissions; title?: string } = {},
): Promise<{ ownerId: string; collectionId: string; link: SeededLink }> {
  // A new owner gets the test plan (`signInAs`'s default); a given owner keeps what they have.
  let ownerId = options.ownerId;
  if (ownerId === undefined) {
    const owner = await prisma.user.create({
      data: { email: `owner${++sequence}@example.com`, trialEndsAt: freshTrialEnd() },
    });
    await grantTestPlan(prisma, owner.id);
    ownerId = owner.id;
  }
  const collection = await prisma.collection.create({
    data: { ownerId, title: options.title ?? 'Весілля', description: 'Опис' },
  });
  const link = await addLink(prisma, tokens, collection.id, options.permissions, true);
  // As the API creates it: with its published guest page.
  await setPublishedPage(prisma, collection.id);
  return { ownerId, collectionId: collection.id, link };
}

/** The `st_gs=…` pair from a response's Set-Cookie, ready for a `Cookie` header. */
export function guestCookieOf(setCookie: string[] | string | undefined): string {
  const all = Array.isArray(setCookie) ? setCookie : setCookie === undefined ? [] : [setCookie];
  const cookie = all.find((value) => value.startsWith('st_gs='));
  if (cookie === undefined) throw new Error('no st_gs cookie');
  return cookie.split(';')[0] ?? '';
}

/** Runs the session exchange; returns the guest cookie to send on later guest requests. */
export async function joinAsGuest(
  server: Server,
  collectionId: string,
  linkToken: string,
): Promise<string> {
  const res = await request(server)
    .post(`/api/v1/guest/collections/${collectionId}/session`)
    .set('Origin', ORIGIN)
    .send({ linkToken })
    .expect(200);
  return guestCookieOf(res.headers['set-cookie']);
}
