'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@stepler/ui/components/dialog';
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import { Textarea } from '@stepler/ui/components/textarea';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { isApiError } from '@/api/client';
import { createCollection, useInvalidateCollections } from '@/api/collections';
import { errorMessageKey } from '@/errors/error-message';
import {
  type CollectionFormValues,
  collectionFormSchema,
  DESCRIPTION_MAX,
  TITLE_MAX,
  toCollectionRequest,
} from './collection-form';

type CreateCollectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every active slot is used (from `/me/usage`): the dialog explains that instead. */
  atLimit: boolean;
  /** The account's active-collection limit, once usage has loaded. */
  limit: number | undefined;
};

const EMPTY: CollectionFormValues = { title: '', description: '' };

/**
 * "New collection": title and description. At the limit (known from usage, or learned from a
 * 409 when another tab got there first) the form is replaced by the explanation. The submit
 * button is `aria-disabled` while saving, so focus stays inside the dialog. The description's
 * counter is data, so it is Geist Mono under the field on the right (DESIGN-SYSTEM.md §5.2).
 */
export function CreateCollectionDialog({
  open,
  onOpenChange,
  atLimit,
  limit,
}: CreateCollectionDialogProps) {
  const t = useTranslations('collections');
  const tRoot = useTranslations();
  const router = useRouter();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: EMPTY,
  });
  const create = useMutation({
    mutationFn: createCollection,
    onSuccess: async (collection) => {
      toast({ variant: 'success', title: t('create.done') });
      router.push(`/app/collections/${collection.id}`);
      await invalidate();
    },
    // Another tab or a double submit took the last slot: refresh the counter too.
    onError: (error) => {
      if (isApiError(error, 'COLLECTION_LIMIT_REACHED')) void invalidate();
    },
  });

  const limitHit = isApiError(create.error, 'COLLECTION_LIMIT_REACHED');
  const showLimit = atLimit || limitHit;
  const titleError = form.formState.errors.title;
  const descriptionError = form.formState.errors.description;
  const descriptionLength = useWatch({ control: form.control, name: 'description' }).length;
  const failure = isApiError(create.error) && !limitHit ? create.error.code : null;

  const changeOpen = (next: boolean) => {
    if (!next && create.isPending) return;
    if (!next) {
      form.reset(EMPTY);
      create.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        closeLabel={t('create.close')}
        {...(showLimit ? { 'aria-describedby': undefined } : {})}
      >
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          {showLimit ? null : <DialogDescription>{t('create.description')}</DialogDescription>}
        </DialogHeader>
        {showLimit ? (
          <>
            <Alert variant="warning" title={t('limitTitle')}>
              {limit === undefined
                ? tRoot(errorMessageKey('COLLECTION_LIMIT_REACHED'))
                : t('limitReached', { limit })}
            </Alert>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t('create.close')}</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            className="grid gap-5"
            onSubmit={(event) =>
              void form.handleSubmit((values) => {
                if (!create.isPending) create.mutate(toCollectionRequest(values));
              })(event)
            }
          >
            {failure !== null ? (
              <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert>
            ) : null}
            <Field
              id="collection-title"
              label={t('form.title')}
              error={
                titleError === undefined
                  ? undefined
                  : titleError.type === 'too_big'
                    ? t('form.titleTooLong', { max: TITLE_MAX })
                    : t('form.titleRequired')
              }
            >
              {(control) => (
                <Input
                  {...control}
                  autoComplete="off"
                  maxLength={TITLE_MAX}
                  placeholder={t('form.titlePlaceholder')}
                  {...form.register('title')}
                />
              )}
            </Field>
            <Field
              id="collection-description"
              label={
                <>
                  {t('form.description')}{' '}
                  <span className="font-normal text-muted-foreground">{t('form.optional')}</span>
                </>
              }
              description={
                <span className="type-data block text-right">
                  {t('form.counter', { count: descriptionLength, max: DESCRIPTION_MAX })}
                </span>
              }
              error={
                descriptionError === undefined
                  ? undefined
                  : t('form.descriptionTooLong', { max: DESCRIPTION_MAX })
              }
            >
              {(control) => (
                <Textarea
                  {...control}
                  maxLength={DESCRIPTION_MAX}
                  {...form.register('description')}
                />
              )}
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  aria-disabled={create.isPending || undefined}
                >
                  {t('create.cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" aria-disabled={create.isPending || undefined}>
                {create.isPending ? t('create.pending') : t('create.submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
