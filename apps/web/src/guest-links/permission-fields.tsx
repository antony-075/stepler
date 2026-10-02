'use client';

import { Alert } from '@stepler/ui/components/alert';
import { Checkbox } from '@stepler/ui/components/checkbox';
import { Label } from '@stepler/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@stepler/ui/components/radio-group';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { addsNothing, isValidForm, type PermissionForm } from './link-permissions';

const ADD_OPTIONS = [
  { name: 'photos', label: 'addPhotos' },
  { name: 'videos', label: 'addVideos' },
  { name: 'documents', label: 'addDocuments' },
  { name: 'texts', label: 'addTexts' },
] as const;

/**
 * What guests may do, as two plain questions: what they can add (photos, videos, documents and
 * wishes, each its own box) and what they see (only their own, or what every guest added; each
 * option says what it means). A link where guests can add nothing gets a warning that it is
 * view-only; one that allows nothing at all an inline error (it cannot be saved).
 */
export function PermissionFields({
  value,
  onChange,
}: {
  value: PermissionForm;
  onChange: (next: PermissionForm) => void;
}) {
  const t = useTranslations('links.permissions');
  const seeId = useId();
  const valid = isValidForm(value);

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-semibold">{t('addLegend')}</legend>
        <div className="grid max-w-md sm:grid-cols-2 sm:gap-x-6">
          {ADD_OPTIONS.map(({ name, label }) => (
            <Label key={name} className="min-h-11 gap-3 text-base font-normal">
              <Checkbox
                checked={value[name]}
                onCheckedChange={(checked) => onChange({ ...value, [name]: checked === true })}
                aria-invalid={!valid || undefined}
              />
              {t(label)}
            </Label>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-1">
        <legend id={seeId} className="mb-1 text-sm font-semibold">
          {t('seeLegend')}
        </legend>
        <RadioGroup
          aria-labelledby={seeId}
          value={value.seeAll ? 'all' : 'own'}
          onValueChange={(next) => onChange({ ...value, seeAll: next === 'all' })}
          className="gap-0"
        >
          <RadioGroupItem value="own" className="items-start [&>button]:mt-0.5">
            <span className="grid gap-0.5">
              <span>{t('seeOwn')}</span>
              <span className="text-sm text-muted-foreground">{t('seeOwnHint')}</span>
            </span>
          </RadioGroupItem>
          <RadioGroupItem value="all" className="items-start [&>button]:mt-0.5">
            <span className="grid gap-0.5">
              <span>{t('seeAll')}</span>
              <span className="text-sm text-muted-foreground">{t('seeAllHint')}</span>
            </span>
          </RadioGroupItem>
        </RadioGroup>
      </fieldset>
      {!valid ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-sm leading-[1.45] text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{t('invalid')}</span>
        </p>
      ) : addsNothing(value) ? (
        <Alert variant="warning">{t('viewOnly')}</Alert>
      ) : null}
    </div>
  );
}
