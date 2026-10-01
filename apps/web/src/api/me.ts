import { meResponseSchema } from '@stepler/contracts';
import { apiRequest } from './client';

/** The signed-in admin (`GET /api/v1/me`). Its presence in the cache means "signed in". */
export const ME_QUERY_KEY = ['me'] as const;

export const fetchMe = () => apiRequest('/me', { schema: meResponseSchema });
