import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page, request } from '@playwright/test';
import { createCollectionViaApi } from './collections.js';
import { guestLinks } from './guest.js';

export interface SeededReport {
  collectionId: string;
  title: string;
  linkPath: string;
  contentId: string;
  frameNo: number;
  reportId: string;
}

/** A guest of `linkPath`'s collection, through the web proxy, as another phone would. */
export async function guestApi(
  baseURL: string,
  collectionId: string,
  linkPath: string,
): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  const linkToken = linkPath.split('/').pop() ?? '';
  const res = await api.post(`/api/v1/guest/collections/${collectionId}/session`, {
    data: { linkToken },
  });
  expect(res.status()).toBe(200);
  return api;
}

/** As the signed-in admin of `admin`: a collection whose main link shares the gallery. */
export async function sharedCollection(
  admin: Page,
  title = `Скарги ${randomUUID().slice(0, 8)}`,
): Promise<{ collectionId: string; title: string; linkPath: string }> {
  const baseURL = new URL(admin.url()).origin;
  const { id: collectionId } = await createCollectionViaApi(admin, title);
  const main = (await guestLinks(admin, collectionId)).find((link) => link.isDefault);
  const patched = await admin.request.patch(`/api/v1/guest-links/${main!.id}`, {
    data: {
      permissions: {
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: true,
        canDeleteOwn: true,
      },
    },
    headers: { origin: baseURL },
  });
  expect(patched.status()).toBe(200);
  return { collectionId, title, linkPath: new URL(main!.url!).pathname };
}

/**
 * As the signed-in admin of `admin`: a shared-gallery collection, a text by guest A, and guest
 * B's report on it (slice 9). Everything through the public API.
 */
export async function seedReport(
  admin: Page,
  options: { title?: string; reason?: string; email?: string } = {},
): Promise<SeededReport> {
  const baseURL = new URL(admin.url()).origin;
  const { collectionId, title, linkPath } = await sharedCollection(admin, options.title);
  const a = await guestApi(baseURL, collectionId, linkPath);
  const text = await a.post(`/api/v1/guest/collections/${collectionId}/texts`, {
    data: { body: 'Привітання від гостя' },
    headers: { 'idempotency-key': randomUUID() },
  });
  expect(text.status()).toBe(201);
  const item = (await text.json()) as { id: string; frameNo: number };
  await a.dispose();

  const b = await guestApi(baseURL, collectionId, linkPath);
  const report = await b.post(
    `/api/v1/guest/collections/${collectionId}/content/${item.id}/reports`,
    {
      data: {
        reason: options.reason ?? 'PRIVACY',
        locale: 'uk',
        ...(options.email === undefined ? {} : { email: options.email }),
      },
      headers: { 'idempotency-key': randomUUID() },
    },
  );
  expect(report.status()).toBe(201);
  const { id: reportId } = (await report.json()) as { id: string };
  await b.dispose();
  return {
    collectionId,
    title,
    linkPath,
    contentId: item.id,
    frameNo: item.frameNo,
    reportId,
  };
}
