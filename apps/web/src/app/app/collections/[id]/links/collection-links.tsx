'use client';

// Design (DESIGN-SYSTEM.md §6.0, §6.7; owner review 2026-10-02: "a very sensitive section",
// make it clear):
// - The tab answers one question per link: how do guests get in, and what may they do. So every
//   live link is one card with everything about it (GuestLinkCard): share, what guests can do,
//   its state, and the danger zone last. No separate "change access" dialog to find.
// - Order follows importance: the main link (the one on invitations and tables), then
//   «Додаткові посилання» with one sentence on why you would want one and «Нове посилання»,
//   then revoked links as a short struck-through record. Cards use the full page column.
// - Plain language everywhere: each part says what it does in one sentence; the state switch
//   says what a guest will see; the danger zone says what stops working, and its actions ask
//   for the link's name to be typed.
// - States: skeleton while loading, an Alert with Retry on failure, the shared «not found» for a
//   missing or foreign collection, an info Alert for an archived collection (controls stay),
//   inline Alerts for failed actions, toasts only to confirm.

import type { GuestLink } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { LinkRow } from '@stepler/ui/components/link-row';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { isCollectionNotFound } from '@/api/collections';
import { guestLinksKey, listGuestLinks } from '@/api/guest-links';
import { BackLink } from '@/components/back-link';
import { permissionWords } from '@/guest-links/link-permissions';
import { CollectionNotFound } from '../../collection-not-found';
import { useCollection } from '../../use-collection';
import { CollectionHeader } from '../collection-header';
import { CreateLinkDialog } from './create-link-dialog';
import { GuestLinkCard } from './guest-link-card';

const SHORT_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;

export function CollectionLinks({ id }: { id: string }) {
  const t = useTranslations('links');
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
    return <LinksSkeleton label={t('loading')} />;
  }

  const items = links.data.items;
  // A rotated-out default is never listed by the API; only the live one is.
  const main = items.find((link) => link.isDefault && link.status !== 'REVOKED');
  const extra = items.filter((link) => !link.isDefault && link.status !== 'REVOKED');
  const revoked = items.filter((link) => !link.isDefault && link.status === 'REVOKED');

  return (
    <>
      <CollectionHeader collection={collection.data} current="links" />
      <div className="grid gap-12">
        {collection.data.status === 'ARCHIVED' ? (
          <Alert variant="info">{t('archivedNotice')}</Alert>
        ) : null}
        {main === undefined ? null : (
          <GuestLinkCard collection={collection.data} link={main} level={2} />
        )}
        <ExtraLinks collectionId={id}>
          {extra.map((link) => (
            <GuestLinkCard key={link.id} collection={collection.data} link={link} level={3} />
          ))}
        </ExtraLinks>
        {revoked.length === 0 ? null : <RevokedLinks links={revoked} />}
      </div>
    </>
  );
}

function ExtraLinks({ collectionId, children }: { collectionId: string; children: ReactNode[] }) {
  const t = useTranslations('links.extra');
  const [creating, setCreating] = useState(false);
  return (
    <section aria-labelledby="extra-links" className="grid gap-5">
      <div className="grid gap-3 sm:flex sm:items-end sm:justify-between sm:gap-6">
        <div className="grid gap-1">
          <h2 id="extra-links" className="type-h2">
            {t('title')}
          </h2>
          <p className="max-w-[60ch] text-pretty text-muted-foreground">{t('description')}</p>
        </div>
        <Button
          variant="outline"
          className="w-full shrink-0 sm:w-auto"
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden="true" />
          {t('new')}
        </Button>
      </div>
      {children}
      <CreateLinkDialog open={creating} onOpenChange={setCreating} collectionId={collectionId} />
    </section>
  );
}

/** Revoked links stay as a record (G8): struck through, no QR, no actions. */
function RevokedLinks({ links }: { links: GuestLink[] }) {
  const t = useTranslations('links');
  const tWords = useTranslations('guestLinks.permissions');
  const format = useFormatter();
  return (
    <section aria-labelledby="revoked-links" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="revoked-links" className="type-h3">
          {t('revoked.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('revoked.description')}</p>
      </div>
      <ul className="divide-y rounded-sheet border bg-card px-4 sm:px-5">
        {links.map((link) => (
          <li key={link.id}>
            <LinkRow
              label={link.label ?? t('defaultTitle')}
              permissionsSummary={permissionWords(link.permissions, tWords, (words) =>
                format.list(words),
              )}
              status="revoked"
              statusLabel={t('revoked.on', {
                date: format.dateTime(new Date(link.revokedAt ?? link.updatedAt), SHORT_DATE),
              })}
              date={format.dateTime(new Date(link.createdAt), SHORT_DATE)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LinksSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="grid gap-8">
      <div className="grid gap-3">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-12 w-72 max-w-full" />
      </div>
      <Skeleton className="h-[36rem] w-full rounded-sheet" />
    </div>
  );
}
