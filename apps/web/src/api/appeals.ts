import { adminAppealListSchema, adminAppealSchema } from '@stepler/contracts';
import { apiRequest } from './client';
import { collectionKey } from './collections';

// The collection admin's appeals on the operator's measures (slice 9b). The status comes back
// in-app only: on the frame's detail (`appeal`) and in this list (the blocked banner).

export const appealsKey = (collectionId: string) =>
  [...collectionKey(collectionId), 'appeals'] as const;

/** The collection's appeals (its frames and itself), newest first. */
export const listAppeals = (collectionId: string) =>
  apiRequest(`/collections/${encodeURIComponent(collectionId)}/appeals`, {
    schema: adminAppealListSchema,
  });

/** A frame the operator hid or deleted; `409 APPEAL_OPEN` / `APPEAL_NOT_APPLICABLE` otherwise. */
export const createContentAppeal = (collectionId: string, contentId: string, text: string) =>
  apiRequest(
    `/collections/${encodeURIComponent(collectionId)}/content/${encodeURIComponent(contentId)}/appeals`,
    { method: 'POST', body: { text }, schema: adminAppealSchema },
  );

/** The block of the collection itself. */
export const createCollectionAppeal = (collectionId: string, text: string) =>
  apiRequest(`/collections/${encodeURIComponent(collectionId)}/appeals`, {
    method: 'POST',
    body: { text },
    schema: adminAppealSchema,
  });
