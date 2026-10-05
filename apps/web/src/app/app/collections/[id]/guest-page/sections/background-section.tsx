'use client';

import type { BackgroundKind, ThemeSettings } from '@stepler/contracts';
import { bestTextOn } from '@stepler/templates/core';
import { Button } from '@stepler/ui/components/button';
import { Slider } from '@stepler/ui/components/slider';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { currentVersion } from '../editor-state';
import { ChoiceGroup } from '../locked-option';
import { ImageControl } from './image-control';
import type { SectionProps } from './section-props';

const KINDS: readonly BackgroundKind[] = ['solid', 'gradient', 'image'];

/**
 * «Фон»: the kind (Колір / Градієнт / Зображення; the ones the template does not take are locked
 * with its reason), then the template's colours or gradients as swatches, or the image with its
 * «Затемнення» slider, which starts where text still reads on any picture (`imageDim.min`). A
 * template whose background is its cover points to the cover in «Розташування» instead of an
 * image of its own (one reason line, the template's lock).
 */
export function BackgroundSection({
  collectionId,
  editor,
  def,
  readOnly,
  openSection,
}: SectionProps) {
  const t = useTranslations('guestPage.background');
  const tLocks = useTranslations('templates');
  const dimLabelId = useId();
  const { background } = editor.working.settings;
  const { options } = def;
  const sampleOn = (color: string) => ({
    ink: bestTextOn(color),
    accent: editor.working.settings.accent,
    text: t('sampleText'),
  });
  /** `coalesce`: a dimming drag is one undo step. */
  const set = (next: ThemeSettings['background'], coalesce?: string) =>
    editor.dispatch({ type: 'settings', patch: { background: next } }, coalesce);

  function switchTo(kind: BackgroundKind) {
    if (kind === background.kind) return;
    if (kind === 'solid') set({ kind, color: options.swatches[0] ?? def.defaults.accent });
    else if (kind === 'gradient') set({ kind, preset: options.gradients[0]?.id ?? 'mist' });
    else set({ kind, dim: Math.min(options.imageDim.max, Math.max(options.imageDim.min, 60)) });
  }

  const lockKey = `${def.id}.locks.background`;
  return (
    <div className="grid gap-4">
      <ChoiceGroup
        label={t('kind')}
        hideLabel
        value={background.kind}
        readOnly={readOnly}
        onChange={switchTo}
        {...(tLocks.has(lockKey) ? { lockReason: tLocks(lockKey) } : {})}
        choices={KINDS.map((kind) => ({
          value: kind,
          label: t(kind),
          locked: !options.backgroundKinds.includes(kind),
        }))}
      />
      {background.kind === 'solid' ? (
        <ChoiceGroup
          label={t('swatches')}
          hideLabel
          variant="backgrounds"
          value={background.color}
          readOnly={readOnly}
          onChange={(color) => set({ kind: 'solid', color })}
          choices={options.swatches.map((color) => {
            const key = `colors.${color.slice(1)}`;
            const name = t.has(key) ? t(key) : color;
            return {
              value: color,
              label: name,
              ariaLabel: t('swatch', { name }),
              swatch: color,
              sample: sampleOn(color),
            };
          })}
        />
      ) : null}
      {background.kind === 'gradient' ? (
        <ChoiceGroup
          label={t('gradients')}
          hideLabel
          variant="backgrounds"
          value={background.preset}
          readOnly={readOnly}
          onChange={(preset) => set({ kind: 'gradient', preset })}
          choices={options.gradients.map((gradient) => {
            const key = `gradientNames.${gradient.id}`;
            const name = t.has(key) ? t(key) : gradient.id;
            return {
              value: gradient.id,
              label: name,
              ariaLabel: t('swatch', { name }),
              swatch: `linear-gradient(${gradient.angle}deg, ${gradient.stops[0]}, ${gradient.stops[1]})`,
              sample: sampleOn(gradient.stops[0]),
            };
          })}
        />
      ) : null}
      {background.kind === 'image' ? (
        <div className="grid gap-4">
          {/* In a template whose background is its cover (owner remarks 73, 89) the cover's
              controls live once, in «Розташування»: here a line that says so and opens it. The
              lock line above already says why. */}
          {options.backgroundImageSource === 'cover' ? (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>{t('coverInLayout')}</span>
              {openSection === undefined ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 text-link pointer-coarse:min-h-11"
                  onClick={() => openSection('layout')}
                >
                  {t('openLayout')}
                </Button>
              )}
            </p>
          ) : (
            <ImageControl
              collectionId={collectionId}
              slot="background"
              image={currentVersion(editor.editor).background}
              readOnly={readOnly}
              removeLabel={t('remove')}
              onEditor={editor.adopt}
            />
          )}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_4ch] items-center gap-3">
            <span id={dimLabelId} className="text-sm font-semibold">
              {t('dim')}
            </span>
            <Slider
              min={options.imageDim.min}
              max={options.imageDim.max}
              step={1}
              value={[background.dim]}
              disabled={readOnly}
              aria-labelledby={dimLabelId}
              thumbLabel={t('dim')}
              getAriaValueText={(value) => t('dimValue', { value })}
              onValueChange={([dim]) => {
                if (dim !== undefined) set({ kind: 'image', dim }, 'dim');
              }}
            />
            <span className="text-right type-data text-sm tabular-nums">
              {t('dimValue', { value: background.dim })}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
