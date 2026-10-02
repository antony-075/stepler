'use client';

import type { Collection } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { useToast } from '@stepler/ui/components/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Ellipsis, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import { collectionKey, deleteCollection, useInvalidateCollections } from '@/api/collections';
import { errorMessageKey } from '@/errors/error-message';
import { useArchiveToggle } from './use-archive';

/**
 * Archive (or bring back) and delete from a dashboard card's «⋯» (owner 2026-10-02: "too many
 * transitions"; on the collection page they are on its «Параметри» tab). A 44px ghost «⋯»
 * named «Дії з колекцією «{title}»»; focus returns to it after a dialog. Archive and unarchive ask once in a
 * plain ConfirmDialog (unarchive at the limit says why inside it); delete is destructive and
 * asks for the collection's title to be typed. Toasts in the colour of the new state.
 * `onDeleted` runs after a delete (the collection page leaves for /app).
 */
export function CollectionQuickActions({
  collection,
  onDeleted,
  className,
}: {
  collection: Collection;
  onDeleted?: () => void;
  className?: string;
}) {
  const t = useTranslations('collections.actions');
  const tSettings = useTranslations('collection.settingsPage');
  const tCollection = useTranslations('collection');
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const archived = collection.status === 'ARCHIVED';
  const toggle = useArchiveToggle(collection);
  const remove = useMutation({
    mutationFn: () => deleteCollection(collection.id),
    onSuccess: async () => {
      onDeleted?.();
      toast({ variant: 'info', title: tSettings('deleted') });
      queryClient.removeQueries({ queryKey: collectionKey(collection.id) });
      await invalidate();
    },
  });
  const toggleFailure = isApiError(toggle.error) ? toggle.error.code : null;
  const removeFailure = isApiError(remove.error) ? remove.error.code : null;
  const title = collection.title;

  const menuLabel = t('menu', { title });
  return (
    <div className={cn('flex', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={menuLabel}
            title={menuLabel}
            className="text-muted-foreground hover:text-foreground"
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem
            onSelect={() => {
              toggle.reset();
              setConfirm('archive');
            }}
          >
            {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {archived ? tCollection('unarchive') : tSettings('archive')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              remove.reset();
              setConfirm('delete');
            }}
          >
            <Trash2 aria-hidden="true" />
            {tSettings('deleteButton')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(open) => setConfirm(open ? 'archive' : null)}
        title={
          archived
            ? t('unarchiveConfirmTitle', { title })
            : tSettings('archiveConfirmTitle', { title })
        }
        description={archived ? t('unarchiveConfirmText') : tSettings('archiveConfirmText')}
        confirmLabel={archived ? tCollection('unarchive') : tSettings('archive')}
        cancelLabel={tSettings('cancel')}
        pendingLabel={archived ? t('unarchivePending') : tSettings('archivePending')}
        onConfirm={async () => {
          await toggle.mutateAsync(archived ? 'unarchive' : 'archive');
        }}
        errorMessage={tRoot(errorMessageKey(toggleFailure ?? 'INTERNAL'))}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => setConfirm(open ? 'delete' : null)}
        destructive
        title={tSettings('deleteConfirmTitle', { title })}
        description={tSettings('deleteConfirmText')}
        confirmPhrase={title}
        confirmPhraseLabel={t('deletePhrase', { title })}
        confirmLabel={tSettings('deleteConfirm')}
        cancelLabel={tSettings('cancel')}
        pendingLabel={tSettings('deletePending')}
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
        errorMessage={tRoot(errorMessageKey(removeFailure ?? 'INTERNAL'))}
      />
    </div>
  );
}
