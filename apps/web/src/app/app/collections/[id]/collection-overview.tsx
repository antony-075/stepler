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
import { useMediaQuery } from '@/components/use-media-query';
import { errorMessageKey } from '@/errors/error-message';
import { CollectionNotFound } from '../collection-not-found';
import { GuestPageTab } from './guest-page/guest-page-tab';
import { CollectionHeader } from './collection-header';
import { tabOf } from './collection-tab';
import { ContentTab } from './content/content-tab';
import { CollectionSettingsPanel } from './settings/collection-settings';
import { LinksList } from './links/links-list';
import { LinksSheet, useLinksSheet } from './links/links-sheet';
import { useCollection } from '../use-collection';

/**
 * From 1440px the collection's mini-nav sits beside the content (V1); narrower, the 280px column
 * would squeeze the guest-page editor's preview, so the tabs stay a row above the content.
 */
const WIDE = '(min-width: 90rem)';

/**
 * The collection's page (DESIGN-SYSTEM.md §0.9, §6.6; owner reviews 2026-10-02). The header (title,
 * status, date, «Дії»), the description, the archive state with its one action, then a
 * segmented control between «Вміст» (the frames, `ContentTab`, with their count), «Посилання»
 * (`?tab=links` in the URL), «Гостьова сторінка» (`?tab=appearance`: the guest page editor) and
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
  const wide = useMediaQuery(WIDE);

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

  const notice =
    // On «Параметри колекції» the archiving card says the same with its own button: never two.
    archived && tab !== 'settings' ? <ArchivedNotice id={collection.id} /> : null;
  const triggers = (
    <>
      <TabsTrigger value="content">
        <Images aria-hidden="true" className="size-4 max-md:size-5" />
        <span className="min-w-0 truncate max-md:sr-only">{t('tabs.content')}</span>
        {contentTotal === undefined ? null : <TabsCount>{contentTotal}</TabsCount>}
      </TabsTrigger>
      <TabsTrigger value="links">
        <Link2 aria-hidden="true" className="size-4 max-md:size-5" />
        <span className="min-w-0 truncate max-md:sr-only">{t('tabs.links')}</span>
        {live === undefined ? null : <TabsCount>{live}</TabsCount>}
      </TabsTrigger>
      <TabsTrigger value="appearance">
        <Palette aria-hidden="true" className="size-4 max-md:size-5" />
        <span className="min-w-0 truncate max-md:sr-only">{t('tabs.appearance')}</span>
      </TabsTrigger>
      <TabsTrigger value="settings">
        <SlidersHorizontal aria-hidden="true" className="size-4 max-md:size-5" />
        <span className="min-w-0 truncate max-md:sr-only">{t('tabs.settings')}</span>
      </TabsTrigger>
    </>
  );
  const panels = (
    <>
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
          <LinksList collection={collection} items={links.data.items} onSettings={sheet.openLink} />
        )}
      </TabsContent>
      <TabsContent value="appearance">
        <GuestPageTab collection={collection} />
      </TabsContent>
      {/* A form tab: a readable column inside the fluid admin frame. */}
      <TabsContent value="settings" className="max-w-[1240px]">
        <CollectionSettingsPanel collection={collection} onDeleted={onDeleted} />
      </TabsContent>
    </>
  );
  const linksSheet =
    links.data === undefined ? null : (
      <LinksSheet collection={collection} links={links.data.items} sheet={sheet} />
    );

  // From 1440px (V1, owner 2026-10-06): a 280px mini-nav beside the content, sticky under the top
  // bar at the window's height, with the collection's header, «Поділитися» and the four tabs as
  // a vertical list whose highlight slides. The content gets the full height.
  if (wide) {
    return (
      <>
        <Tabs
          value={tab}
          onValueChange={selectTab}
          orientation="vertical"
          // Out to the panel's edges: the mini-nav's line runs from the top bar to the bottom.
          // `data-page-top="tight"`: the shell's --page-top shrinks to the mini-nav's own inset,
          // so the sidebar's «Колекції» lines up with the mini-nav's first line.
          data-page-top="tight"
          className="-mx-(--admin-gutter) -mt-(--page-top) -mb-16 grid grid-cols-[17.5rem_minmax(0,1fr)] items-start gap-0"
        >
          {/* 58px: under the top bar (the panel's 8px margin and the 50px bar with its edges). */}
          <aside
            aria-label={collection.title}
            className="sticky top-[58px] flex h-[calc(100dvh-58px-var(--shell-inset-bottom))] min-w-0 flex-col gap-4 overflow-y-auto border-r px-4 pt-(--page-top) pb-4"
          >
            <CollectionHeader collection={collection} layout="nav" />
            <div aria-hidden="true" className="border-t" />
            {/* The rows' icons and labels start on the cover's edge; their highlight bleeds
                10px to each side. */}
            <TabsList variant="nav" aria-label={t('tabs.label')} className="-mx-2.5 -mt-0.5">
              {triggers}
            </TabsList>
          </aside>
          <div
            data-slot="tab-column"
            className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 px-6 pt-5 pb-16 laptop:pt-4"
          >
            {notice}
            {panels}
          </div>
        </Tabs>
        {linksSheet}
      </>
    );
  }

  return (
    <>
      <CollectionHeader collection={collection} />
      {notice}
      {/* Slimmer on a laptop (short screen), on every tab alike (owner remark 104). */}
      <Tabs value={tab} onValueChange={selectTab} className="gap-5 laptop:gap-4">
        {/* Phones show icon + count only (owner 2026-10-03), and so does 640–767 since the longer
            names (owner 2026-10-04) do not fit there; the label stays as the accessible name. */}
        <TabsList variant="segmented" aria-label={t('tabs.label')} className="laptop:*:min-h-9">
          {triggers}
        </TabsList>
        {panels}
      </Tabs>
      {linksSheet}
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

/**
 * The collection page's shape while it loads (owner 2026-10-06): the mini-nav beside a frame grid
 * from 1440px, else the header, the tabs and the grid; shown only after 180ms.
 */
function OverviewSkeleton({ label }: { label: string }) {
  const wide = useMediaQuery(WIDE);
  const grid = (
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} className="aspect-square" />
      ))}
    </div>
  );
  if (wide) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={label}
        data-page-top="tight"
        className="loading-delayed -mx-(--admin-gutter) -mt-(--page-top) -mb-16 grid grid-cols-[17.5rem_minmax(0,1fr)] items-start"
      >
        <div className="grid gap-3 border-r px-4 pt-(--page-top) pb-4">
          <Skeleton className="aspect-[16/9] w-full rounded-sheet" />
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-9 w-full" />
          <div className="grid gap-2 border-t pt-3">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-7 w-full" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 px-6 pt-5 pb-16">
          <Skeleton className="h-9 w-full max-w-xl" />
          {grid}
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true" aria-label={label} className="loading-delayed grid gap-5">
      <div className="grid gap-2.5">
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-5 w-48" />
      </div>
      <Skeleton className="h-11 w-full rounded-[7px] md:w-[36rem] md:pointer-fine:h-10" />
      {grid}
    </div>
  );
}
