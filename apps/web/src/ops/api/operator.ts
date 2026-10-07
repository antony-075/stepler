import {
  type AppealStatus,
  type OperatorAppealDetail,
  operatorAppealDetailSchema,
  type OperatorAppealPage,
  operatorAppealPageSchema,
  type OperatorReportDetail,
  operatorReportDetailSchema,
  type OperatorReportPage,
  operatorReportPageSchema,
  type ReportStatus,
  type ResolveAppealRequest,
  type ResolveReportRequest,
} from '@stepler/contracts';
import { opsRequest } from './client';

/** Query keys of the console; every action invalidates `all`. */
export const opsKeys = {
  all: ['ops'] as const,
  reports: (status: ReportStatus) => ['ops', 'reports', status] as const,
  report: (id: string) => ['ops', 'report', id] as const,
  appeals: (status: AppealStatus) => ['ops', 'appeals', status] as const,
  appeal: (id: string) => ['ops', 'appeal', id] as const,
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

/** The admins' appeals (slice 9b), one status at a time, newest first. */
export function fetchAppeals(
  query: { status: AppealStatus; cursor?: string | undefined },
  signal?: AbortSignal,
): Promise<OperatorAppealPage> {
  const params = new URLSearchParams({ status: query.status, limit: '50' });
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  return opsRequest(`/operator/appeals?${params.toString()}`, {
    schema: operatorAppealPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export const fetchAppeal = (id: string, signal?: AbortSignal): Promise<OperatorAppealDetail> =>
  opsRequest(`/operator/appeals/${id}`, {
    schema: operatorAppealDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });

/** «Задовольнити» reverses the measure; «Відхилити» keeps it (a note is required). */
export const resolveAppeal = (id: string, body: ResolveAppealRequest) =>
  opsRequest(`/operator/appeals/${id}`, {
    method: 'PATCH',
    body,
    schema: operatorAppealDetailSchema,
  });

const action = (path: `/operator/${string}`) => (reason: string) =>
  opsRequest(path, { method: 'POST', body: { reason } });

export const hideContent = (id: string, reason: string) =>
  action(`/operator/content/${id}/hide`)(reason);
export const unhideContent = (id: string, reason: string) =>
  action(`/operator/content/${id}/unhide`)(reason);
/** «Видалити (карантин 90 днів)» (slice 9b): restorable until the purge date. */
export const quarantineContent = (id: string, reason: string) =>
  action(`/operator/content/${id}/quarantine`)(reason);
export const restoreContent = (id: string, reason: string) =>
  action(`/operator/content/${id}/restore`)(reason);
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
