'use client';

// Design pass (slice 9b, Task 7; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design): one admin appeal, the report detail's twin. Decisions:
// - two columns from `lg`: the frame (or, for a collection appeal, the collection card) on the
//   left as the evidence; the right column in the order of the decision: the appeal (the admin's
//   text, when, its status and any decision), the measure as it stands now and why, earlier
//   appeals on the same target, the guest reports on the frame (links), the collection, the owner;
// - the two decisions sit under the appeal: «Задовольнити» (reverses the measure; the note is
//   optional) and «Відхилити» (the measure stays; the note is required and the admin reads it);
//   neither is red: deciding an appeal destroys nothing;
// - a decided appeal shows its decision instead of the buttons; a missing one is the empty state.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OperatorAppealDetail } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { ChevronLeft } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { type AppealAction, availableAppealActions } from './appeal-actions';
import { APPEAL_STATUS_BADGE, MEASURE_BADGE } from './appeal-labels';
import { isOpsApiError } from './api/client';
import { fetchAppeal, opsKeys, resolveAppeal } from './api/operator';
import { CollectionSection, ContentStage, Fact, OwnerSection, Section } from './content-stage';
import { ReasonDialog } from './reason-dialog';

type Detail = OperatorAppealDetail;
type Appeal = Detail['appeal'];

const PRIMARY = 'default';
const REPORT_BADGE = { OPEN: 'info', ACTIONED: 'neutral', DISMISSED: 'neutral' } as const;
const OUTLINE = 'outline';

export function AppealDetail({ id }: { id: string }) {
  const t = useTranslations('ops');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState<AppealAction | null>(null);
  const query = useQuery({
    queryKey: opsKeys.appeal(id),
    queryFn: ({ signal }) => fetchAppeal(id, signal),
    retry: (count, error) => !isOpsApiError(error, 'NOT_FOUND') && count < 2,
  });

  const back = (
    <Link
      href="/ops/appeals"
      className="inline-flex min-h-11 items-center gap-1 text-[0.875rem] text-link hover:underline md:min-h-9"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      {t('appeals.back')}
    </Link>
  );

  if (query.isPending) {
    return (
      <div role="status" aria-label={t('queue.loading')} className="grid gap-4">
        {back}
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <Skeleton className="aspect-[4/3] rounded-sheet" />
          <Skeleton className="h-80 rounded-sheet" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="grid gap-4">
        {back}
        {isOpsApiError(query.error, 'NOT_FOUND') ? (
          <div className="rounded-sheet border bg-card">
            <EmptyState title={t('appeals.notFound')} />
          </div>
        ) : (
          <Alert
            variant="error"
            title={t('appeals.detailError')}
            action={
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('retry')}
              </Button>
            }
          />
        )}
      </div>
    );
  }

  const detail = query.data;
  const actions = availableAppealActions(detail);

  const confirm = async (note: string) => {
    const action = pending;
    if (action === null) return;
    try {
      await resolveAppeal(detail.appeal.id, {
        status: action === 'uphold' ? 'UPHELD' : 'REJECTED',
        ...(note === '' ? {} : { note }),
      });
    } catch (error) {
      throw new Error(
        isOpsApiError(error, 'APPEAL_RESOLVED')
          ? t('appeals.resolvedElsewhere')
          : isOpsApiError(error, 'NOT_FOUND')
            ? t('actions.gone')
            : t('actions.failed'),
      );
    }
    toast({ variant: 'success', title: t(`actions.${action}.done`) });
    await queryClient.invalidateQueries({ queryKey: opsKeys.all });
  };

  const heading = t(
    detail.appeal.targetType === 'CONTENT' ? 'appeals.headingContent' : 'appeals.headingCollection',
  );
  const evidence =
    detail.appeal.targetType === 'CONTENT' ? (
      <ContentStage content={detail.content} />
    ) : (
      <CollectionSection collection={detail.collection} />
    );

  return (
    <div className="grid gap-4">
      {back}
      <h1 className="type-h1">{heading}</h1>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {evidence}
        <div className="grid gap-4">
          <AppealSection
            appeal={detail.appeal}
            actions={
              actions.length === 0 ? null : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {actions.map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      variant={action === 'uphold' ? PRIMARY : OUTLINE}
                      onClick={() => setPending(action)}
                    >
                      {t(`actions.${action}.button`)}
                    </Button>
                  ))}
                </div>
              )
            }
          />
          <MeasureSection detail={detail} />
          <PreviousAppeals appeals={detail.previousAppeals} />
          <RelatedReports detail={detail} />
          {detail.appeal.targetType === 'CONTENT' ? (
            <CollectionSection collection={detail.collection} />
          ) : null}
          <OwnerSection owner={detail.owner} />
        </div>
      </div>
      <ReasonDialog
        action={pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={confirm}
      />
    </div>
  );
}

function useDateTime() {
  const format = useFormatter();
  return (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
}

function AppealSection({ appeal, actions }: { appeal: Appeal; actions: React.ReactNode }) {
  const t = useTranslations('ops');
  const when = useDateTime();
  return (
    <Section title={t('appeals.appeal')}>
      <blockquote className="max-h-[40vh] overflow-y-auto rounded-frame bg-muted p-4 whitespace-pre-wrap [overflow-wrap:anywhere]">
        {appeal.text}
      </blockquote>
      <dl className="grid gap-2 text-[0.9375rem]">
        <Fact label={t('detail.received')}>
          <time dateTime={appeal.createdAt} className="tabular-nums">
            {when(appeal.createdAt)}
          </time>
        </Fact>
        <Fact label={t('detail.status')}>
          <Badge variant={APPEAL_STATUS_BADGE[appeal.status]}>
            {t(`appeals.statuses.${appeal.status}`)}
          </Badge>
        </Fact>
        {appeal.resolution === null ? null : (
          <Fact label={t('detail.decision')}>
            {appeal.resolution.note ?? (
              <span className="text-muted-foreground">{t('appeals.noNote')}</span>
            )}
          </Fact>
        )}
      </dl>
      {actions}
    </Section>
  );
}

function MeasureSection({ detail }: { detail: Detail }) {
  const t = useTranslations('ops');
  const format = useFormatter();
  const { measure, content, collection } = detail;
  const why =
    measure === 'HIDDEN'
      ? (content?.hidden?.reason ?? null)
      : measure === 'QUARANTINED'
        ? (content?.quarantined?.reason ?? null)
        : measure === 'BLOCKED'
          ? (collection?.blocked?.reason ?? null)
          : null;
  const purgeAfter = measure === 'QUARANTINED' ? (content?.quarantined?.purgeAfter ?? null) : null;
  return (
    <Section title={t('appeals.measure')}>
      <dl className="grid gap-2 text-[0.9375rem]">
        <Fact label={t('appeals.measureNow')}>
          <Badge variant={MEASURE_BADGE[measure]}>{t(`appeals.measures.${measure}`)}</Badge>
        </Fact>
        {why === null ? null : <Fact label={t('detail.reason')}>{why}</Fact>}
        {purgeAfter === null ? null : (
          <Fact label={t('appeals.purgeAfter')}>
            {format.dateTime(new Date(purgeAfter), { dateStyle: 'medium' })}
          </Fact>
        )}
      </dl>
      {measure === 'NONE' ? (
        <p className="text-[0.875rem] text-muted-foreground">{t('appeals.measureGone')}</p>
      ) : null}
    </Section>
  );
}

function PreviousAppeals({ appeals }: { appeals: Appeal[] }) {
  const t = useTranslations('ops');
  const when = useDateTime();
  if (appeals.length === 0) return null;
  return (
    <Section title={t('appeals.previous', { count: appeals.length })}>
      <ul className="grid divide-y">
        {appeals.map((appeal) => (
          <li key={appeal.id} className="grid gap-1 py-2 first:pt-0 last:pb-0">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/ops/appeals/${appeal.id}`}
                className="text-[0.8125rem] text-link tabular-nums hover:underline"
              >
                {when(appeal.createdAt)}
              </Link>
              <Badge variant={APPEAL_STATUS_BADGE[appeal.status]}>
                {t(`appeals.statuses.${appeal.status}`)}
              </Badge>
            </span>
            <span className="line-clamp-3 text-[0.875rem] text-foreground-soft [overflow-wrap:anywhere]">
              {appeal.text}
            </span>
            {appeal.resolution?.note ? (
              <span className="text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">
                {t('appeals.previousNote', { note: appeal.resolution.note })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RelatedReports({ detail }: { detail: Detail }) {
  const t = useTranslations('ops');
  const when = useDateTime();
  if (detail.relatedReports.length === 0) return null;
  return (
    <Section title={t('appeals.reports', { count: detail.relatedReports.length })}>
      <ul className="grid divide-y">
        {detail.relatedReports.map((report) => (
          <li
            key={report.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
          >
            <Link
              href={`/ops/reports/${report.id}`}
              className="font-medium text-link hover:underline"
            >
              {t(`reasons.${report.reason}`)}
            </Link>
            <span className="flex items-center gap-2">
              <time
                dateTime={report.createdAt}
                className="text-[0.8125rem] text-muted-foreground tabular-nums"
              >
                {when(report.createdAt)}
              </time>
              <Badge variant={REPORT_BADGE[report.status]}>{t(`statuses.${report.status}`)}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
