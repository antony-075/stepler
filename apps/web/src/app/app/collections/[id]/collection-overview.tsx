'use client';

import type { Collection } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Panel } from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { isApiError } from '@/api/client';
import {
  collectionKey,
  isCollectionNotFound,
  unarchiveCollection,
  useInvalidateCollections,
} from '@/api/collections';
import { BackLink } from '@/components/back-link';
import { errorMessageKey } from '@/errors/error-message';
import { CollectionNotFound } from '../collection-not-found';
import { useCollection } from '../use-collection';

/**
 * The collection's page (DESIGN-SYSTEM.md §6.6, artboard C-gallery). Before guest links (slice 2)
 * and content (slice 7) exist it shows only what is real: the title (32px from `xl`: a long
 * collection name at 44px would push the sheet off the first screen), status and date, the
 * description, the archive state with its one action, and the empty contact sheet waiting for
 * frame «#001». No Share or QR button yet: they would not work. Settings are one outline button
 * away in the header.
 */
export function CollectionOverview({ id }: { id: string }) {
  const t = useTranslations('collection');
  const tList = useTranslations('collections');
  const query = useCollection(id);

  if (query.isPending) return <OverviewSkeleton label={t('loading')} />;
  if (query.isError) {
    if (isCollectionNotFound(query.error)) return <CollectionNotFound />;
    return (
      <>
        <PageHeader
          size="compact"
          back={<BackLink href="/app">{t('back')}</BackLink>}
          title={t('pageTitle')}
        />
        <Alert
          variant="error"
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              {tList('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      </>
    );
  }
  return <Overview collection={query.data} />;
}

// The collection's name is the page's h1 at the admin scale, but capped at 32px from `xl`
// (DESIGN-SYSTEM.md §3.2: "название в коллекции 32").
const COLLECTION_TITLE = 'xl:[&_[data-slot=page-header-title]]:text-[2rem]';

function Overview({ collection }: { collection: Collection }) {
  const t = useTranslations('collection');
  const tList = useTranslations('collections');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = tList(`status.${collection.status}`);
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');
  const dated = archived ? tList('archivedOn', { date }) : tList('createdOn', { date });

  return (
    <>
      <div className="grid gap-4">
        <PageHeader
          size="compact"
          className={COLLECTION_TITLE}
          back={<BackLink href="/app">{t('back')}</BackLink>}
          title={collection.title}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge variant={archived ? 'neutral' : 'success'} title={status}>
                {status}
              </Badge>
              <span className="text-sm tabular-nums">{dated}</span>
            </span>
          }
          actions={
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href={`/app/collections/${collection.id}/settings`} className="no-underline">
                <Settings aria-hidden="true" />
                {t('settings')}
              </Link>
            </Button>
          }
        />
        {/* Below the header, not inside it: the actions stay level with the title. */}
        {collection.description !== null ? (
          <p className="max-w-[60ch] whitespace-pre-line [overflow-wrap:anywhere]">
            {collection.description}
          </p>
        ) : null}
      </div>
      {archived ? <ArchivedNotice id={collection.id} /> : null}
      <section aria-labelledby="collection-content" className="grid gap-3">
        <h2 id="collection-content" className="type-h3">
          {t('content')}
        </h2>
        <Panel variant="sheet">
          <EmptyState
            frameNumber={1}
            title={t('contentEmpty')}
            description={t('contentEmptyText')}
            headingLevel={3}
            className="py-12 sm:py-16"
          />
        </Panel>
      </section>
    </>
  );
}

/** Archived: guests can't open it. Unarchive is safe, so it needs no confirmation. */
function ArchivedNotice({ id }: { id: string }) {
  const t = useTranslations('collection');
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const { toast } = useToast();
  const unarchive = useMutation({
    mutationFn: () => unarchiveCollection(id),
    onSuccess: async (collection) => {
      queryClient.setQueryData(collectionKey(id), collection);
      toast({ variant: 'success', title: t('unarchived') });
      await invalidate();
    },
  });

  if (isApiError(unarchive.error, 'COLLECTION_LIMIT_REACHED')) {
    return (
      <Alert variant="warning" title={t('archivedTitle')}>
        {tRoot(errorMessageKey('COLLECTION_LIMIT_REACHED'))}
      </Alert>
    );
  }
  const failure = isApiError(unarchive.error) ? unarchive.error.code : null;
  return (
    <Alert
      variant={failure === null ? 'info' : 'error'}
      title={t('archivedTitle')}
      action={
        <Button
          variant="outline"
          aria-disabled={unarchive.isPending || undefined}
          onClick={() => {
            if (!unarchive.isPending) unarchive.mutate();
          }}
        >
          {t('unarchive')}
        </Button>
      }
    >
      {failure === null ? t('archivedText') : tRoot(errorMessageKey(failure))}
    </Alert>
  );
}

function OverviewSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="grid gap-8">
      <div className="grid gap-3">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-5 w-48" />
      </div>
      <Skeleton className="h-64 w-full rounded-sheet" />
    </div>
  );
}
