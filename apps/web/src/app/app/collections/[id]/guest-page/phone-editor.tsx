'use client';

// The guest page editor below 1024px (plan Task 15, Appendix B «Phone», E-editor-phone). Design
// pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - The preview is the page: a 390px guest page scaled to the width (at most 0.7) in the ink
//   bezel, centred, with a chip «Чернетка» / «Збережено» over its top edge, so the state is in
//   view without opening anything. No device toggle: on a phone the phone view is the one to judge.
// - «Налаштувати» is a 52px ink pill fixed in the thumb zone, with the apricot dot while there are
//   changes guests do not see (said as «, є незбережені зміни»). The page leaves room under it.
// - It opens a bottom sheet (at most 544px and 85svh, the preview still showing above it on a
//   phone; the scrim and Escape close it, focus returns to the pill). The sheet keeps its header
//   and the save bar (48px buttons) fixed and scrolls only the accordion between them.
// - The accordion: one section open at a time, «Шаблон» first. Each row is `h3 > button` with
//   `aria-expanded`, 56px tall, the section's name and its current value as a summary, so the
//   owner can read the whole page's settings with every row closed.
// - Touch sizes from Appendix B come from the sections themselves (`pointer-coarse`).

import { ACCENT_PRESETS, codePointLength, WELCOME_MESSAGE_MAX_CHARS } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@stepler/ui/components/sheet';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useRef, useState } from 'react';
import { currentVersion } from './editor-state';
import { PreviewFrame } from './preview-pane';
import { SaveBar } from './save-bar';
import { SECTION_IDS, SectionBody, type SectionId } from './sections/section-list';
import type { SectionProps } from './sections/section-props';

/** The bottom sheet stays a bottom sheet on tablets too (the shared one turns into a dialog). */
const SHEET =
  'h-[min(544px,85svh)] max-h-[85svh] sm:top-auto sm:bottom-0 sm:w-full sm:translate-y-0 sm:rounded-none sm:rounded-t-dialog sm:border-x-0 sm:border-b-0 sm:pb-[env(safe-area-inset-bottom)]';

const CHIP = {
  saved: 'bg-[#2C7350]',
  draft: 'bg-[#B83E26]',
} as const;

export function PhoneEditor(props: SectionProps & { templateName: string }) {
  const t = useTranslations('guestPage');
  const { editor, readOnly, collectionId } = props;
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId | null>('template');
  const summaries = useSummaries(props);
  const chip = editor.status === 'saved' ? 'saved' : 'draft';

  return (
    <div className="grid gap-4 pb-24" data-slot="phone-editor">
      <div
        role="region"
        aria-label={t('phone.previewLabel')}
        className="relative grid rounded-sheet bg-muted px-4 pt-10 pb-6"
      >
        <span
          data-slot="preview-chip"
          className="absolute top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm font-semibold shadow-sm"
        >
          <span aria-hidden="true" className={cn('size-2 rounded-full', CHIP[chip])} />
          {chip === 'saved' ? t('phone.chipSaved') : t('phone.chipDraft')}
        </span>
        <div className="h-[min(608px,calc(100svh-12rem))] min-h-[22rem]">
          <PreviewFrame collectionId={collectionId} page={editor.previewPage} device="phone" />
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          data-slot="phone-editor-open"
          onClick={() => setOpen(true)}
          className={cn(
            'fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-(--z-sticky) inline-flex h-13 -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-lg',
            focusRing,
          )}
        >
          <SlidersHorizontal aria-hidden="true" className="size-5" />
          {t('phone.open')}
          {editor.dirty ? (
            <>
              <span
                aria-hidden="true"
                className="absolute top-1 right-2 size-2 rounded-full bg-[#F08766]"
              />
              <span className="sr-only">{t('actions.saveDirty')}</span>
            </>
          ) : null}
        </button>
        <SheetContent side="bottom" aria-describedby={undefined} className={SHEET}>
          <SheetHeader closeLabel={t('phone.close')}>
            <SheetTitle>{t('phone.sheetTitle')}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {readOnly ? (
              <div className="px-5 pt-4">
                <Alert variant="info">{t('archived')}</Alert>
              </div>
            ) : null}
            <div role="region" aria-label={t('phone.sectionsLabel')}>
              {SECTION_IDS.map((id) => (
                <AccordionRow
                  key={id}
                  id={id}
                  title={t(`sections.${id}`)}
                  summary={summaries[id]}
                  expanded={section === id}
                  onToggle={() => setSection((current) => (current === id ? null : id))}
                >
                  <SectionBody id={id} {...props} />
                </AccordionRow>
              ))}
            </div>
          </SheetBody>
          <SaveBar editor={editor} readOnly={readOnly} size="touch" className="px-5" />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AccordionRow({
  id,
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  summary: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const row = useRef<HTMLElement>(null);
  return (
    <section ref={row} className="border-b" data-slot="accordion-row" data-section={id}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => {
            onToggle();
            // The row just opened starts at the top of the sheet, its settings in view.
            if (!expanded)
              requestAnimationFrame(() => row.current?.scrollIntoView({ block: 'start' }));
          }}
          className={cn(
            'flex min-h-14 w-full items-center gap-3 px-5 text-left',
            focusRing,
            'focus-visible:-outline-offset-2',
          )}
        >
          <span className="text-base font-semibold">{title}</span>
          <span className="ml-auto flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-muted-foreground">
            {summary}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-5 shrink-0 transition-transform motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </h3>
      <div id={panelId} hidden={!expanded} className="px-5 pb-5">
        {children}
      </div>
    </section>
  );
}

/** Each row's current value (Appendix B), so the closed accordion still reads as the page. */
function useSummaries({ editor, def }: SectionProps & { templateName: string }) {
  const t = useTranslations('guestPage');
  const tTemplates = useTranslations('templates');
  const { settings, welcomeMessage } = editor.working;
  const version = currentVersion(editor.editor);
  const imageLabel = (status: 'READY' | 'PENDING' | 'FAILED' | undefined) =>
    status === undefined
      ? t('image.none')
      : status === 'READY'
        ? t('image.ready')
        : status === 'PENDING'
          ? t('image.processing')
          : t('image.failed');
  const background = settings.background;
  const backgroundSummary =
    background.kind === 'image'
      ? t('phone.imageSummary', { dim: background.dim })
      : t(`background.${background.kind}`);
  const preset = ACCENT_PRESETS.find((p) => p.hex === settings.accent);
  const fontName = t(`font.names.${settings.headingFont}`);
  const welcomeLength = welcomeMessage === null ? 0 : codePointLength(welcomeMessage);
  const summaries: Record<SectionId, ReactNode> = {
    template: tTemplates.has(`${def.id}.name`) ? tTemplates(`${def.id}.name`) : def.id,
    cover: <span className="truncate">{imageLabel(version.cover?.status)}</span>,
    welcome: (
      <span className="type-data tabular-nums">
        {t('welcome.counter', { count: welcomeLength, max: WELCOME_MESSAGE_MAX_CHARS })}
      </span>
    ),
    background: backgroundSummary,
    accent: (
      <>
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-full border"
          style={{ backgroundColor: settings.accent }}
        />
        <span className="type-data">{settings.accent}</span>
        {preset === undefined ? null : (
          <span className="sr-only">{t(`accent.names.${preset.id}`)}</span>
        )}
      </>
    ),
    font: <span className="truncate">{fontName}</span>,
    layout: (
      <span className="truncate">
        {t('phone.layoutSummary', {
          placement: t(`layout.placements.${settings.coverPlacement}`),
          align: settings.align,
        })}
      </span>
    ),
  };
  return summaries;
}
