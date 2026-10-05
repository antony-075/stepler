'use client';

// The «Гостьова сторінка» tab (`?tab=appearance`; plan Tasks 14–15, Appendix B, E-editor; ADR 0017;
// DESIGN-SYSTEM.md §6.6). Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design):
// - One job: shape what guests see, and see it while doing so. From 1024px a 380px settings
//   panel on the sheet (Шаблон, Обкладинка, Привітання, Фон, Акцент, Шрифт, Розташування, in the
//   order a guest meets them, then the look) beside the live preview on the light table
//   (`--muted`), which stays in view while the panel scrolls. Below 1024px the preview is the
//   page and the settings open in a bottom sheet behind «Налаштувати» (phone-editor.tsx).
// - Nothing reaches guests until «Зберегти» [D1]: the save bar says «Чернетка — гості бачать
//   попередню версію» while there is a draft, «Збережено — гості бачать цю версію» after, and the
//   working copy is autosaved into the draft. Admin primary is ink; the pencil only marks the
//   draft (its dot), never an action.
// - Locks are visible text, never a hover-only tooltip: an option the template does not take
//   stays in place, dashed and `aria-disabled`, with the template's reason under its group.
// - Only «Класика» exists until PR K: the other five show «Скоро» and cannot be chosen.
// - Archived: everything is shown, read-only, with one notice [A6]; the preview still works.

import type { Collection, GuestPageEditor } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { definitionOf } from '@stepler/templates/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { fetchGuestPage, guestPageKey } from '@/api/collections';
import { guestLinksKey, listGuestLinks } from '@/api/guest-links';
import { PREVIEW_POLL_MS } from '@/media/previews';
import { currentVersion } from './editor-state';
import { PhoneEditor } from './phone-editor';
import { PreviewPane } from './preview-pane';
import { SaveBar } from './save-bar';
import type { SectionProps } from './sections/section-props';
import { Sections } from './sections/section-list';
import { useGuestPageEditor } from './use-guest-page-editor';

const DESKTOP = '(min-width: 1024px)';

/** Whether the desktop layout applies; on the server (never rendered there) the desktop one. */
function useDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

/** Whether an image of the version the editor shows is still being prepared. */
const preparing = (editor: GuestPageEditor | undefined) => {
  if (editor === undefined) return false;
  const version = currentVersion(editor);
  return version.cover?.status === 'PENDING' || version.background?.status === 'PENDING';
};

export function GuestPageTab({ collection }: { collection: Collection }) {
  const t = useTranslations('guestPage');
  const query = useQuery({
    queryKey: guestPageKey(collection.id),
    queryFn: () => fetchGuestPage(collection.id),
    // While a new image is being prepared, ask again every 10 s (paused in the background).
    refetchInterval: (q) => (preparing(q.state.data) ? PREVIEW_POLL_MS : false),
  });
  if (query.data === undefined) {
    if (query.isError) {
      return (
        <Alert
          variant="error"
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      );
    }
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={t('loading')}
        className="grid gap-4 lg:grid-cols-[380px_1fr]"
      >
        <Skeleton className="h-[32rem] w-full rounded-sheet" />
        <Skeleton className="hidden h-[32rem] w-full rounded-sheet lg:block" />
      </div>
    );
  }
  return <Editor collection={collection} initial={query.data} />;
}

function Editor({ collection, initial }: { collection: Collection; initial: GuestPageEditor }) {
  const t = useTranslations('guestPage');
  const tTemplates = useTranslations('templates');
  const desktop = useDesktop();
  const editor = useGuestPageEditor(collection.id, initial);
  const readOnly = collection.status === 'ARCHIVED';
  const def = definitionOf(editor.working.templateId) ?? definitionOf('classic')!;
  const links = useQuery({
    queryKey: guestLinksKey(collection.id),
    queryFn: () => listGuestLinks(collection.id),
  });
  const guestUrl =
    links.data?.items.find((link) => link.isDefault && link.status !== 'REVOKED')?.url ?? null;
  const templateName = tTemplates.has(`${def.id}.name`) ? tTemplates(`${def.id}.name`) : def.id;
  const props: SectionProps = { collectionId: collection.id, editor, def, readOnly };

  return (
    <div className="grid gap-4" data-slot="guest-page-editor">
      {readOnly ? <Alert variant="info">{t('archived')}</Alert> : null}
      {desktop ? (
        <div className="grid grid-cols-[380px_minmax(0,1fr)] overflow-clip rounded-sheet border bg-card">
          <div
            role="region"
            aria-label={t('panelLabel')}
            className="flex min-w-0 flex-col border-r"
          >
            <Sections {...props} />
            <SaveBar editor={editor} readOnly={readOnly} className="sticky bottom-0 mt-auto" />
          </div>
          <PreviewPane
            collectionId={collection.id}
            page={editor.previewPage}
            templateName={templateName}
            guestUrl={guestUrl}
          />
        </div>
      ) : (
        <PhoneEditor {...props} templateName={templateName} />
      )}
    </div>
  );
}
