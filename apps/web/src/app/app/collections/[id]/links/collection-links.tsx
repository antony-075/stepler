'use client';

// Design (DESIGN-SYSTEM.md §6.0, §6.7; owner reviews 2026-10-02: "a very sensitive section",
// make it clear; then: cards as an accordion, a way to delete a link):
// - The tab answers one question per link: how do guests get in, and what may they do. Every
//   live link is one accordion card (GuestLinkCard): the header shares it (QR, link, Copy,
//   Download QR) and says what guests can do; «Керувати» opens the controls and the danger zone.
// - Order follows importance: the main link (the one on invitations and tables), then
//   «Додаткові посилання» (title with the count, one sentence on why you would want one and
//   «Нове посилання» level with the title; a dashed empty card that asks when there are none),
//   then revoked links as a short struck-through record, each removable from the list.
// - Plain language everywhere: each part says what it does in one sentence; the state switch
//   says what a guest will see; the danger zone says what stops working, and its actions ask
//   for the link's name to be typed.
// - States: skeleton while loading, an Alert with Retry on failure, the shared «not found» for a
//   missing or foreign collection, an info Alert for an archived collection (controls stay),
//   inline Alerts for failed actions, toasts only to confirm (in the colour of the new state).

import type { GuestLink } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { LinkRow } from '@stepler/ui/components/link-row';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { isApiError } from '@/api/client';
import { isCollectionNotFound, useInvalidateCollections } from '@/api/collections';
import { deleteGuestLink, guestLinksKey, listGuestLinks } from '@/api/guest-links';
import { BackLink } from '@/components/back-link';
import { errorMessageKey } from '@/errors/error-message';
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
  const count = children.length;
  const create = (
    <Button variant="outline" className="w-full sm:w-auto" onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" />
      {t('new')}
    </Button>
  );
  return (
    <section aria-labelledby="extra-links" className="grid gap-5">
      {/* Title and count on one line with the action level with it (from `sm`); the sentence
          under them says why you would want one. With no links the empty card asks instead. */}
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <h2 id="extra-links" className="type-h2 flex min-w-0 items-center gap-3">
          {t('title')}
          {count === 0 ? null : (
            <span
              data-slot="extra-links-count"
              className="type-data inline-grid h-6 min-w-6 place-items-center rounded-sheet bg-muted px-1.5 text-muted-foreground"
            >
              {t('count', { count })}
            </span>
          )}
        </h2>
        {count === 0 ? null : (
          <p className="max-w-[64ch] text-pretty text-muted-foreground sm:col-span-2">
            {t('description')}
          </p>
        )}
        {count === 0 ? null : (
          <div className="mt-2.5 sm:col-start-2 sm:row-start-1 sm:mt-0">{create}</div>
        )}
      </div>
      {count === 0 ? (
        <div
          data-slot="extra-links-empty"
          className="grid gap-4 rounded-sheet border border-dashed border-input p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-6 sm:py-5"
        >
          <span
            aria-hidden="true"
            className="hidden size-12 place-items-center rounded-frame bg-muted text-muted-foreground sm:grid"
          >
            <Link2 className="size-5" />
          </span>
          <div className="grid min-w-0 gap-1">
            <h3 className="text-base font-semibold">{t('emptyTitle')}</h3>
            <p className="max-w-[64ch] text-sm text-pretty text-muted-foreground">
              {t('emptyText')}
            </p>
          </div>
          {create}
        </div>
      ) : (
        children
      )}
      <CreateLinkDialog open={creating} onOpenChange={setCreating} collectionId={collectionId} />
    </section>
  );
}

/**
 * Revoked links stay as a record (G8): struck through, no QR. Each can be removed from the list
 * (the server keeps the row for the audit trail); it no longer works, so a plain confirm is
 * enough, without typing its name.
 */
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
              menu={<RemoveFromHistory link={link} />}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RemoveFromHistory({ link }: { link: GuestLink }) {
  const t = useTranslations('links');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [confirming, setConfirming] = useState(false);
  const name = link.label ?? t('defaultTitle');
  const remove = useMutation({
    mutationFn: () => deleteGuestLink(link.id),
    onSuccess: async () => {
      toast({ variant: 'info', title: t('revoked.removed') });
      await invalidate();
    },
  });
  const failure = isApiError(remove.error) ? remove.error.code : null;
  const label = t('revoked.remove', { name });
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        title={label}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          remove.reset();
          setConfirming(true);
        }}
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('revoked.removeTitle', { name })}
        description={t('revoked.removeText')}
        confirmLabel={t('revoked.removeConfirm')}
        cancelLabel={t('danger.cancel')}
        pendingLabel={t('revoked.removePending')}
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
        errorMessage={tRoot(errorMessageKey(failure ?? 'INTERNAL'))}
      />
    </>
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
