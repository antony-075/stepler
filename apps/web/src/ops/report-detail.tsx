'use client';

// Design pass (slice 9, Task 11; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design): one report, everything needed to decide it and nothing more (R5).
// Decisions:
// - two columns from `lg`: the frame on the left as the evidence (sticky, so it stays in view
//   while the operator reads and acts), the facts on the right; one column below `lg`, the frame
//   first;
// - the right column is four plain sections in the order of the decision: the report, other
//   reports on the frame, the collection, the owner; each section carries its own actions, so an
//   action sits next to what it changes (no separate toolbar to map back);
// - every action opens the reason dialog; destructive ones (delete, block) are the only red;
// - states in words and badges, never colour alone: «Видимий / Прихований / Видалений», «Заблоковано:
//   {причина}», «Адміністратор відхилив», «Заявник залишив контакт / Без контакту»;
// - a missing report is the page's empty state with a way back; loading is the layout's skeleton.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OperatorReportDetail } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { EmptyState, formatFrameNumber } from '@stepler/ui/components/empty-state';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { ChevronLeft, ExternalLink, FileText } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { type ReactNode, useId, useState } from 'react';
import { ACTION_GROUPS, availableActions, DESTRUCTIVE, type OpsAction } from './actions';
import { isOpsApiError } from './api/client';
import {
  blockAccount,
  blockCollection,
  deleteContent,
  fetchReport,
  hideContent,
  opsKeys,
  resolveReport,
  unblockAccount,
  unblockCollection,
  unhideContent,
} from './api/operator';
import { ContentKindIcon } from './content-kind-icon';
import { ReasonDialog } from './reason-dialog';
import { STATE_BADGE } from './report-labels';

type Detail = OperatorReportDetail;

const DESTRUCTIVE_BUTTON = 'destructive';
const OUTLINE_BUTTON = 'outline';
const NO_REASON = '';
const DANGER = 'danger';
const NEUTRAL = 'neutral';
const statusBadge = (status: string) => (status === 'OPEN' ? 'info' : 'neutral');

/** Runs `action` on what the detail names; every call is scoped server-side ([P5]). */
async function run(action: OpsAction, detail: Detail, reason: string): Promise<void> {
  const contentId = detail.content?.id ?? '';
  const collectionId = detail.collection?.id ?? '';
  const ownerId = detail.owner?.id ?? '';
  switch (action) {
    case 'hide':
      return hideContent(contentId, reason);
    case 'unhide':
      return unhideContent(contentId, reason);
    case 'delete':
      return deleteContent(contentId, reason);
    case 'dismiss':
      await resolveReport(detail.report.id, { status: 'DISMISSED', note: reason });
      return;
    case 'action':
      await resolveReport(detail.report.id, { status: 'ACTIONED', note: reason });
      return;
    case 'blockCollection':
      return blockCollection(collectionId, reason);
    case 'unblockCollection':
      return unblockCollection(collectionId, reason);
    case 'blockAccount':
      return blockAccount(ownerId, reason);
    case 'unblockAccount':
      return unblockAccount(ownerId, reason);
  }
}

export function ReportDetail({ id }: { id: string }) {
  const t = useTranslations('ops');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState<OpsAction | null>(null);
  const query = useQuery({
    queryKey: opsKeys.report(id),
    queryFn: ({ signal }) => fetchReport(id, signal),
    retry: (count, error) => !isOpsApiError(error, 'NOT_FOUND') && count < 2,
  });

  const back = (
    <Link
      href="/ops/reports"
      className="inline-flex min-h-11 items-center gap-1 text-[0.875rem] text-link hover:underline md:min-h-9"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      {t('detail.back')}
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
            <EmptyState title={t('detail.notFound')} />
          </div>
        ) : (
          <Alert
            variant="error"
            title={t('detail.error')}
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
  const actions = new Set(availableActions(detail));
  const buttons = (group: readonly OpsAction[]) => {
    const shown = group.filter((action) => actions.has(action));
    return shown.length === 0 ? null : (
      <div className="flex flex-wrap gap-2 pt-1">
        {shown.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={DESTRUCTIVE.has(action) ? DESTRUCTIVE_BUTTON : OUTLINE_BUTTON}
            onClick={() => setPending(action)}
          >
            {t(`actions.${action}.button`)}
          </Button>
        ))}
      </div>
    );
  };

  const confirm = async (reason: string) => {
    const action = pending;
    if (action === null) return;
    try {
      await run(action, detail, reason);
    } catch (error) {
      throw new Error(
        isOpsApiError(error, 'REPORT_RESOLVED')
          ? t('actions.resolvedElsewhere')
          : isOpsApiError(error, 'NOT_FOUND')
            ? t('actions.gone')
            : t('actions.failed'),
      );
    }
    toast({ variant: 'success', title: t(`actions.${action}.done`) });
    await queryClient.invalidateQueries({ queryKey: opsKeys.all });
  };

  return (
    <div className="grid gap-4">
      {back}
      <h1 className="type-h1">{t(`reasons.${detail.report.reason}`)}</h1>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <ContentStage detail={detail} actions={buttons(ACTION_GROUPS.content)} />
        <div className="grid gap-4">
          <ReportSection detail={detail} actions={buttons(ACTION_GROUPS.report)} />
          <OtherReports detail={detail} />
          <CollectionSection detail={detail} actions={buttons(ACTION_GROUPS.collection)} />
          <OwnerSection detail={detail} actions={buttons(ACTION_GROUPS.account)} />
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-2 rounded-sheet border bg-card p-4 md:p-5"
    >
      <h2 id={headingId} className="type-h3">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A label and its value, as one line of a section. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function ContentStage({ detail, actions }: { detail: Detail; actions: ReactNode }) {
  const t = useTranslations('ops');
  const format = useFormatter();
  const content = detail.content;
  if (content === null) {
    return (
      <Section title={t('detail.content')}>
        <p className="text-muted-foreground">{t('detail.contentPurged')}</p>
      </Section>
    );
  }
  const state = content.deleted ? 'DELETED' : content.hidden === null ? 'VISIBLE' : 'HIDDEN';
  const image =
    content.media?.previewUrl ?? content.media?.posterUrl ?? content.media?.thumbnailUrl;
  return (
    <section
      aria-labelledby="ops-content"
      className="grid gap-3 rounded-sheet border bg-card p-4 md:p-5 lg:sticky lg:top-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ops-content" className="type-h3 flex items-center gap-2">
          <ContentKindIcon kind={content.kind} />
          <span>
            {t(`kinds.${content.kind}`)}{' '}
            <span className="font-mono">{formatFrameNumber(content.frameNo)}</span>
          </span>
        </h2>
        <Badge variant={STATE_BADGE[state]}>{t(`states.${state}`)}</Badge>
      </div>
      {content.deleted ? (
        <p className="rounded-frame bg-muted p-4 text-muted-foreground">
          {t('detail.contentDeleted')}
        </p>
      ) : content.kind === 'TEXT' ? (
        <blockquote className="max-h-[60vh] overflow-y-auto rounded-frame bg-muted p-4 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {content.text}
        </blockquote>
      ) : image ? (
        // A presigned link of a reported frame: shown as is, never optimised or cached by Next.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={t('detail.frameAlt', { frame: formatFrameNumber(content.frameNo) })}
          className="max-h-[60vh] w-full rounded-frame bg-muted object-contain"
        />
      ) : (
        <p className="flex items-center gap-2 rounded-frame bg-muted p-4 text-muted-foreground">
          <FileText aria-hidden="true" className="size-5" />
          {t('detail.noPreview')}
        </p>
      )}
      {!content.deleted && content.originalUrl !== null ? (
        <a
          href={content.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-[0.875rem] text-link hover:underline md:min-h-9"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          {t('detail.openOriginal')}
        </a>
      ) : null}
      {content.hidden === null || content.deleted ? null : (
        <p className="text-[0.875rem]">
          {content.hidden.by === 'OPERATOR'
            ? t('detail.hiddenByOperator', { reason: content.hidden.reason ?? NO_REASON })
            : t('detail.hiddenByAdmin')}
        </p>
      )}
      <p className="text-[0.8125rem] text-muted-foreground">
        {t('detail.addedAt', {
          at: format.dateTime(new Date(content.createdAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        })}
      </p>
      {actions}
    </section>
  );
}

function ReportSection({ detail, actions }: { detail: Detail; actions: ReactNode }) {
  const t = useTranslations('ops');
  const format = useFormatter();
  const { report } = detail;
  return (
    <Section title={t('detail.report')}>
      <dl className="grid gap-2 text-[0.9375rem]">
        <Fact label={t('detail.reason')}>{t(`reasons.${report.reason}`)}</Fact>
        <Fact label={t('detail.description')}>
          {report.description ?? (
            <span className="text-muted-foreground">{t('detail.noDescription')}</span>
          )}
        </Fact>
        <Fact label={t('detail.received')}>
          <time dateTime={report.createdAt} className="font-mono text-[0.875rem]">
            {format.dateTime(new Date(report.createdAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </Fact>
        <Fact label={t('detail.contact')}>
          {report.hasReporterContact ? t('detail.hasContact') : t('detail.noContact')}
        </Fact>
        <Fact label={t('detail.status')}>
          <span className="flex flex-wrap gap-1.5">
            <Badge variant={statusBadge(report.status)}>{t(`statuses.${report.status}`)}</Badge>
            {report.adminDismissedAt === null ? null : (
              <Badge variant="neutral">{t('detail.adminDismissed')}</Badge>
            )}
          </span>
        </Fact>
        {report.resolution === null ? null : (
          <Fact label={t('detail.decision')}>{report.resolution.note}</Fact>
        )}
      </dl>
      {actions}
    </Section>
  );
}

function OtherReports({ detail }: { detail: Detail }) {
  const t = useTranslations('ops');
  const format = useFormatter();
  if (detail.otherReports.length === 0) return null;
  return (
    <Section title={t('detail.otherReports', { count: detail.otherReports.length })}>
      <ul className="grid divide-y">
        {detail.otherReports.map((other) => (
          <li key={other.id} className="grid gap-1 py-2 first:pt-0 last:pb-0">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/ops/reports/${other.id}`}
                className="font-medium text-link hover:underline"
              >
                {t(`reasons.${other.reason}`)}
              </Link>
              <span className="flex gap-1.5">
                <Badge variant={statusBadge(other.status)}>{t(`statuses.${other.status}`)}</Badge>
                {other.adminDismissedAt === null ? null : (
                  <Badge variant="neutral">{t('detail.adminDismissed')}</Badge>
                )}
              </span>
            </span>
            {other.description === null ? null : (
              <span className="text-[0.875rem] text-foreground-soft [overflow-wrap:anywhere]">
                {other.description}
              </span>
            )}
            <time
              dateTime={other.createdAt}
              className="font-mono text-[0.8125rem] text-muted-foreground"
            >
              {format.dateTime(new Date(other.createdAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CollectionSection({ detail, actions }: { detail: Detail; actions: ReactNode }) {
  const t = useTranslations('ops');
  const { collection } = detail;
  return (
    <Section title={t('detail.collection')}>
      {collection === null ? (
        <p className="text-muted-foreground">{t('queue.collectionGone')}</p>
      ) : (
        <dl className="grid gap-2 text-[0.9375rem]">
          <Fact label={t('detail.title')}>{collection.title}</Fact>
          <Fact label={t('detail.status')}>
            <span className="flex flex-wrap gap-1.5">
              <Badge variant="neutral">{t(`collectionStatuses.${collection.status}`)}</Badge>
              {collection.blocked === null ? null : (
                <Badge variant="danger">{t('detail.blocked')}</Badge>
              )}
            </span>
          </Fact>
          {collection.blocked === null ? null : (
            <Fact label={t('detail.blockReason')}>{collection.blocked.reason}</Fact>
          )}
        </dl>
      )}
      {actions}
    </Section>
  );
}

function OwnerSection({ detail, actions }: { detail: Detail; actions: ReactNode }) {
  const t = useTranslations('ops');
  const { owner } = detail;
  if (owner === null) return null;
  return (
    <Section title={t('detail.owner')}>
      <dl className="grid gap-2 text-[0.9375rem]">
        <Fact label={t('detail.email')}>{owner.email}</Fact>
        <Fact label={t('detail.status')}>
          <Badge variant={owner.status === 'BLOCKED' ? DANGER : NEUTRAL}>
            {t(`ownerStatuses.${owner.status}`)}
          </Badge>
        </Fact>
        {owner.blockedReason === null ? null : (
          <Fact label={t('detail.blockReason')}>{owner.blockedReason}</Fact>
        )}
      </dl>
      {actions}
    </Section>
  );
}
