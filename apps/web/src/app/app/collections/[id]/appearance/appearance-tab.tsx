'use client';

// The collection's «Гостьова сторінка» tab (`?tab=appearance`; plan Task 10, [A5], [A6]; DESIGN-SYSTEM.md
// §6.6, §6.8). Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design):
// - Two numbered section cards like «Параметри колекції» (same `SectionCard`, the same left edge and
//   width): 1 «Обкладинка», 2 «Привітання для гостей», in the order guests meet them (the
//   picture, then the words above their button). No live preview of the whole guest page: the
//   cover is shown at the phone's hero ratio (16:10), which is what most guests see.
// - The cover's box never moves between states; status lines sit beside it (under it on
//   phones), actions after them, full width on phones (44px), in a row from `sm`. Admin primary
//   is ink («Завантажити зображення»), the rest outline; removing is a quiet red ghost that asks.
// - A cover still being prepared (HEIC takes longest) shows «Готується обкладинка…» and the
//   tab asks for the collection every 10 s while it is visible, for at most 30 minutes.
// - «Вибрати з кадрів» opens `CoverPicker` (a bottom sheet on phones, a dialog from 640px).
// - Archived: everything is shown as it is, with one notice instead of the actions [A6].

import type { Collection } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { collectionKey, fetchCollection } from '@/api/collections';
import { PREVIEW_POLL_MS, PREVIEW_WAIT_MS } from '@/media/previews';
import { SectionCard } from '../section-card';
import { CoverCard } from './cover-card';
import { CoverPicker } from './cover-picker';
import { useSetCoverFromFrame } from './use-set-cover';
import { WelcomeForm } from './welcome-form';

export function AppearanceTab({ collection }: { collection: Collection }) {
  const t = useTranslations('appearance');
  const readOnly = collection.status === 'ARCHIVED';
  const [picking, setPicking] = useState(false);
  const setCover = useSetCoverFromFrame(collection.id);
  useCoverPolling(collection);

  return (
    <div className="grid min-w-0 gap-6">
      {readOnly ? <Alert variant="info">{t('archived')}</Alert> : null}
      <SectionCard number={1} id="appearance-cover" title={t('cover.title')}>
        <CoverCard
          collection={collection}
          readOnly={readOnly}
          onPickFrame={() => setPicking(true)}
        />
        {readOnly ? null : (
          <CoverPicker
            collectionId={collection.id}
            open={picking}
            onOpenChange={setPicking}
            onPicked={setCover}
          />
        )}
      </SectionCard>
      <SectionCard number={2} id="appearance-welcome" title={t('welcome.title')}>
        <WelcomeForm collection={collection} readOnly={readOnly} />
      </SectionCard>
    </div>
  );
}

/**
 * While the cover is `PENDING`, refetch the collection every 10 s (only while the tab is
 * visible: TanStack Query pauses intervals in the background), for at most 30 minutes.
 */
function useCoverPolling(collection: Collection) {
  // When this tab first saw the cover pending; the interval callback runs outside render.
  const since = useRef<number | null>(null);
  useQuery({
    queryKey: collectionKey(collection.id),
    queryFn: () => fetchCollection(collection.id),
    refetchInterval: (query) => {
      if (query.state.data?.cover?.status !== 'PENDING') {
        since.current = null;
        return false;
      }
      const now = Date.now();
      since.current ??= now;
      return now - since.current < PREVIEW_WAIT_MS ? PREVIEW_POLL_MS : false;
    },
  });
}
