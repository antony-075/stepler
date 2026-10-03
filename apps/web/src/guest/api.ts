import {
  type CreateUploadRequest,
  type GuestContentItem,
  type GuestContentListQuery,
  type GuestContentPage,
  type GuestContext,
  guestContentItemSchema,
  guestContentPageSchema,
  guestContextSchema,
  type ResolveGuestLinkResponse,
  resolveGuestLinkResponseSchema,
  type UploadPartsResponse,
  uploadPartsResponseSchema,
  type UploadSessionResponse,
  uploadSessionResponseSchema,
} from '@stepler/contracts';
import { apiRequest } from '@/api/client';

// Guest calls (ADR 0007, [C3]). Every call after `resolveLink` is under
// `/guest/collections/{collectionId}`, the path the `st_gs` cookie is scoped to, so the browser
// sends the session cookie with them and nowhere else. Same-origin POSTs pass the CSRF check.

const base = (collectionId: string) => `/guest/collections/${encodeURIComponent(collectionId)}`;

/** The link's state and its collection id. The token goes in the body, never in a logged URL. */
export const resolveLink = (linkToken: string): Promise<ResolveGuestLinkResponse> =>
  apiRequest('/guest/links/resolve', {
    method: 'POST',
    body: { linkToken },
    schema: resolveGuestLinkResponseSchema,
  });

/** Trades the token for the collection's session cookie, or re-binds the existing one. */
export const exchangeSession = (collectionId: string, linkToken: string): Promise<GuestContext> =>
  apiRequest(`${base(collectionId)}/session`, {
    method: 'POST',
    body: { linkToken },
    schema: guestContextSchema,
  });

export const getContext = (collectionId: string): Promise<GuestContext> =>
  apiRequest(`${base(collectionId)}/context`, { schema: guestContextSchema });

/** `null` skips the name prompt (or clears the name); either way it is answered. */
export const updateName = (collectionId: string, name: string | null): Promise<GuestContext> =>
  apiRequest(`${base(collectionId)}/session`, {
    method: 'PATCH',
    body: { name },
    schema: guestContextSchema,
  });

/** One `idempotencyKey` per draft, kept across retries, so a retry never adds a second wish. */
export const submitText = (
  collectionId: string,
  body: string,
  idempotencyKey: string,
): Promise<GuestContentItem> =>
  apiRequest(`${base(collectionId)}/texts`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { body },
    schema: guestContentItemSchema,
  });

export const listGuestContent = (
  collectionId: string,
  query: Pick<GuestContentListQuery, 'scope'> & { cursor?: string },
): Promise<GuestContentPage> => {
  const params = new URLSearchParams({ scope: query.scope });
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  return apiRequest(`${base(collectionId)}/content?${params.toString()}`, {
    schema: guestContentPageSchema,
  });
};

// Direct uploads (spec §10, ADR 0008). The API only authorizes and verifies; bytes go from the
// browser straight to storage with the presigned URLs these calls return. `signal` cancels the
// call itself (a cancelled file stops at once).

/** Starts (or, for the same `clientUploadId`, resumes) an upload session. */
export const initiateUpload = (
  collectionId: string,
  body: CreateUploadRequest,
  signal?: AbortSignal,
): Promise<UploadSessionResponse> =>
  apiRequest(`${base(collectionId)}/uploads`, {
    method: 'POST',
    body,
    schema: uploadSessionResponseSchema,
    signal,
  });

/** Presigned URLs for some parts of a multipart upload (each signs its exact length). */
export const presignParts = (
  collectionId: string,
  uploadId: string,
  partNumbers: number[],
  signal?: AbortSignal,
): Promise<UploadPartsResponse> =>
  apiRequest(`${base(collectionId)}/uploads/${encodeURIComponent(uploadId)}/parts`, {
    method: 'POST',
    body: { partNumbers },
    schema: uploadPartsResponseSchema,
    signal,
  });

/** The server checks the stored object and records the frame; a repeat returns the same one. */
export const completeUpload = (
  collectionId: string,
  uploadId: string,
  signal?: AbortSignal,
): Promise<GuestContentItem> =>
  apiRequest(`${base(collectionId)}/uploads/${encodeURIComponent(uploadId)}/complete`, {
    method: 'POST',
    schema: guestContentItemSchema,
    signal,
  });

/** Gives the upload up; the server discards whatever bytes arrived. Idempotent. */
export const cancelUpload = (collectionId: string, uploadId: string): Promise<void> =>
  apiRequest(`${base(collectionId)}/uploads/${encodeURIComponent(uploadId)}`, {
    method: 'DELETE',
  });

/** The upload calls as one object, so the transport can be tested against a fake. */
export interface GuestUploadApi {
  initiateUpload: typeof initiateUpload;
  presignParts: typeof presignParts;
  completeUpload: typeof completeUpload;
  cancelUpload: typeof cancelUpload;
}

export const guestUploadApi: GuestUploadApi = {
  initiateUpload,
  presignParts,
  completeUpload,
  cancelUpload,
};
