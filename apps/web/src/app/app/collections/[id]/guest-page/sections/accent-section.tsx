'use client';

import { ACCENT_PRESETS, hexColorSchema } from '@stepler/contracts';
import { InfoTip } from '@stepler/ui/components/info-tip';
import { Input } from '@stepler/ui/components/input';
import { focusRing } from '@stepler/ui/lib/focus';
import { accentContrast } from '@stepler/templates/core';
import { cn } from '@stepler/ui/lib/utils';
import { AlertTriangle, Check } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { ChoiceGroup } from '../locked-option';
import type { SectionProps } from './section-props';

/** `#?RRGGBB` in any case, as people type it; sent uppercased. */
const HEX_INPUT = /^#?([0-9a-fA-F]{6})$/;

/**
 * «Акцент»: the six presets, «Свій колір» as a hex field whose chip is the system colour picker
 * (owner remark 72), and the contrast hint
 * against the template's background (readability is never at stake: text colours are derived
 * [D3]; the hint says what happens). An invalid colour shows why and is never sent.
 */
export function AccentSection({ editor, def, readOnly }: SectionProps) {
  const t = useTranslations('guestPage.accent');
  const format = useFormatter();
  const fieldId = useId();
  const errorId = useId();
  const { accent } = editor.working.settings;
  const [custom, setCustom] = useState(accent);
  const [invalid, setInvalid] = useState(false);
  // The accent changed elsewhere (a template switch keeps this section mounted): the field
  // follows, unless it already says the same colour as typed.
  const [shown, setShown] = useState(accent);
  if (shown !== accent) {
    setShown(accent);
    if (custom.replace('#', '').toUpperCase() !== accent.slice(1)) {
      setCustom(accent);
      setInvalid(false);
    }
  }
  const preset = ACCENT_PRESETS.find((p) => p.hex === accent);
  const contrast = accentContrast(def, editor.working.settings);
  const ratio = format.number(contrast.ratio, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });

  /** `coalesce`: dragging in the colour picker is one undo step. */
  function choose(hex: string, coalesce?: string) {
    setCustom(hex);
    setInvalid(false);
    editor.dispatch({ type: 'settings', patch: { accent: hex } }, coalesce);
  }

  return (
    <div className="grid gap-4">
      <ChoiceGroup
        label={t('swatches')}
        hideLabel
        variant="swatches"
        value={preset?.hex ?? null}
        readOnly={readOnly}
        onChange={choose}
        choices={ACCENT_PRESETS.map((p) => ({
          value: p.hex,
          label: t(`names.${p.id}`),
          ariaLabel: t('swatch', { name: t(`names.${p.id}`) }),
          swatch: p.hex,
        }))}
      />
      <div className="grid gap-1.5">
        <div className="flex items-center gap-3">
          <label htmlFor={fieldId} className="shrink-0 text-sm font-semibold">
            {t('custom')}
          </label>
          <div className="relative min-w-0 flex-1">
            {/* The chip is the system colour picker: the same colour, chosen by eye. */}
            <input
              type="color"
              aria-label={t('picker')}
              value={accent.toLowerCase()}
              disabled={readOnly}
              onChange={(event) => choose(event.target.value.toUpperCase(), 'accent-picker')}
              className={cn(
                'absolute top-1/2 left-2.5 size-7 -translate-y-1/2 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0',
                '[&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] [&::-webkit-color-swatch-wrapper]:p-0',
                '[&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0',
                focusRing,
              )}
            />
            <Input
              id={fieldId}
              value={custom}
              readOnly={readOnly}
              spellCheck={false}
              autoComplete="off"
              inputMode="text"
              className="pl-12 type-data uppercase"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              onChange={(event) => {
                const value = event.target.value.trim();
                setCustom(value);
                const match = HEX_INPUT.exec(value);
                if (match === null) {
                  setInvalid(value.length >= 6);
                  return;
                }
                const hex = `#${match[1]!.toUpperCase()}`;
                if (!hexColorSchema.safeParse(hex).success) return;
                setInvalid(false);
                editor.dispatch({ type: 'settings', patch: { accent: hex } }, 'accent-hex');
              }}
              onBlur={() => {
                if (!HEX_INPUT.test(custom)) setInvalid(custom !== '');
              }}
            />
          </div>
        </div>
        {invalid ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {t('customInvalid')}
          </p>
        ) : null}
      </div>
      <p
        data-slot="accent-hint"
        data-level={contrast.level}
        className={cn(
          'flex gap-2 text-sm text-pretty',
          contrast.level === 'good' ? 'text-success' : 'text-foreground',
        )}
      >
        {contrast.level === 'good' ? (
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        ) : (
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        )}
        <span className="min-w-0">
          {contrast.level === 'good'
            ? t('good', { ratio })
            : contrast.level === 'small-text'
              ? t('smallText', { ratio, direction: contrast.direction })
              : t('merges', { ratio, direction: contrast.direction })}
        </span>
        <InfoTip text={t('footnote')} />
      </p>
    </div>
  );
}
