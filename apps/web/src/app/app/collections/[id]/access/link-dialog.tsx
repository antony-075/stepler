'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type GuestLink, guestLinkLabelSchema } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Checkbox } from '@stepler/ui/components/checkbox';
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
import { Label } from '@stepler/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@stepler/ui/components/radio-group';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { isApiError } from '@/api/client';
import { useInvalidateCollections } from '@/api/collections';
import { createGuestLink, updateGuestLink } from '@/api/guest-links';
import { errorMessageKey } from '@/errors/error-message';
import {
  fromPermissions,
  isValidForm,
  type PermissionForm,
  toPermissions,
} from '@/guest-links/link-permissions';

const LABEL_MAX = 60;

type LinkDialogMode = { kind: 'create'; collectionId: string } | { kind: 'edit'; link: GuestLink };

type LinkFormValues = PermissionForm & { label: string };

const ADD_OPTIONS = [
  { name: 'uploads', label: 'addFiles' },
  { name: 'texts', label: 'addTexts' },
] as const;

// The default link has no label (it is «Гостьове посилання» everywhere).
const formSchema = (withLabel: boolean) =>
  z
    .object({
      label: withLabel ? guestLinkLabelSchema : z.string(),
      uploads: z.boolean(),
      texts: z.boolean(),
      seeAll: z.boolean(),
    })
    .refine(isValidForm, { message: 'NO_CAPABILITY', path: ['root'] });

/**
 * Create an additional link (label + permissions) or change a link's access. Two plain questions
 * instead of four flags (plan, "Deliberate choices"): what guests may add (two checkboxes) and
 * whose frames they see (two radios). Both boxes unchecked with «Лише свої» leaves guests nothing,
 * so it is an inline error, not a disabled button. Save is `aria-disabled` while pending (focus
 * stays in the dialog). At the link limit (a 409) the form gives way to the explanation.
 */
export function LinkDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: LinkDialogMode;
}) {
  const t = useTranslations('access.dialog');
  const create = mode.kind === 'create';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('close')}>
        {/* Mounted only while open, so every opening starts from the link's current values. */}
        <LinkForm mode={mode} onDone={() => onOpenChange(false)} create={create} />
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  mode,
  create,
  onDone,
}: {
  mode: LinkDialogMode;
  create: boolean;
  onDone: () => void;
}) {
  const t = useTranslations('access.dialog');
  const tPermissions = useTranslations('access.permissions');
  const tRoot = useTranslations();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const seeLegendId = useId();
  const existing = mode.kind === 'edit' ? mode.link : null;
  const withLabel = existing === null || !existing.isDefault;
  const form = useForm<LinkFormValues>({
    resolver: zodResolver(formSchema(withLabel)),
    defaultValues: {
      label: existing?.label ?? '',
      ...(existing === null
        ? { uploads: true, texts: true, seeAll: false }
        : fromPermissions(existing.permissions)),
    },
  });

  const save = useMutation({
    mutationFn: (values: LinkFormValues) => {
      const permissions = toPermissions(values);
      if (mode.kind === 'create') {
        return createGuestLink(mode.collectionId, { label: values.label, permissions });
      }
      const labelChanged = withLabel && values.label !== mode.link.label;
      return updateGuestLink(mode.link.id, {
        permissions,
        ...(labelChanged ? { label: values.label } : {}),
      });
    },
    onSuccess: async () => {
      toast({ variant: 'success', title: create ? t('createdToast') : t('savedToast') });
      onDone();
      await invalidate();
    },
  });

  const limitHit = isApiError(save.error, 'GUEST_LINK_LIMIT_REACHED');
  const failure = isApiError(save.error) && !limitHit ? save.error.code : null;
  const labelError = form.formState.errors.label;
  // Live after the first submit, so the message goes as soon as the choice is fixed.
  const [uploads, texts, seeAll] = useWatch({
    control: form.control,
    name: ['uploads', 'texts', 'seeAll'],
  });
  const invalid = form.formState.isSubmitted && !isValidForm({ uploads, texts, seeAll });

  if (limitHit) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
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
        <DialogTitle>{create ? t('createTitle') : t('editTitle')}</DialogTitle>
        <DialogDescription>
          {create ? t('createDescription') : t('editDescription')}
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(event) =>
          void form.handleSubmit((values) => {
            if (!save.isPending) save.mutate(values);
          })(event)
        }
      >
        {failure !== null ? <Alert variant="error">{tRoot(errorMessageKey(failure))}</Alert> : null}
        {withLabel ? (
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
        ) : null}
        <fieldset className="grid">
          <legend className="mb-1 text-sm font-semibold">{tPermissions('addLegend')}</legend>
          {ADD_OPTIONS.map(({ name, label }) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <Label className="min-h-11 gap-3 text-base font-normal">
                  <Checkbox
                    ref={field.ref}
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    onBlur={field.onBlur}
                    aria-invalid={invalid || undefined}
                  />
                  {tPermissions(label)}
                </Label>
              )}
            />
          ))}
        </fieldset>
        <fieldset className="grid">
          <legend id={seeLegendId} className="mb-1 text-sm font-semibold">
            {tPermissions('seeLegend')}
          </legend>
          <Controller
            control={form.control}
            name="seeAll"
            render={({ field }) => (
              <RadioGroup
                aria-labelledby={seeLegendId}
                value={field.value ? 'all' : 'own'}
                onValueChange={(value) => field.onChange(value === 'all')}
                className="gap-0"
              >
                <RadioGroupItem value="all">{tPermissions('seeAll')}</RadioGroupItem>
                <RadioGroupItem value="own">{tPermissions('seeOwn')}</RadioGroupItem>
              </RadioGroup>
            )}
          />
        </fieldset>
        {invalid ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-sm leading-[1.45] text-destructive"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{tPermissions('invalid')}</span>
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" aria-disabled={save.isPending || undefined}>
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" aria-disabled={save.isPending || undefined}>
            {save.isPending
              ? create
                ? t('creating')
                : t('saving')
              : create
                ? t('create')
                : t('save')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
