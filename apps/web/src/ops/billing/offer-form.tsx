'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { OperatorOffer } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Checkbox } from '@stepler/ui/components/checkbox';
import { Field } from '@stepler/ui/components/field';
import { Input } from '@stepler/ui/components/input';
import { Label } from '@stepler/ui/components/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stepler/ui/components/select';
import { Textarea } from '@stepler/ui/components/textarea';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  formValuesOf,
  type LimitField,
  limitFieldsOf,
  OFFER_CODE,
  offerFormSchema,
  type OfferFormValues,
} from './offer-fields';

const KINDS = ['PACK', 'PACK_EXTENSION', 'SUBSCRIPTION'] as const;
const EXTENSIONS = ['WINDOW', 'RETENTION', 'STORAGE'] as const;

const GB_ERROR = 'gbError';
const NUMBER_ERROR = 'numberError';
const DECIMAL = 'decimal';
const NUMERIC = 'numeric';
const GB_FIELDS: ReadonlySet<LimitField> = new Set(['storage', 'collectionStorage']);

/**
 * The offer's editable part (plan Task 20): titles, descriptions, order, «Найпопулярніший», the
 * limits its kind carries (GB for storage, whole numbers otherwise) and the fiscal item code. A
 * new offer also picks its code, kind and what it extends (never editable later). Saving asks
 * for a reason (the caller's reason dialog); a database rule the limits break comes back as
 * `error` and is shown above the button.
 */
export function OfferForm({
  offer,
  error,
  onSubmit,
}: {
  /** `null` = a new offer. */
  offer: OperatorOffer | null;
  error: string | null;
  onSubmit: (values: OfferFormValues, fields: readonly LimitField[]) => void;
}) {
  const t = useTranslations('ops.offers.form');
  const creating = offer === null;
  const form = useForm<OfferFormValues>({
    resolver: zodResolver(offerFormSchema),
    defaultValues: formValuesOf(offer),
  });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const extension = useWatch({ control: form.control, name: 'extension' });
  const fields = limitFieldsOf(
    offer?.kind ?? kind,
    offer === null ? (kind === 'PACK_EXTENSION' ? extension : null) : offer.extension,
  );
  const errors = form.formState.errors;

  const submit = form.handleSubmit((values) => {
    if (creating && !OFFER_CODE.test(values.code)) {
      form.setError('code', { type: 'pattern' }, { shouldFocus: true });
      return;
    }
    onSubmit(values, fields);
  });

  return (
    <form noValidate className="grid gap-6" onSubmit={(event) => void submit(event)}>
      {creating ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            id="offer-code"
            label={t('code')}
            description={t('codeHelp')}
            error={errors.code === undefined ? undefined : t('codeError')}
          >
            {(control) => (
              <Input
                {...control}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                {...form.register('code')}
              />
            )}
          </Field>
          <div className="grid content-start gap-1.5">
            <Label id="offer-kind">{t('kind')}</Label>
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <KindSelect labelledBy="offer-kind" value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          {kind === 'PACK_EXTENSION' ? (
            <div className="grid content-start gap-1.5">
              <Label id="offer-extension">{t('extension')}</Label>
              <Controller
                control={form.control}
                name="extension"
                render={({ field }) => (
                  <ExtensionSelect
                    labelledBy="offer-extension"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id="offer-title-uk"
          label={t('titleUk')}
          error={errors.titleUk === undefined ? undefined : t('titleError')}
        >
          {(control) => <Input {...control} {...form.register('titleUk')} />}
        </Field>
        <Field
          id="offer-title-en"
          label={t('titleEn')}
          error={errors.titleEn === undefined ? undefined : t('titleError')}
        >
          {(control) => <Input {...control} {...form.register('titleEn')} />}
        </Field>
        <Field
          id="offer-description-uk"
          label={t('descriptionUk')}
          description={t('descriptionHelp')}
        >
          {(control) => <Textarea {...control} rows={2} {...form.register('descriptionUk')} />}
        </Field>
        <Field
          id="offer-description-en"
          label={t('descriptionEn')}
          description={t('descriptionHelp')}
        >
          {(control) => <Textarea {...control} rows={2} {...form.register('descriptionEn')} />}
        </Field>
        <Field
          id="offer-rank"
          label={t('rank')}
          description={t('rankHelp')}
          error={errors.rank === undefined ? undefined : t('numberError')}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              className="md:max-w-32"
              {...form.register('rank')}
            />
          )}
        </Field>
        <div className="flex min-h-11 items-center gap-2.5 md:self-end">
          <Controller
            control={form.control}
            name="highlighted"
            render={({ field }) => (
              <Checkbox
                id="offer-highlighted"
                checked={field.value}
                onCheckedChange={(value) => field.onChange(value === true)}
              />
            )}
          />
          <Label htmlFor="offer-highlighted" className="font-normal">
            {t('highlight')}
          </Label>
        </div>
      </div>

      {fields.length === 0 ? null : (
        <fieldset className="grid gap-3">
          <legend className="type-h3 mb-1">{t('limitsTitle')}</legend>
          <p className="text-[0.875rem] text-muted-foreground">{t('limitsHelp')}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => (
              <Field
                key={field}
                id={`offer-${field}`}
                label={t(field)}
                error={
                  errors[field] === undefined
                    ? undefined
                    : t(GB_FIELDS.has(field) ? GB_ERROR : NUMBER_ERROR)
                }
              >
                {(control) => (
                  <Input
                    {...control}
                    inputMode={GB_FIELDS.has(field) ? DECIMAL : NUMERIC}
                    className="tabular-nums"
                    {...form.register(field)}
                  />
                )}
              </Field>
            ))}
          </div>
        </fieldset>
      )}

      <Field id="offer-rro" label={t('rroItemId')} description={t('rroHelp')}>
        {(control) => (
          <Input {...control} className="font-mono md:max-w-sm" {...form.register('rroItemId')} />
        )}
      </Field>

      {error === null ? null : <Alert variant="error">{error}</Alert>}
      <div>
        <Button type="submit">{creating ? t('createButton') : t('save')}</Button>
      </div>
    </form>
  );
}

function KindSelect({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string;
  value: (typeof KINDS)[number];
  onChange: (value: string) => void;
}) {
  const t = useTranslations('ops.offers');
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-labelledby={labelledBy} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {KINDS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {t(`kindOne.${kind}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ExtensionSelect({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string;
  value: (typeof EXTENSIONS)[number];
  onChange: (value: string) => void;
}) {
  const t = useTranslations('ops.offers');
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-labelledby={labelledBy} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {EXTENSIONS.map((extension) => (
            <SelectItem key={extension} value={extension}>
              {t(`extensions.${extension}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
