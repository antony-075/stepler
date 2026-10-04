'use client';

import { Alert } from '@stepler/ui/components/alert';
import { Checkbox } from '@stepler/ui/components/checkbox';
import { Label } from '@stepler/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@stepler/ui/components/radio-group';
import { Switch } from '@stepler/ui/components/switch';
import { cn } from '@stepler/ui/lib/utils';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { addsNothing, isValidForm, normalizeForm, type PermissionForm } from './link-permissions';
import { ADD_TYPES } from './permission-types';

type FieldsProps = {
  value: PermissionForm;
  onChange: (next: PermissionForm) => void;
};

// A tile and a radio card share one look (owner reference 2026-10-02): a sheet-coloured box
// with a 1px edge that turns `--foreground` when chosen (as a selected filter chip), so the
// choice reads from the edge and the control, never from colour alone. The whole box is the
// label, so it is the touch target.
const BOX =
  'rounded-sheet border bg-card transition-[border-color] duration-(--duration-fast) hover:border-input has-[[data-state=checked]]:border-foreground motion-reduce:transition-none';

/**
 * What guests may add (owner 2026-10-02: photos, videos, documents and wishes, each on its
 * own): four tiles, 2×2 from `sm` (one column on phones), each an icon, the type, a muted line
 * on what it means and a checkbox on the right. The checkbox is named by the type and described
 * by the line.
 */
export function AddPermissionTiles({
  value,
  onChange,
  legend,
  legendClassName,
}: FieldsProps & { legend: string; legendClassName?: string }) {
  const t = useTranslations('links.permissions');
  const id = useId();
  const invalid = !isValidForm(value);
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className={cn('mb-3 text-sm font-semibold', legendClassName)}>{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {ADD_TYPES.map(({ name, icon: Icon }) => (
          <Label
            key={name}
            className={cn(
              BOX,
              'min-h-16 cursor-pointer gap-3 px-3.5 py-3 text-base leading-normal font-normal',
            )}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span id={`${id}-${name}`} className="font-semibold">
                {t(`type.${name}.title`)}
              </span>
              <span
                id={`${id}-${name}-hint`}
                className="text-sm leading-[1.4] text-muted-foreground"
              >
                {t(`type.${name}.hint`)}
              </span>
            </span>
            <Checkbox
              checked={value[name]}
              onCheckedChange={(checked) =>
                onChange(normalizeForm({ ...value, [name]: checked === true }))
              }
              aria-labelledby={`${id}-${name}`}
              aria-describedby={`${id}-${name}-hint`}
              aria-invalid={invalid || undefined}
            />
          </Label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * «Гості можуть видаляти своє» [C15]: a switch row under the tiles. Deleting one's own needs
 * something to add (ADR 0007), so with nothing to add the switch is off and disabled, and the
 * line under it says why instead of what it means.
 */
export function DeleteOwnToggle({
  value,
  onChange,
  className,
}: FieldsProps & { className?: string }) {
  const t = useTranslations('links.permissions.deleteOwn');
  const id = useId();
  const blocked = addsNothing(value);
  return (
    <Label
      data-slot="delete-own"
      className={cn(
        BOX,
        'min-h-16 gap-3 px-3.5 py-3 text-base leading-normal font-normal',
        blocked ? 'cursor-not-allowed hover:border-border' : 'cursor-pointer',
        className,
      )}
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span id={`${id}-title`} className="font-semibold">
          {t('title')}
        </span>
        <span id={`${id}-hint`} className="text-sm leading-[1.4] text-muted-foreground">
          {blocked ? t('disabled') : t('hint')}
        </span>
      </span>
      <Switch
        checked={value.deleteOwn && !blocked}
        disabled={blocked}
        onCheckedChange={(checked) => onChange({ ...value, deleteOwn: checked })}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
      />
    </Label>
  );
}

const SEE_OPTIONS = [
  { value: 'own', title: 'seeOwn', hint: 'seeOwnHint' },
  { value: 'all', title: 'seeAll', hint: 'seeAllHint' },
] as const;

/** Whose content guests see: two radio cards, each saying what it means. */
export function SeePermissionCards({
  value,
  onChange,
  legend,
  legendClassName,
}: FieldsProps & { legend: string; legendClassName?: string }) {
  const t = useTranslations('links.permissions');
  const legendId = useId();
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend id={legendId} className={cn('mb-3 text-sm font-semibold', legendClassName)}>
        {legend}
      </legend>
      <RadioGroup
        aria-labelledby={legendId}
        value={value.seeAll ? 'all' : 'own'}
        onValueChange={(next) => onChange({ ...value, seeAll: next === 'all' })}
        className="gap-3"
      >
        {SEE_OPTIONS.map(({ value: option, title, hint }) => (
          <RadioGroupItem
            key={option}
            value={option}
            className={cn(BOX, 'items-start px-3.5 py-3 [&>button]:mt-0.5')}
          >
            <span className="grid gap-0.5">
              <span className="font-semibold">{t(title)}</span>
              <span className="text-sm leading-[1.4] text-muted-foreground">{t(hint)}</span>
            </span>
          </RadioGroupItem>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

/**
 * What the current answers mean as a whole: an inline error when guests would have nothing to
 * do (it cannot be saved), a warning when the link is view-only, otherwise nothing.
 */
export function PermissionNotice({
  value,
  className,
}: {
  value: PermissionForm;
  className?: string;
}) {
  const t = useTranslations('links.permissions');
  if (!isValidForm(value)) {
    return (
      <p
        role="alert"
        className={cn(
          'flex items-start gap-1.5 text-sm leading-[1.45] text-destructive',
          className,
        )}
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">{t('invalid')}</span>
      </p>
    );
  }
  if (addsNothing(value)) {
    return (
      <Alert variant="warning" className={className}>
        {t('viewOnly')}
      </Alert>
    );
  }
  return null;
}

/** Both questions stacked, for the «Нове посилання» dialog. */
export function PermissionFields({ value, onChange }: FieldsProps) {
  const t = useTranslations('links.permissions');
  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <AddPermissionTiles value={value} onChange={onChange} legend={t('addLegend')} />
        <DeleteOwnToggle value={value} onChange={onChange} />
      </div>
      <SeePermissionCards value={value} onChange={onChange} legend={t('seeLegend')} />
      <PermissionNotice value={value} />
    </div>
  );
}
