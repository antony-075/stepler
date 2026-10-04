'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { guestLinkLabelSchema } from '@stepler/contracts';
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
import { useToast } from '@stepler/ui/components/toast';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import { createGuestLink } from '@/api/guest-links';
import { errorMessageKey } from '@/errors/error-message';
import { isValidForm, toPermissions } from '@/guest-links/link-permissions';
import { PermissionFields } from '@/guest-links/permission-fields';

const LABEL_MAX = 60;

const formSchema = z.object({
  label: guestLinkLabelSchema,
  permissions: z
    .object({
      photos: z.boolean(),
      videos: z.boolean(),
      documents: z.boolean(),
      texts: z.boolean(),
      deleteOwn: z.boolean(),
      seeAll: z.boolean(),
    })
    .refine(isValidForm),
});
type CreateValues = z.infer<typeof formSchema>;

// A new link starts like the default one (G3): everything to add, only their own to see.
const DEFAULTS: CreateValues = {
  label: '',
  permissions: {
    photos: true,
    videos: true,
    documents: true,
    texts: true,
    deleteOwn: true,
    seeAll: false,
  },
};

/**
 * «Нове посилання»: a name (only the admin sees it) and what guests can do, the same two
 * questions as on a link's card. Create is `aria-disabled` while saving, so focus stays in the
 * dialog; at the link limit (a 409) the form gives way to the explanation.
 */
export function CreateLinkDialog({
  open,
  onOpenChange,
  collectionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
}) {
  const t = useTranslations('links.create');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('close')}>
        {/* Mounted only while open, so every opening starts empty. */}
        <CreateLinkForm collectionId={collectionId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateLinkForm({ collectionId, onDone }: { collectionId: string; onDone: () => void }) {
  const t = useTranslations('links.create');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const form = useForm<CreateValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
  });
  const create = useMutation({
    mutationFn: (values: CreateValues) =>
      createGuestLink(collectionId, {
        label: values.label,
        permissions: toPermissions(values.permissions),
      }),
    onSuccess: async () => {
      toast({ variant: 'success', title: t('done') });
      onDone();
      await invalidate();
    },
  });
  const limitHit = isApiError(create.error, 'GUEST_LINK_LIMIT_REACHED');
  const failure = isApiError(create.error) && !limitHit ? create.error.code : null;
  const labelError = form.formState.errors.label;

  if (limitHit) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('limitTitle')}</DialogDescription>
        </DialogHeader>
        <Alert variant="warning" title={t('limitTitle')}>
          {tRoot(errorMessageKey('GUEST_LINK_LIMIT_REACHED'))}
        </Alert>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('close')}</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(event) =>
          void form.handleSubmit((values) => {
            if (!create.isPending) create.mutate(values);
          })(event)
        }
      >
        {failure !== null ? <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert> : null}
        <Field
          id="guest-link-label"
          label={t('label')}
          description={t('labelHint', { max: LABEL_MAX })}
          error={
            labelError === undefined
              ? undefined
              : labelError.type === 'too_big'
                ? t('labelTooLong', { max: LABEL_MAX })
                : t('labelRequired')
          }
        >
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              maxLength={LABEL_MAX}
              placeholder={t('labelPlaceholder')}
              {...form.register('label')}
            />
          )}
        </Field>
        <Controller
          control={form.control}
          name="permissions"
          render={({ field }) => <PermissionFields value={field.value} onChange={field.onChange} />}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" aria-disabled={create.isPending || undefined}>
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" aria-disabled={create.isPending || undefined}>
            {create.isPending ? t('pending') : t('submit')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
