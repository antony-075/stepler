'use client';

// Design (DESIGN-SYSTEM.md §6.7; owner reviews 2026-10-02): the collection page's «Посилання»
// tab. Order follows importance: the main link (the one on
// invitations and tables), then additional links, then the revoked record. Each live link is a
// `LinkListRow`: its QR (opens the QR to download), name and status, what guests can do, the
// link, «Копіювати» and «Керувати» (its settings, in the same sheet).

import type { Collection, GuestLink } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { LinkRow } from '@stepler/ui/components/link-row';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation } from '@tanstack/react-query';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import { deleteGuestLink } from '@/api/guest-links';
import { errorMessageKey } from '@/errors/error-message';
import { PermissionSummary } from '@/guest-links/permission-summary';
import { CreateLinkDialog } from './create-link-dialog';
import { LinkListRow } from './link-list-row';

const SHORT_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;

/**
 * Every link of a collection, on the «Посилання» tab: the main link, then «Додаткові
 * посилання» (count, why you would want one, «Нове посилання»; a dashed empty card when there
 * are none), then revoked links as a short struck-through record. `onSettings` opens a link's
 * settings in a sheet.
 */
export function LinksList({
  collection,
  items,
  onSettings,
}: {
  collection: Collection;
  items: readonly GuestLink[];
  onSettings: (key: string) => void;
}) {
  const t = useTranslations('links');
  // A rotated-out default is never listed by the API; only the live one is.
  const main = items.find((link) => link.isDefault && link.status !== 'REVOKED');
  const extra = items.filter((link) => !link.isDefault && link.status !== 'REVOKED');
  const revoked = items.filter((link) => !link.isDefault && link.status === 'REVOKED');
  return (
    <div className="grid gap-10">
      {collection.status === 'ARCHIVED' ? (
        <Alert variant="info">{t('archivedNotice')}</Alert>
      ) : null}
      {main === undefined ? null : (
        <section aria-labelledby="main-link" className="grid gap-3">
          <div className="grid gap-1">
            <h2 id="main-link" className="type-h3">
              {t('defaultTitle')}
            </h2>
            <p className="max-w-[64ch] text-sm text-pretty text-muted-foreground">
              {t('mainHint')}
            </p>
          </div>
          <ul className="rounded-sheet border bg-card shadow-card">
            <LinkListRow collection={collection} link={main} onSettings={onSettings} />
          </ul>
        </section>
      )}
      <ExtraLinks collectionId={collection.id} count={extra.length}>
        <ul className="divide-y rounded-sheet border bg-card shadow-card">
          {extra.map((link) => (
            <LinkListRow
              key={link.id}
              collection={collection}
              link={link}
              onSettings={onSettings}
            />
          ))}
        </ul>
      </ExtraLinks>
      {revoked.length === 0 ? null : <RevokedLinks links={revoked} />}
    </div>
  );
}

function ExtraLinks({
  collectionId,
  count,
  children,
}: {
  collectionId: string;
  count: number;
  children: ReactNode;
}) {
  const t = useTranslations('links.extra');
  const [creating, setCreating] = useState(false);
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
        <h2 id="extra-links" className="type-h3 flex min-w-0 items-center gap-3">
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
  const format = useFormatter();
  return (
    <section aria-labelledby="revoked-links" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="revoked-links" className="type-h3">
          {t('revoked.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('revoked.description')}</p>
      </div>
      <ul className="divide-y rounded-sheet border bg-card px-4 shadow-card sm:px-5">
        {links.map((link) => (
          <li key={link.id}>
            <LinkRow
              label={link.label ?? t('defaultTitle')}
              permissionsSummary={<PermissionSummary permissions={link.permissions} />}
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
