'use client';

// Design (direction C settings pattern, DESIGN-SYSTEM.md §6.8; the same column as /app/settings):
// - One centred 640px column, back link to the collection (its title, cut to one line), a
//   compact header and three sections in order of how often they are used: Details, Guest
//   access, Danger zone.
// - Details uses `wide` rows: the label and hint on the left, the field taking the rest of the
//   row from 600px; stacked on phones. Save and Cancel sit in the panel's own footer, so they
//   belong to these two fields only; Save does nothing (aria-disabled) until something changed.
// - Archive is reversible, so it asks once in a plain ConfirmDialog; unarchive just happens.
// - Delete is the only red on the page: a panel edged in the destructive colour with one outline
//   button carrying the bin icon and the word in destructive text (a filled destructive button
//   lives only inside ConfirmDialog, §5.1), then a destructive ConfirmDialog that names the
//   collection.
// - Errors stay next to what caused them (inline Alerts); toasts only confirm.

import type { Collection } from '@stepler/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { Input } from '@stepler/ui/components/input';
import { PageHeader } from '@stepler/ui/components/page-header';
import { SettingRow, SettingsSection } from '@stepler/ui/components/setting-row';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { Textarea } from '@stepler/ui/components/textarea';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { isApiError } from '@/api/client';
import {
  archiveCollection,
  collectionKey,
  deleteCollection,
  isCollectionNotFound,
  unarchiveCollection,
  updateCollection,
  useInvalidateCollections,
} from '@/api/collections';
import { BackLink } from '@/components/back-link';
import { errorMessageKey } from '@/errors/error-message';
import {
  type CollectionFormValues,
  collectionFormSchema,
  DESCRIPTION_MAX,
  TITLE_MAX,
  toCollectionRequest,
} from '../../../collection-form';
import { CollectionNotFound } from '../../collection-not-found';
import { useCollection } from '../../use-collection';

export function CollectionSettings({ id }: { id: string }) {
  const t = useTranslations('collection');
  // Once deleted, the page is on its way to /app: stop refetching (it would only 404).
  const [deleted, setDeleted] = useState(false);
  const query = useCollection(id, !deleted);

  if (query.data !== undefined) {
    return <Settings collection={query.data} onDeleted={() => setDeleted(true)} />;
  }
  if (query.isError) {
    if (isCollectionNotFound(query.error)) return <CollectionNotFound />;
    return (
      <>
        <PageHeader
          size="compact"
          back={<BackLink href="/app">{t('back')}</BackLink>}
          title={t('settingsPage.pageTitle')}
        />
        <Alert
          variant="error"
          className="mt-8"
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      </>
    );
  }
  return (
    <div role="status" aria-busy="true" aria-label={t('loading')} className="grid gap-3">
      <Skeleton className="h-11 w-40" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="mt-6 h-64 w-full rounded-sheet" />
    </div>
  );
}

function Settings({ collection, onDeleted }: { collection: Collection; onDeleted: () => void }) {
  const t = useTranslations('collection');
  return (
    <>
      <PageHeader
        size="compact"
        back={
          <BackLink href={`/app/collections/${collection.id}`} title={collection.title}>
            {collection.title}
          </BackLink>
        }
        title={t('settingsPage.pageTitle')}
      />
      <div className="mt-8 grid gap-8">
        <DetailsSection collection={collection} />
        <AccessSection collection={collection} />
        <DangerSection collection={collection} onDeleted={onDeleted} />
      </div>
    </>
  );
}

const toFormValues = (collection: Collection): CollectionFormValues => ({
  title: collection.title,
  description: collection.description ?? '',
});

function DetailsSection({ collection }: { collection: Collection }) {
  const t = useTranslations('collection.settingsPage');
  const tForm = useTranslations('collections.form');
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const { toast } = useToast();
  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: toFormValues(collection),
  });
  const save = useMutation({
    mutationFn: (values: CollectionFormValues) =>
      updateCollection(collection.id, toCollectionRequest(values)),
    onSuccess: async (saved) => {
      queryClient.setQueryData(collectionKey(saved.id), saved);
      form.reset(toFormValues(saved));
      toast({ variant: 'success', title: t('saved') });
      await invalidate();
    },
  });

  const dirty = form.formState.isDirty;
  const inert = !dirty || save.isPending;
  const titleError = form.formState.errors.title;
  const descriptionError = form.formState.errors.description;
  const descriptionLength = useWatch({ control: form.control, name: 'description' }).length;
  const failure = isApiError(save.error) ? save.error.code : null;
  const describedBy = (id: string, error: boolean) =>
    error ? `${id}-hint ${id}-error` : `${id}-hint`;

  return (
    <SettingsSection id="collection-details" title={t('details')} description={t('detailsHint')}>
      <form
        noValidate
        className="divide-y"
        onSubmit={(event) =>
          void form.handleSubmit((values) => {
            if (!save.isPending) save.mutate(values);
          })(event)
        }
      >
        <SettingRow
          id="collection-title"
          label={tForm('title')}
          hint={t('titleHint')}
          control="wide"
        >
          <Input
            aria-labelledby="collection-title"
            aria-describedby={describedBy('collection-title', titleError !== undefined)}
            aria-invalid={titleError !== undefined || undefined}
            autoComplete="off"
            maxLength={TITLE_MAX}
            {...form.register('title')}
          />
          {titleError !== undefined ? (
            <p
              id="collection-title-error"
              role="alert"
              className="mt-2 flex items-start gap-1.5 text-sm leading-[1.45] text-destructive"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                {titleError.type === 'too_big'
                  ? tForm('titleTooLong', { max: TITLE_MAX })
                  : tForm('titleRequired')}
              </span>
            </p>
          ) : null}
        </SettingRow>
        <SettingRow
          id="collection-description"
          label={tForm('description')}
          hint={t('descriptionHint')}
          control="wide"
        >
          <Textarea
            aria-labelledby="collection-description"
            aria-describedby={describedBy('collection-description', descriptionError !== undefined)}
            aria-invalid={descriptionError !== undefined || undefined}
            maxLength={DESCRIPTION_MAX}
            {...form.register('description')}
          />
          <p className="type-data mt-2 text-right text-muted-foreground">
            {tForm('counter', { count: descriptionLength, max: DESCRIPTION_MAX })}
          </p>
          {descriptionError !== undefined ? (
            <p
              id="collection-description-error"
              role="alert"
              className="mt-1 flex items-start gap-1.5 text-sm leading-[1.45] text-destructive"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                {tForm('descriptionTooLong', { max: DESCRIPTION_MAX })}
              </span>
            </p>
          ) : null}
        </SettingRow>
        <div className="grid gap-3 p-4 min-[600px]:px-6">
          {failure !== null ? (
            <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert>
          ) : null}
          <div className="flex flex-col-reverse gap-2 min-[600px]:flex-row min-[600px]:justify-end">
            <Button
              type="button"
              variant="ghost"
              aria-disabled={inert || undefined}
              onClick={() => {
                if (inert) return;
                form.reset(toFormValues(collection));
                save.reset();
              }}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" aria-disabled={inert || undefined}>
              {save.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      </form>
    </SettingsSection>
  );
}

function AccessSection({ collection }: { collection: Collection }) {
  const t = useTranslations('collection.settingsPage');
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const archived = collection.status === 'ARCHIVED';

  const change = useMutation({
    mutationFn: (to: 'archive' | 'unarchive') =>
      to === 'archive' ? archiveCollection(collection.id) : unarchiveCollection(collection.id),
    onSuccess: async (updated, to) => {
      queryClient.setQueryData(collectionKey(updated.id), updated);
      toast({
        variant: 'success',
        title: to === 'archive' ? t('archived') : tRoot('collection.unarchived'),
      });
      await invalidate();
    },
  });
  const failure = isApiError(change.error) ? change.error.code : null;
  const failureVariant = failure === 'COLLECTION_LIMIT_REACHED' ? 'warning' : 'error';

  return (
    <SettingsSection id="collection-access" title={t('access')}>
      {archived ? (
        <SettingRow
          id="collection-unarchive"
          label={tRoot('collection.unarchive')}
          hint={t('unarchiveHint')}
        >
          <Button
            variant="outline"
            className="w-full min-[600px]:w-auto"
            aria-describedby="collection-unarchive-hint"
            aria-disabled={change.isPending || undefined}
            onClick={() => {
              if (!change.isPending) change.mutate('unarchive');
            }}
          >
            {tRoot('collection.unarchive')}
          </Button>
        </SettingRow>
      ) : (
        <SettingRow id="collection-archive" label={t('archive')} hint={t('archiveHint')}>
          <Button
            variant="outline"
            className="w-full min-[600px]:w-auto"
            aria-describedby="collection-archive-hint"
            onClick={() => {
              change.reset();
              setConfirming(true);
            }}
          >
            {t('archive')}
          </Button>
        </SettingRow>
      )}
      {archived && failure !== null ? (
        <div className="p-4 min-[600px]:px-6">
          <Alert variant={failureVariant}>{tRoot(errorMessageKey(failure))}</Alert>
        </div>
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
    </SettingsSection>
  );
}

function DangerSection({
  collection,
  onDeleted,
}: {
  collection: Collection;
  onDeleted: () => void;
}) {
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
      toast({ variant: 'success', title: t('deleted') });
      queryClient.removeQueries({ queryKey: collectionKey(collection.id) });
      await invalidate();
    },
  });
  const failure = isApiError(remove.error) ? remove.error.code : null;

  return (
    <SettingsSection id="collection-danger" title={t('danger')} tone="danger">
      <SettingRow id="collection-delete" label={t('delete')} hint={t('deleteHint')}>
        <Button
          variant="outline"
          className="w-full text-destructive min-[600px]:w-auto"
          aria-describedby="collection-delete-hint"
          onClick={() => {
            remove.reset();
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          {t('deleteButton')}
        </Button>
      </SettingRow>
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
    </SettingsSection>
  );
}
