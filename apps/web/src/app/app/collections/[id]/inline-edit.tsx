'use client';

import {
  type Collection,
  type CollectionDetail,
  collectionDescriptionSchema,
  collectionTitleSchema,
  type UpdateCollectionRequest,
} from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { useToast } from '@stepler/ui/components/toast';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, Pencil, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { isApiError } from '@/api/client';
import { collectionKey, updateCollection, useInvalidateCollections } from '@/api/collections';
import { errorMessageKey } from '@/errors/error-message';
import { DESCRIPTION_MAX, TITLE_MAX } from '../../collection-form';

/**
 * Save one field of the collection with an optimistic update (the header shows the new text at
 * once, the old one comes back if the save fails, with a toast saying why).
 */
function useSaveField(collection: Collection) {
  const t = useTranslations('collection.inline');
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCollections();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: UpdateCollectionRequest) => updateCollection(collection.id, body),
    onMutate: (body) => {
      const key = collectionKey(collection.id);
      const previous = queryClient.getQueryData<Collection>(key);
      if (previous !== undefined) queryClient.setQueryData(key, { ...previous, ...body });
      return { previous };
    },
    onError: (error, _body, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(collectionKey(collection.id), context.previous);
      }
      toast({
        variant: 'error',
        title: t('failed'),
        description: tRoot(errorMessageKey(isApiError(error) ? error.code : 'INTERNAL')),
      });
    },
    onSuccess: async (saved) => {
      // The detail also holds the storage line, which a mutation's answer leaves out.
      queryClient.setQueryData<CollectionDetail>(collectionKey(saved.id), (previous) =>
        previous === undefined ? undefined : { ...previous, ...saved },
      );
      toast({ variant: 'success', title: t('saved') });
      await invalidate();
    },
  });
}

/** The visible pencil next to a field (not hover-only): 44px, named for what it edits. */
function PencilButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      <Pencil aria-hidden="true" />
    </Button>
  );
}

/** ✓ and ✕ for touch, next to the field being edited. */
function EditActions({
  pending,
  onSave,
  onCancel,
}: {
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('collection.inline');
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('save')}
        aria-disabled={pending || undefined}
        // Keeps focus in the field, so a description's blur does not save twice.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSave}
      >
        <Check aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('cancel')}
        aria-disabled={pending || undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onCancel}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-sm leading-[1.45] text-destructive"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

const FIELD = cn(
  'w-full min-w-0 rounded-control border border-input bg-card px-2 text-foreground',
  focusRing,
  'aria-invalid:border-destructive',
);

/**
 * The collection's title as the page's h1, edited in place (owner 2026-10-02): a pencil beside
 * it turns it into a field with the same type, focused and selected; Enter or ✓ saves, Escape
 * or ✕ cancels. The title rules are the API's (1–100 characters, one line); the error is shown
 * under the field. Archived collections are read-only: no pencil.
 */
export function EditableTitle({ collection }: { collection: Collection }) {
  const t = useTranslations('collection.inline');
  const tForm = useTranslations('collections.form');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(collection.title);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const save = useSaveField(collection);
  const readOnly = collection.status === 'ARCHIVED';

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const start = () => {
    setValue(collection.title);
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
  };
  const commit = () => {
    if (save.isPending) return;
    const parsed = collectionTitleSchema.safeParse(value);
    if (!parsed.success) {
      setError(
        value.trim() === '' ? tForm('titleRequired') : tForm('titleTooLong', { max: TITLE_MAX }),
      );
      return;
    }
    setEditing(false);
    if (parsed.data !== collection.title) save.mutate({ title: parsed.data });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <div className="grid gap-2">
        <div className="flex items-start gap-2">
          <h1 className="sr-only">{collection.title}</h1>
          <input
            ref={input}
            aria-label={t('titleField')}
            aria-invalid={error === null ? undefined : true}
            aria-describedby={error === null ? undefined : errorId}
            maxLength={TITLE_MAX}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            className={cn(FIELD, 'type-h1 py-0.5 xl:text-[2rem]')}
          />
          <EditActions pending={save.isPending} onSave={commit} onCancel={cancel} />
        </div>
        {error === null ? null : <FieldError id={errorId}>{error}</FieldError>}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-start gap-1">
      <h1
        data-slot="page-header-title"
        className="type-h1 min-w-0 [overflow-wrap:anywhere] xl:text-[2rem]"
      >
        {collection.title}
      </h1>
      {readOnly ? null : <PencilButton label={t('editTitle')} onClick={start} />}
    </div>
  );
}

/**
 * The description, edited in place: a pencil beside it (or a muted «Додати опис» when there is
 * none) turns it into a textarea that grows with its text; Ctrl/Cmd+Enter, ✓ or leaving the
 * field saves, Escape or ✕ cancels. Empty clears it. Archived: read-only.
 */
export function EditableDescription({ collection }: { collection: Collection }) {
  const t = useTranslations('collection.inline');
  const tForm = useTranslations('collections.form');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(collection.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const save = useSaveField(collection);
  const readOnly = collection.status === 'ARCHIVED';
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) area.current?.select();
  }, [editing]);

  const start = () => {
    setValue(collection.description ?? '');
    setError(null);
    cancelled.current = false;
    setEditing(true);
  };
  const cancel = () => {
    cancelled.current = true;
    setEditing(false);
    setError(null);
  };
  const commit = () => {
    if (save.isPending || cancelled.current) return;
    // Blank clears it; otherwise the API's rules (up to 1000 characters, line breaks kept).
    const blank = value.trim() === '';
    const parsed = blank ? null : collectionDescriptionSchema.safeParse(value);
    if (parsed !== null && !parsed.success) {
      setError(tForm('descriptionTooLong', { max: DESCRIPTION_MAX }));
      return;
    }
    const next = parsed === null ? null : parsed.data;
    setEditing(false);
    if (next !== collection.description) save.mutate({ description: next });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <div className="grid max-w-[60ch] gap-2">
        <div className="flex items-start gap-2">
          <textarea
            ref={area}
            aria-label={t('descriptionField')}
            aria-invalid={error === null ? undefined : true}
            aria-describedby={error === null ? undefined : errorId}
            maxLength={DESCRIPTION_MAX}
            rows={2}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            className={cn(
              FIELD,
              'min-h-11 resize-none py-1.5 leading-normal [field-sizing:content]',
            )}
          />
          <EditActions pending={save.isPending} onSave={commit} onCancel={cancel} />
        </div>
        <p className="text-sm text-muted-foreground">{t('descriptionHint')}</p>
        {error === null ? null : <FieldError id={errorId}>{error}</FieldError>}
      </div>
    );
  }
  if (collection.description === null) {
    return readOnly ? null : (
      <Button
        variant="ghost"
        onClick={start}
        className="-ml-3 justify-self-start font-normal text-muted-foreground"
      >
        <Plus aria-hidden="true" />
        {t('addDescription')}
      </Button>
    );
  }
  return (
    <div className="flex max-w-[64ch] items-start gap-1">
      <p className="min-w-0 pt-2.5 whitespace-pre-line [overflow-wrap:anywhere]">
        {collection.description}
      </p>
      {readOnly ? null : <PencilButton label={t('editDescription')} onClick={start} />}
    </div>
  );
}
