'use client';

import { useTranslations } from 'next-intl';
import { currentVersion } from '../editor-state';
import { ImageControl } from './image-control';
import type { SectionProps } from './section-props';

/** «Обкладинка»: the draft's cover (the published one until the draft changes it). */
export function CoverSection({ collectionId, editor, readOnly }: SectionProps) {
  const t = useTranslations('guestPage.cover');
  return (
    <ImageControl
      collectionId={collectionId}
      slot="cover"
      image={currentVersion(editor.editor).cover}
      readOnly={readOnly}
      removeLabel={t('remove')}
      onEditor={editor.adopt}
    />
  );
}
