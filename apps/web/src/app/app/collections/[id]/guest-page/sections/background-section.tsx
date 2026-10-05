'use client';

import type { BackgroundKind, ThemeSettings } from '@stepler/contracts';
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
 * template whose background is its cover offers the cover's controls instead of an image of its
 * own (one reason line, the template's lock).
 */
export function BackgroundSection({ collectionId, editor, def, readOnly }: SectionProps) {
  const t = useTranslations('guestPage.background');
  const tLocks = useTranslations('templates');
  const tCover = useTranslations('guestPage.cover');
  const dimLabelId = useId();
  const { background } = editor.working.settings;
  const { options } = def;
  const set = (next: ThemeSettings['background']) =>
    editor.dispatch({ type: 'settings', patch: { background: next } });

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
          variant="swatches"
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
            };
          })}
        />
      ) : null}
      {background.kind === 'gradient' ? (
        <ChoiceGroup
          label={t('gradients')}
          hideLabel
          variant="swatches"
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
            };
          })}
        />
      ) : null}
      {background.kind === 'image' ? (
        <div className="grid gap-4">
          {/* In a template whose background is its cover (owner remark 73), the cover's own
              controls are here too: the same draft image as in «Обкладинка», so the two never
              disagree. The lock line above already says why. */}
          {options.backgroundImageSource === 'cover' ? (
            <ImageControl
              collectionId={collectionId}
              slot="cover"
              image={currentVersion(editor.editor).cover}
              readOnly={readOnly}
              removeLabel={tCover('remove')}
              onEditor={editor.adopt}
            />
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
                if (dim !== undefined) set({ kind: 'image', dim });
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
