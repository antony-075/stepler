import {
  type OperatorReportDetail,
  operatorReportDetailSchema,
  type OperatorReportPage,
  operatorReportPageSchema,
  type ReportStatus,
  type ResolveReportRequest,
} from '@stepler/contracts';
import { opsRequest } from './client';

/** Query keys of the console; every action invalidates `all`. */
export const opsKeys = {
  all: ['ops'] as const,
  reports: (status: ReportStatus) => ['ops', 'reports', status] as const,
  report: (id: string) => ['ops', 'report', id] as const,
};

export function fetchReports(
  query: { status: ReportStatus; cursor?: string | undefined },
  signal?: AbortSignal,
): Promise<OperatorReportPage> {
  const params = new URLSearchParams({ status: query.status, limit: '50' });
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  return opsRequest(`/operator/reports?${params.toString()}`, {
    schema: operatorReportPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export const fetchReport = (id: string, signal?: AbortSignal): Promise<OperatorReportDetail> =>
  opsRequest(`/operator/reports/${id}`, {
    schema: operatorReportDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });

export const resolveReport = (id: string, body: ResolveReportRequest) =>
  opsRequest(`/operator/reports/${id}`, {
    method: 'PATCH',
    body,
    schema: operatorReportDetailSchema,
  });

const action = (path: `/operator/${string}`) => (reason: string) =>
  opsRequest(path, { method: 'POST', body: { reason } });

export const hideContent = (id: string, reason: string) =>
  action(`/operator/content/${id}/hide`)(reason);
export const unhideContent = (id: string, reason: string) =>
  action(`/operator/content/${id}/unhide`)(reason);
export const deleteContent = (id: string, reason: string) =>
  action(`/operator/content/${id}/delete`)(reason);
export const blockCollection = (id: string, reason: string) =>
  action(`/operator/collections/${id}/block`)(reason);
export const unblockCollection = (id: string, reason: string) =>
  action(`/operator/collections/${id}/unblock`)(reason);
export const blockAccount = (userId: string, reason: string) =>
  action(`/operator/users/${userId}/block`)(reason);
export const unblockAccount = (userId: string, reason: string) =>
  action(`/operator/users/${userId}/unblock`)(reason);

/** Signs the service account out (the shared auth route), like the user app's «Вийти». */
export async function signOut(): Promise<void> {
  const res = await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' });
  if (!res.ok && res.status !== 401) throw new Error('logout failed');
}
