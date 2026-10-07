'use client';

// The parts the report and the appeal details share (slice 9 Task 11, extracted in 9b Task 7):
// a section card, a fact line, the frame as the evidence (sticky from `lg`), the collection and
// the owner. States in words and badges, never colour alone; a quarantined frame (slice 9b) says
// until when it is kept and why, and offers no original.
import { collectionDisplayStatus, type OperatorReportDetail } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { CollectionStatusBadge } from '@stepler/ui/components/collection-status-badge';
import { formatFrameNumber } from '@stepler/ui/components/empty-state';
import { ExternalLink, FileText } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useId } from 'react';
import { ContentKindIcon } from './content-kind-icon';
import { STATE_BADGE } from './report-labels';

type Content = NonNullable<OperatorReportDetail['content']>;
type Collection = OperatorReportDetail['collection'];
type Owner = OperatorReportDetail['owner'];

const NO_REASON = '';
const DANGER = 'danger';
const NEUTRAL = 'neutral';

export function Section({ title, children }: { title: string; children: ReactNode }) {
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
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** What a guest sees of the frame now. */
export function contentState(content: Content) {
  if (content.deleted) return 'DELETED';
  if (content.quarantined !== null) return 'QUARANTINED';
  return content.hidden === null ? 'VISIBLE' : 'HIDDEN';
}

export function ContentStage({
  content,
  actions,
}: {
  content: Content | null;
  actions?: ReactNode;
}) {
  const t = useTranslations('ops');
  const format = useFormatter();
  if (content === null) {
    return (
      <Section title={t('detail.content')}>
        <p className="text-muted-foreground">{t('detail.contentPurged')}</p>
      </Section>
    );
  }
  const state = contentState(content);
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
      {content.quarantined === null || content.deleted ? null : (
        <p className="text-[0.875rem]">
          {t('detail.quarantined', {
            reason: content.quarantined.reason,
            date: format.dateTime(new Date(content.quarantined.purgeAfter), {
              dateStyle: 'medium',
            }),
          })}
        </p>
      )}
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

export function CollectionSection({
  collection,
  actions,
}: {
  collection: Collection;
  actions?: ReactNode;
}) {
  const t = useTranslations('ops');
  return (
    <Section title={t('detail.collection')}>
      {collection === null ? (
        <p className="text-muted-foreground">{t('queue.collectionGone')}</p>
      ) : (
        <dl className="grid gap-2 text-[0.9375rem]">
          <Fact label={t('detail.title')}>{collection.title}</Fact>
          <Fact label={t('detail.status')}>
            {/* One truthful status (S1): «Заблоковано» replaces «Активна», never beside it. */}
            <CollectionStatusBadge
              status={collectionDisplayStatus(collection)}
              label={t(`collectionStatuses.${collectionDisplayStatus(collection)}`)}
            />
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

export function OwnerSection({ owner, actions }: { owner: Owner; actions?: ReactNode }) {
  const t = useTranslations('ops');
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
