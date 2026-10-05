'use client';

// The «Гостьова сторінка» tab (`?tab=appearance`; plan Tasks 14–15, Appendix B, E-editor; ADR 0017;
// DESIGN-SYSTEM.md §6.6). Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design):
// - One job: shape what guests see, and see it while doing so. From 1024px a fixed-height
//   workspace (owner remarks 66–67, 2026-10-05): the settings panel on the sheet as an accordion
//   (Шаблон, Обкладинка, Привітання, Фон, Акцент, Шрифт, Розташування, in the order a guest meets
//   them, then the look), a draggable splitter, and the preview pane on the light table
//   (`--muted`) with the save bar in its header. Only the panel scrolls. Below 1024px the preview
//   is the page and the settings open in a bottom sheet behind «Налаштувати» (phone-editor.tsx).
// - Nothing reaches guests until «Зберегти» [D1]: the save bar says «Чернетка — гості бачать
//   попередню версію» while there is a draft, «Збережено — гості бачать цю версію» after, and the
//   working copy is autosaved into the draft. Admin primary is ink; the pencil only marks the
//   draft (its dot), never an action.
// - Locks are visible text, never a hover-only tooltip: an option the template does not take
//   stays in place, a dashed dimmed tile, `aria-disabled`, with the template's reason under its
//   group (remark 80). Static hints are info tooltips beside their label (remark 79).
// - Archived: everything is shown, read-only, with one notice [A6]; the preview still works.

import type { Collection, GuestPageEditor } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from '@stepler/ui/components/resizable';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { definitionOf } from '@stepler/templates/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { fetchGuestPage, guestPageKey } from '@/api/collections';
import { guestLinksKey, listGuestLinks } from '@/api/guest-links';
import { fetchMe, ME_QUERY_KEY } from '@/api/me';
import { PREVIEW_POLL_MS } from '@/media/previews';
import { currentVersion } from './editor-state';
import { PhoneEditor } from './phone-editor';
import { PreviewPane } from './preview-pane';
import { useHistoryShortcuts } from './history-buttons';
import { SaveBar } from './save-bar';
import type { SectionProps } from './sections/section-props';
import { SettingsAccordion } from './sections/settings-accordion';
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
        className="grid gap-4 lg:grid-cols-[400px_1fr]"
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
  useHistoryShortcuts(editor, !readOnly);

  return (
    <div className="grid gap-4" data-slot="guest-page-editor">
      {readOnly ? <Alert variant="info">{t('archived')}</Alert> : null}
      {desktop ? (
        <DesktopEditor
          props={props}
          saveBar={<SaveBar editor={editor} readOnly={readOnly} layout="panel" />}
          preview={
            <PreviewPane
              collectionId={collection.id}
              page={editor.previewPage}
              templateName={templateName}
              guestUrl={guestUrl}
            />
          }
        />
      ) : (
        <PhoneEditor {...props} />
      )}
    </div>
  );
}

/** The settings panel's least width (px); no most (remark 107): only the preview's minimum. */
const PANEL_MIN = 300;
/**
 * The panel's first width, a share of the workspace (owner remark 104): ~345px on a 14" laptop,
 * more on a wide screen, so the preview gets the room; never under `PANEL_MIN`.
 */
const PANEL_INITIAL = '30%';
/**
 * The preview never gets narrower than this (px): the device scales down to fit, the toolbar
 * folds into «⋯» (remark 107). The library keeps a remembered split within these limits when the
 * window is resized.
 */
const PREVIEW_MIN = 300;
/** Below this the workspace stops shrinking and the page scrolls instead (short windows). */
const WORKSPACE_MIN = 460;

/**
 * The editor on a computer (owner remarks 66, 67): one fixed-height workspace from under the
 * tabs to the window's bottom, so the page itself does not scroll. The settings panel scrolls on
 * its own; the preview pane never scrolls. They are two cards with a 14px gap of page between
 * them, and the gap is the splitter (shadcn/ui Resizable, owner remark 90): arrows resize it from the keyboard; the width is remembered per account in this
 * browser (localStorage, ignored when storage is not available).
 */
function DesktopEditor({
  props,
  saveBar,
  preview,
}: {
  props: SectionProps;
  saveBar: ReactNode;
  preview: ReactNode;
}) {
  const t = useTranslations('guestPage');
  const workspace = useRef<HTMLDivElement>(null);
  const height = useFillViewport(workspace);
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });
  const layout = useDefaultLayout({
    // v3: a new first split (remarks 104, 113); widths remembered before it start over.
    id: `stepler:guest-page-editor:v3:${me.data?.id ?? 'anonymous'}`,
    panelIds: ['settings', 'preview'],
    storage: safeStorage,
  });
  return (
    <div
      ref={workspace}
      data-slot="editor-workspace"
      // Most of the page's bottom padding goes: 16px stay under the workspace.
      className="-mb-16"
      style={{ height }}
    >
      <ResizablePanelGroup
        // Remounted once the account is known, so its remembered width applies.
        key={me.data?.id ?? 'anonymous'}
        orientation="horizontal"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel id="settings" defaultSize={PANEL_INITIAL} minSize={`${PANEL_MIN}px`}>
          <div
            role="region"
            aria-label={t('panelLabel')}
            data-slot="settings-panel"
            // Positioned, so screen-reader-only text inside is clipped here too.
            className="@container/settings relative h-full overflow-y-auto overscroll-contain rounded-sheet border bg-card"
          >
            {/* The save bar: the panel's sticky top bar (owner remark 105). */}
            {saveBar}
            <SettingsAccordion mode="multiple" {...props} />
          </div>
        </ResizablePanel>
        <ResizableHandle gap aria-label={t('splitLabel')} />
        <ResizablePanel id="preview" minSize={`${PREVIEW_MIN}px`}>
          <div className="h-full overflow-hidden rounded-sheet border">{preview}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/** localStorage that never throws (private windows, blocked site data): a missing width is fine. */
const safeStorage = {
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Not remembered this time.
    }
  },
};

/**
 * The height that takes the element from where it starts on the page to the window's bottom edge,
 * less what the page has under it, at least `WORKSPACE_MIN`; follows window resizes and anything
 * above it changing height (a description added, an alert).
 */
function useFillViewport(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(WORKSPACE_MIN);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const top = box.top + window.scrollY;
      // What the page column has under the workspace (its bottom padding), so nothing scrolls.
      const column = element.closest('main')?.getBoundingClientRect();
      const below = column === undefined ? 0 : Math.max(0, Math.ceil(column.bottom - box.bottom));
      setHeight(Math.max(WORKSPACE_MIN, Math.floor(window.innerHeight - top - below)));
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    if (element.parentElement !== null) observer.observe(element.parentElement);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [ref]);
  return height;
}
