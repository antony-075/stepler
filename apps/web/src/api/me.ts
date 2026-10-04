import { type LegalAcceptanceRequest, meResponseSchema } from '@stepler/contracts';
import { apiRequest } from './client';

/** The signed-in admin (`GET /api/v1/me`). Its presence in the cache means "signed in". */
export const ME_QUERY_KEY = ['me'] as const;

export const fetchMe = () => apiRequest('/me', { schema: meResponseSchema });

/** Records the fallback page's acceptance (`POST /api/v1/me/legal-acceptances`); returns `me`. */
export const acceptLegal = (body: LegalAcceptanceRequest) =>
  apiRequest('/me/legal-acceptances', { method: 'POST', body, schema: meResponseSchema });
