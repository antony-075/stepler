'use client';

import type { Collection, CollectionDetail } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@stepler/ui/components/tabs';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Images, Link2, Palette, SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import {
  collectionKey,
  isCollectionNotFound,
  unarchiveCollection,
  useInvalidateCollections,
} from '@/api/collections';
import { contentCounts, contentCountsKey } from '@/api/content';
import { guestLinksKey, listGuestLinks } from '@/api/guest-links';
import { BackLink } from '@/components/back-link';
import { errorMessageKey } from '@/errors/error-message';
import { CollectionNotFound } from '../collection-not-found';
import { AppearanceTab } from './appearance/appearance-tab';
import { CollectionHeader } from './collection-header';
import { tabOf } from './collection-tab';
import { ContentTab } from './content/content-tab';
import { CollectionSettingsPanel } from './settings/collection-settings';
import { LinksList } from './links/links-list';
import { LinksSheet, useLinksSheet } from './links/links-sheet';
import { useCollection } from '../use-collection';

/**
 * The collection's page (DESIGN-SYSTEM.md §6.6; owner reviews 2026-10-02). The header (title,
 * status, date, «Дії»), the description, the archive state with its one action, then a
 * segmented control between «Вміст» (the frames, `ContentTab`, with their count), «Посилання»
 * (`?tab=links` in the URL), «Гостьова сторінка» (`?tab=appearance`: cover and welcome message) and
 * «Параметри колекції» (`?tab=settings`).
 * A link's settings open in a sheet (`?link=`).
 */
export function CollectionOverview({ id }: { id: string }) {
  const t = useTranslations('collection');
  const tList = useTranslations('collections');
  // Once deleted (the «Параметри колекції» tab), the page is on its way to /app: stop refetching.
  const [deleted, setDeleted] = useState(false);
  const query = useCollection(id, !deleted);

  if (query.data !== undefined) {
    return <Overview collection={query.data} onDeleted={() => setDeleted(true)} />;
  }
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
  return <OverviewSkeleton label={t('loading')} />;
}

function Overview({ collection, onDeleted }: { collection: Collection; onDeleted: () => void }) {
  const t = useTranslations('collection');
  const tLinks = useTranslations('links');
  const router = useRouter();
  const params = useSearchParams();
  // `?links=all` was the «Усі посилання» sheet: it is the tab now.
  const tab = params.get('links') === 'all' ? 'links' : tabOf(params.get('tab'));
  const archived = collection.status === 'ARCHIVED';
  const links = useQuery({
    queryKey: guestLinksKey(collection.id),
    queryFn: () => listGuestLinks(collection.id),
  });
  const sheet = useLinksSheet(collection.id);
  const live = links.data?.items.filter((link) => link.status !== 'REVOKED').length;
  // Shared with the «Вміст» tab, which polls it while shown [C6].
  const counts = useQuery({
    queryKey: contentCountsKey(collection.id),
    queryFn: () => contentCounts(collection.id),
  });
  const contentTotal = counts.data?.total;

  // The tab lives in the URL (a history entry each), so refresh, Back and links keep it; an open
  // link sheet's `?link=` stays as it is.
  const selectTab = (next: string) => {
    const query = new URLSearchParams(params.toString());
    const selected = tabOf(next);
    if (selected !== 'content') query.set('tab', selected);
    else query.delete('tab');
    const search = query.toString();
    router.push(`/app/collections/${collection.id}${search === '' ? '' : `?${search}`}`, {
      scroll: false,
    });
  };

  return (
    <>
      <CollectionHeader collection={collection} />
      {/* On «Параметри колекції» the archiving card says the same with its own button: never two. */}
      {archived && tab !== 'settings' ? <ArchivedNotice id={collection.id} /> : null}
      <Tabs value={tab} onValueChange={selectTab} className="gap-6">
        {/* Phones show icon + count only (owner 2026-10-03), and so does 640–767 since the longer
            names (owner 2026-10-04) do not fit there; the label stays as the accessible name. */}
        <TabsList variant="segmented" aria-label={t('tabs.label')}>
          <TabsTrigger value="content">
            <Images aria-hidden="true" className="max-md:size-5" />
            <span className="min-w-0 truncate max-md:sr-only">{t('tabs.content')}</span>
            {contentTotal === undefined ? null : <TabsCount>{contentTotal}</TabsCount>}
          </TabsTrigger>
          <TabsTrigger value="links">
            <Link2 aria-hidden="true" className="max-md:size-5" />
            <span className="min-w-0 truncate max-md:sr-only">{t('tabs.links')}</span>
            {live === undefined ? null : <TabsCount>{live}</TabsCount>}
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette aria-hidden="true" className="max-md:size-5" />
            <span className="min-w-0 truncate max-md:sr-only">{t('tabs.appearance')}</span>
          </TabsTrigger>
          <TabsTrigger value="settings">
            <SlidersHorizontal aria-hidden="true" className="max-md:size-5" />
            <span className="min-w-0 truncate max-md:sr-only">{t('tabs.settings')}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="content">
          <section aria-labelledby="collection-content" className="grid gap-3">
            <h2 id="collection-content" className="sr-only">
              {t('content')}
            </h2>
            <ContentTab collection={collection} />
          </section>
        </TabsContent>
        <TabsContent value="links">
          {links.isError ? (
            <Alert
              variant="error"
              action={
                <Button variant="outline" onClick={() => void links.refetch()}>
                  {tLinks('retry')}
                </Button>
              }
            >
              {tLinks('loadFailed')}
            </Alert>
          ) : links.data === undefined ? (
            <div role="status" aria-label={tLinks('loading')} className="grid gap-3">
              <Skeleton className="h-28 w-full rounded-sheet" />
              <Skeleton className="h-28 w-full rounded-sheet" />
            </div>
          ) : (
            <LinksList
              collection={collection}
              items={links.data.items}
              onSettings={sheet.openLink}
            />
          )}
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceTab collection={collection} />
        </TabsContent>
        <TabsContent value="settings">
          <CollectionSettingsPanel collection={collection} onDeleted={onDeleted} />
        </TabsContent>
      </Tabs>
      {links.data === undefined ? null : (
        <LinksSheet collection={collection} links={links.data.items} sheet={sheet} />
      )}
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
      // The detail also holds the storage line, which a mutation's answer leaves out.
      queryClient.setQueryData<CollectionDetail>(collectionKey(id), (previous) =>
        previous === undefined ? undefined : { ...previous, ...collection },
      );
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
