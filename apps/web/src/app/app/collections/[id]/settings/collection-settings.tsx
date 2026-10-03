'use client';

// Design (DESIGN-SYSTEM.md §6.8; owner reviews 2026-10-02): the «Параметри» tab of the collection
// page. Two cards: «Архівування» (asks once; bringing it back just happens) and the danger zone
// (the only red on the page; a destructive ConfirmDialog names the collection). Guest access is
// not here: permissions belong to each link, on «Посилання» (owner 2026-10-03). Errors stay
// inline; toasts only confirm.

import type { Collection } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Trash2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { isApiError } from '@/api/client';
import { collectionKey, deleteCollection, useInvalidateCollections } from '@/api/collections';
import { errorMessageKey } from '@/errors/error-message';
import { useArchiveToggle } from '../../use-archive';

/**
 * The collection's «Параметри» tab (owner 2026-10-02: one page, no separate settings page; the
 * title and description are edited in place in the header): archiving and the danger zone.
 */
export function CollectionSettingsPanel({
  collection,
  onDeleted,
}: {
  collection: Collection;
  onDeleted: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-6">
      <ArchiveCard collection={collection} />
      <DangerCard collection={collection} onDeleted={onDeleted} />
    </div>
  );
}

/**
 * A numbered section card: the number (the order of the page, `aria-hidden`), the h2 and a
 * muted hint on the right from `md`, then the content.
 */
function SectionCard({
  number,
  id,
  title,
  hint,
  children,
}: {
  number?: number;
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-5 rounded-sheet border bg-card p-4 shadow-card sm:p-6"
    >
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-[auto_minmax(0,1fr)] md:items-baseline">
        <h2 id={id} className="type-h3 flex items-center gap-3">
          {number === undefined ? null : (
            <span
              aria-hidden="true"
              className="type-data grid size-7 shrink-0 place-items-center rounded-full border bg-background text-foreground"
            >
              {number}
            </span>
          )}
          {title}
        </h2>
        {hint ? (
          <p className="text-sm text-pretty text-muted-foreground md:text-right">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** «Архівування»: one row, an icon, what happens and the button. */
function ArchiveCard({ collection }: { collection: Collection }) {
  const t = useTranslations('collection.settingsPage');
  const tRoot = useTranslations();
  const [confirming, setConfirming] = useState(false);
  const archived = collection.status === 'ARCHIVED';
  const change = useArchiveToggle(collection);
  const failure = isApiError(change.error) ? change.error.code : null;
  const failureVariant = failure === 'COLLECTION_LIMIT_REACHED' ? 'warning' : 'error';
  const Icon = archived ? ArchiveRestore : Archive;
  const hintId = 'collection-archive-hint';

  return (
    <SectionCard id="collection-archiving" title={t('archiving')}>
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <span
          aria-hidden="true"
          className="hidden size-11 place-items-center rounded-full border bg-background text-muted-foreground sm:grid"
        >
          <Icon className="size-5" />
        </span>
        <div className="grid gap-0.5">
          <p className="font-semibold">
            {archived ? tRoot('collection.unarchive') : t('archiveTitle')}
          </p>
          <p id={hintId} className="max-w-[60ch] text-sm text-pretty text-muted-foreground">
            {archived ? t('unarchiveHint') : t('archiveHint')}
          </p>
        </div>
        {archived ? (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            aria-describedby={hintId}
            aria-disabled={change.isPending || undefined}
            onClick={() => {
              if (!change.isPending) change.mutate('unarchive');
            }}
          >
            {tRoot('collection.unarchive')}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            aria-describedby={hintId}
            onClick={() => {
              change.reset();
              setConfirming(true);
            }}
          >
            {t('archive')}
          </Button>
        )}
      </div>
      {archived && failure !== null ? (
        <Alert variant={failureVariant}>{tRoot(errorMessageKey(failure))}</Alert>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('archiveConfirmTitle', { title: collection.title })}
        description={t('archiveConfirmText')}
        confirmLabel={t('archive')}
        cancelLabel={t('cancel')}
        pendingLabel={t('archivePending')}
        onConfirm={async () => {
          await change.mutateAsync('archive');
        }}
        errorMessage={tRoot(errorMessageKey(failure ?? 'INTERNAL'))}
      />
    </SectionCard>
  );
}

function DangerCard({ collection, onDeleted }: { collection: Collection; onDeleted: () => void }) {
  const t = useTranslations('collection.settingsPage');
  const tRoot = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteCollection(collection.id),
    onSuccess: async () => {
      onDeleted();
      router.replace('/app');
      toast({ variant: 'info', title: t('deleted') });
      queryClient.removeQueries({ queryKey: collectionKey(collection.id) });
      await invalidate();
    },
  });
  const failure = isApiError(remove.error) ? remove.error.code : null;

  return (
    <section
      aria-labelledby="collection-danger"
      data-slot="collection-danger"
      className="grid gap-4 rounded-sheet border border-destructive bg-destructive-soft p-4 shadow-card sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-6"
    >
      <TriangleAlert
        aria-hidden="true"
        className="hidden size-5 shrink-0 text-destructive sm:block"
      />
      <div className="grid gap-1">
        <h2 id="collection-danger" className="type-h3 flex items-center gap-2 text-destructive">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0 sm:hidden" />
          {t('danger')}
        </h2>
        <p id="collection-delete-hint" className="max-w-[60ch] text-sm text-pretty">
          {t('deleteHint')}
        </p>
      </div>
      <Button
        variant="destructive"
        className="w-full sm:w-auto"
        aria-describedby="collection-delete-hint"
        onClick={() => {
          remove.reset();
          setConfirming(true);
        }}
      >
        <Trash2 aria-hidden="true" />
        {t('deleteButton')}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={t('deleteConfirmTitle', { title: collection.title })}
        description={t('deleteConfirmText')}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('cancel')}
        pendingLabel={t('deletePending')}
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
        errorMessage={tRoot(errorMessageKey(failure ?? 'INTERNAL'))}
      />
    </section>
  );
}
