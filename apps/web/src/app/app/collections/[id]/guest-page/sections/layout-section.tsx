'use client';

import type { Align, Corners, CoverPlacement } from '@stepler/contracts';
import { useTranslations } from 'next-intl';
import { currentVersion } from '../editor-state';
import { ChoiceGroup } from '../locked-option';
import { ImageControl } from './image-control';
import type { SectionProps } from './section-props';

const PLACEMENTS: readonly CoverPlacement[] = ['top', 'full', 'side', 'none'];
const ALIGNS: readonly Align[] = ['start', 'center'];
const CORNERS: readonly Corners[] = ['sharp', 'soft', 'round'];

/** A small pictogram of each cover placement (decorative; the label names it). */
function Placement({ kind }: { kind: CoverPlacement }) {
  return (
    <span
      aria-hidden="true"
      className="relative block h-6 w-8 shrink-0 rounded-[3px] border border-current"
    >
      {kind === 'top' ? (
        <span className="absolute inset-x-0.5 top-0.5 h-2 rounded-[2px] bg-current opacity-40" />
      ) : null}
      {kind === 'full' ? (
        <span className="absolute inset-0.5 rounded-[2px] bg-current opacity-40" />
      ) : null}
      {kind === 'side' ? (
        <span className="absolute inset-y-0.5 left-0.5 w-2.5 rounded-[2px] bg-current opacity-40" />
      ) : null}
      {kind === 'none' ? (
        <span className="absolute inset-x-1 top-1.5 h-0.5 bg-current opacity-60" />
      ) : null}
    </span>
  );
}

/**
 * «Розташування»: the cover (owner remark 89: the image and where it goes belong together), its
 * placement (2×2 with pictograms), text alignment and corners. Options the template does not take
 * stay visible, locked, with the template's own reason under the group.
 */
export function LayoutSection({ collectionId, editor, def, readOnly }: SectionProps) {
  const t = useTranslations('guestPage.layout');
  const tCover = useTranslations('guestPage.cover');
  const tTemplates = useTranslations('templates');
  const { settings } = editor.working;
  const reason = (setting: 'coverPlacement' | 'align' | 'corners') => {
    const key = `${def.id}.locks.${setting}`;
    return tTemplates.has(key) ? { lockReason: tTemplates(key) } : {};
  };
  return (
    <div className="grid gap-5">
      <section aria-labelledby="guest-page-cover-heading" className="grid gap-3">
        <h4 id="guest-page-cover-heading" className="text-sm font-semibold">
          {t('cover')}
        </h4>
        <ImageControl
          collectionId={collectionId}
          slot="cover"
          image={currentVersion(editor.editor).cover}
          readOnly={readOnly}
          removeLabel={tCover('remove')}
          onEditor={editor.adopt}
        />
      </section>
      <ChoiceGroup
        label={t('placement')}
        variant="tiles"
        value={settings.coverPlacement}
        readOnly={readOnly}
        onChange={(coverPlacement) =>
          editor.dispatch({ type: 'settings', patch: { coverPlacement } })
        }
        {...reason('coverPlacement')}
        choices={PLACEMENTS.map((value) => ({
          value,
          label: t(`placements.${value}`),
          icon: <Placement kind={value} />,
          locked: !def.options.coverPlacements.includes(value),
        }))}
      />
      <ChoiceGroup
        label={t('align')}
        value={settings.align}
        readOnly={readOnly}
        onChange={(align) => editor.dispatch({ type: 'settings', patch: { align } })}
        {...reason('align')}
        choices={ALIGNS.map((value) => ({
          value,
          label: t(`aligns.${value}`),
          locked: !def.options.aligns.includes(value),
        }))}
      />
      <ChoiceGroup
        label={t('corners')}
        value={settings.corners}
        readOnly={readOnly}
        onChange={(corners) => editor.dispatch({ type: 'settings', patch: { corners } })}
        {...reason('corners')}
        choices={CORNERS.map((value) => ({
          value,
          label: t(`cornerNames.${value}`),
          locked: !def.options.corners.includes(value),
        }))}
      />
    </div>
  );
}
