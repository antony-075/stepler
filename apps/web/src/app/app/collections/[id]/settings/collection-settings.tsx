'use client';

// Design (DESIGN-SYSTEM.md §6.8; owner reviews 2026-10-02, 2026-10-06): the «Параметри колекції» tab
// of the collection page. Four cards: «Назва й опис» (the only place they are edited, owner
// 2026-10-06), «Картинка колекції» (plan Task 24: the owner's own image for the dashboard; its card
// has its own design notes), «Архівування» (asks once; bringing it back just happens) and the danger zone
// (the only red on the page; a destructive ConfirmDialog names the collection). Guest access is
// not here: permissions belong to each link, on «Посилання» (owner 2026-10-03). Errors stay
// inline; toasts only confirm.

import { zodResolver } from '@hookform/resolvers/zod';
import type { Collection, CollectionDetail } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import { Textarea } from '@stepler/ui/components/textarea';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Trash2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { isApiError } from '@/api/client';
import {
  collectionKey,
  deleteCollection,
  updateCollection,
  useInvalidateCollections,
} from '@/api/collections';
import { errorMessageKey } from '@/errors/error-message';
import {
  type CollectionFormValues,
  collectionFormSchema,
  DESCRIPTION_MAX,
  TITLE_MAX,
  toCollectionRequest,
} from '../../../collection-form';
import { writeLock } from '../../../access-model';
import { useArchiveToggle } from '../../use-archive';
import { SectionCard } from '../section-card';
import { CollectionImageCard } from './collection-image-card';

/**
 * The collection's «Параметри колекції» tab (owner 2026-10-02: one page, no separate settings
 * page): the title and description, the collection image, archiving and the danger zone.
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
      <DetailsCard key={collection.id} collection={collection} />
      <CollectionImageCard collection={collection} />
      <ArchiveCard collection={collection} />
      <DangerCard collection={collection} onDeleted={onDeleted} />
    </div>
  );
}

const valuesOf = (collection: Collection): CollectionFormValues => ({
  title: collection.title,
  description: collection.description ?? '',
});

/**
 * «Назва й опис»: the title (required, up to 100 characters) and the description (optional, up
 * to 1000, line breaks kept), with visible labels, React Hook Form and the contract's own rules.
 * «Зберегти» is usable only for a changed, valid form; «Скасувати» puts the saved values back.
 * The answer updates the page's header and the dashboard. Archived collections stay editable
 * (D9). A refusal is said under the form; a success is a toast.
 */
function DetailsCard({ collection }: { collection: Collection }) {
  const t = useTranslations('collection.settingsPage');
  const tForm = useTranslations('collections.form');
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const { toast } = useToast();
  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    mode: 'onChange',
    defaultValues: valuesOf(collection),
  });
  const save = useMutation({
    mutationFn: (values: CollectionFormValues) =>
      updateCollection(collection.id, toCollectionRequest(values)),
    onSuccess: async (saved) => {
      // The detail also holds the storage line, which a mutation's answer leaves out.
      queryClient.setQueryData<CollectionDetail>(collectionKey(saved.id), (previous) =>
        previous === undefined ? undefined : { ...previous, ...saved },
      );
      form.reset(valuesOf(saved));
      toast({ variant: 'success', title: t('saved') });
      await invalidate();
    },
  });
  const { errors, isDirty, isValid } = form.formState;
  const descriptionLength = useWatch({ control: form.control, name: 'description' }).length;
  const failure = isApiError(save.error) ? save.error.code : save.error ? 'INTERNAL' : null;
  // Read-only (ADR 0018): the form stays readable, saving is off and says why.
  const lock = writeLock(collection);
  const canSave = isDirty && isValid && !save.isPending && !lock.locked;

  return (
    <SectionCard id="collection-details" title={t('detailsTitle')} hint={t('detailsHint')}>
      <form
        noValidate
        aria-labelledby="collection-details"
        className="grid max-w-[44rem] gap-5"
        onSubmit={(event) =>
          void form.handleSubmit((values) => {
            if (canSave) save.mutate(values);
          })(event)
        }
      >
        <Field
          id="collection-settings-title"
          label={tForm('title')}
          error={
            errors.title === undefined
              ? undefined
              : errors.title.type === 'too_big'
                ? tForm('titleTooLong', { max: TITLE_MAX })
                : tForm('titleRequired')
          }
        >
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              maxLength={TITLE_MAX}
              {...form.register('title')}
            />
          )}
        </Field>
        <Field
          id="collection-settings-description"
          label={
            <>
              {tForm('description')}{' '}
              <span className="font-normal text-muted-foreground">{tForm('optional')}</span>
            </>
          }
          description={
            <span className="type-data block text-right">
              {tForm('counter', { count: descriptionLength, max: DESCRIPTION_MAX })}
            </span>
          }
          error={
            errors.description === undefined
              ? undefined
              : tForm('descriptionTooLong', { max: DESCRIPTION_MAX })
          }
        >
          {(control) => (
            <Textarea {...control} maxLength={DESCRIPTION_MAX} {...form.register('description')} />
          )}
        </Field>
        {failure === null ? null : <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert>}
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            aria-disabled={!isDirty || save.isPending || undefined}
            onClick={() => {
              if (!isDirty || save.isPending) return;
              save.reset();
              form.reset(valuesOf(collection));
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            aria-disabled={!canSave || undefined}
            aria-describedby={lock.describedBy}
          >
            {save.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </SectionCard>
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
