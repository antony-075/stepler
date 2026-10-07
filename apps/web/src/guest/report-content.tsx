'use client';

// «Поскаржитися» (slice 9, R1): the app side of `ReportDialog` (@stepler/ui): the copy, the
// request and its idempotency key. Design notes live with the dialog; here: one key per opened
// form (the caller keys this component by opening), kept across retries; empty fields are left
// out; the reporter's interface language goes with an address only (the API stores it only then).
import {
  type CreateReportRequest,
  type GuestContentItem,
  type Locale,
  REPORT_DESCRIPTION_MAX_CHARS,
  REPORT_REASONS,
} from '@stepler/contracts';
import { ReportDialog, type ReportDialogValues } from '@stepler/ui/components/report-dialog';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import { reportContent } from './api';
import { isPageEndingError } from './guest-state';

type Call = <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;

/** The form as the API takes it: trimmed, empty fields left out. */
export function toReportRequest(values: ReportDialogValues, locale: Locale): CreateReportRequest {
  const description = values.description.trim();
  const email = values.email.trim();
  return {
    reason: values.reason as CreateReportRequest['reason'],
    ...(description === '' ? {} : { description }),
    ...(email === '' ? {} : { email }),
    locale,
  };
}

/** Which message a failed report shows (`guest.report.errors.*`). */
export function reportErrorMessage(error: unknown): 'rateLimited' | 'gone' | 'failed' {
  if (isApiError(error, 'RATE_LIMITED')) return 'rateLimited';
  if (isApiError(error, 'NOT_FOUND') || isApiError(error, 'CONTENT_NOT_FOUND')) return 'gone';
  return 'failed';
}

export function GuestReport({
  call,
  item,
  open,
  onOpenChange,
}: {
  call: Call;
  item: GuestContentItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('guest.report');
  const locale = useLocale() as Locale;
  // One key per opening: the caller remounts this component for each opening.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const report = useMutation({
    mutationFn: (values: ReportDialogValues) =>
      call((collectionId) =>
        reportContent(collectionId, item.id, toReportRequest(values, locale), idempotencyKey),
      ),
  });
  // A link or collection state ends the whole page (`call` switches it); nothing to say here.
  const error =
    report.error === null || isPageEndingError(report.error)
      ? null
      : t(`errors.${reportErrorMessage(report.error)}`);

  return (
    <ReportDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      reasonsLegend={t('reasonsLegend')}
      reasons={REPORT_REASONS.map((value) => ({ value, label: t(`reasons.${value}`) }))}
      reasonRequiredLabel={t('reasonRequired')}
      descriptionLabel={t('descriptionLabel')}
      descriptionHint={t('descriptionHint')}
      descriptionTooLongLabel={t('descriptionTooLong', { max: REPORT_DESCRIPTION_MAX_CHARS })}
      emailLabel={t('emailLabel')}
      emailHint={t('emailHint')}
      emailInvalidLabel={t('emailInvalid')}
      submitLabel={t('submit')}
      submittingLabel={t('submitting')}
      cancelLabel={t('cancel')}
      sentTitle={t('sentTitle')}
      sentText={t('sentText')}
      closeLabel={t('close')}
      counterLabel={(count, max) => t('counter', { count, max })}
      state={report.isSuccess ? 'sent' : report.isPending ? 'submitting' : 'idle'}
      error={error}
      maxDescription={REPORT_DESCRIPTION_MAX_CHARS}
      onSubmit={(values) => {
        if (!report.isPending) report.mutate(values);
      }}
    />
  );
}
