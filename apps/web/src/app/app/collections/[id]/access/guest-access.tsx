'use client';

// Design (DESIGN-SYSTEM.md §6.7, §7.1; artboard C-gallery access aside; plan Task 9):
// - Hierarchy follows the admin's job before an event: hand guests the link. The default link
//   is first and largest (LinkPanel: QR, link, what guests can do, actions); additional links
//   are a quiet list under «Інші посилання»; cards use the full page column (§6.0).
// - Permissions read as a sentence («Гості можуть: додавати фото й відео, …» / «Лише перегляд»),
//   never as four flags; they are edited through two plain questions in a dialog.
// - Consequences are spelled out where they happen: replacing the link says the old one and the
//   printed QR stop working (and that a paused link stays paused); revoking says it is forever.
//   Pausing is reversible, so it needs no confirmation, only a toast.
// - The section nav (G9) sits under the same header as the overview; at 320px it scrolls inside
//   itself. Archived collections keep every control, with an info Alert that links do not work.
// - States: skeleton while loading, an Alert with Retry on failure, the shared «not found» for
//   a missing or foreign collection, inline Alerts for failed actions, toasts only to confirm.

import type { GuestLink } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { isCollectionNotFound } from '@/api/collections';
import { guestLinksKey, listGuestLinks } from '@/api/guest-links';
import { BackLink } from '@/components/back-link';
import { CollectionNotFound } from '../../collection-not-found';
import { useCollection } from '../../use-collection';
import { CollectionHeader } from '../collection-header';
import { DefaultLink } from './default-link';
import { OtherLinks } from './other-links';

/** The live default link; a rotated-out default is never listed by the API. */
const liveDefault = (items: GuestLink[]) =>
  items.find((link) => link.isDefault && link.status !== 'REVOKED');

export function GuestAccess({ id }: { id: string }) {
  const t = useTranslations('access');
  const tCollection = useTranslations('collection');
  const collection = useCollection(id);
  const links = useQuery({ queryKey: guestLinksKey(id), queryFn: () => listGuestLinks(id) });

  if (collection.isError || links.isError) {
    const error = collection.error ?? links.error;
    if (isCollectionNotFound(error)) return <CollectionNotFound />;
    return (
      <>
        <PageHeader
          size="compact"
          back={<BackLink href="/app">{tCollection('back')}</BackLink>}
          title={t('pageTitle')}
        />
        <Alert
          variant="error"
          action={
            <Button
              variant="outline"
              onClick={() => {
                void collection.refetch();
                void links.refetch();
              }}
            >
              {t('retry')}
            </Button>
          }
        >
          {collection.isError ? tCollection('loadFailed') : t('loadFailed')}
        </Alert>
      </>
    );
  }
  if (collection.data === undefined || links.data === undefined) {
    return <AccessSkeleton label={t('loading')} />;
  }

  const items = links.data.items;
  const defaultLink = liveDefault(items);
  return (
    <>
      <CollectionHeader collection={collection.data} current="access" />
      <div className="grid gap-10">
        {collection.data.status === 'ARCHIVED' ? (
          <Alert variant="info">{t('archivedNotice')}</Alert>
        ) : null}
        {defaultLink === undefined ? null : (
          <DefaultLink collection={collection.data} link={defaultLink} />
        )}
        <OtherLinks collection={collection.data} links={items.filter((link) => !link.isDefault)} />
      </div>
    </>
  );
}

function AccessSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="grid gap-8">
      <div className="grid gap-3">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-12 w-72 max-w-full" />
      </div>
      <Skeleton className="h-80 w-full rounded-sheet sm:h-64" />
      <Skeleton className="h-24 w-full rounded-sheet" />
    </div>
  );
}
