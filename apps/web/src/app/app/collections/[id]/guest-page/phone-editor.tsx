'use client';

// The guest page editor below 1024px (plan Task 15, Appendix B «Phone», E-editor-phone). Design
// pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - The preview is the page: a 390px guest page scaled to the width (at most 0.7) in the ink
//   phone frame, centred, with a chip «Чернетка» / «Збережено» over its top edge, so the state is
//   in view without opening anything. No device toggle: on a phone the phone view is the one to
//   judge. «Стан сторінки» under it switches the guest page state the preview shows (remark 77).
// - «Налаштувати» is a 52px ink pill fixed in the thumb zone, with the apricot dot while there are
//   changes guests do not see (said as «, є незбережені зміни»). The page leaves room under it.
// - It opens a bottom sheet (at most 544px and 85svh, the preview still showing above it on a
//   phone; the scrim and Escape close it, focus returns to the pill). The sheet keeps its header
//   and the save bar (48px buttons) fixed and scrolls only the accordion between them.
// - The accordion (`SettingsAccordion`, shared with the desktop panel): one section open at a
//   time, «Шаблон» first.
// - Touch sizes from Appendix B come from the sections themselves (`pointer-coarse`).

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
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DEFAULT_PREVIEW_STATE, type PreviewState } from '@/guest-page/preview-protocol';
import { PreviewFrame, PreviewStateSelect } from './preview-pane';
import { SaveBar } from './save-bar';
import type { SectionProps } from './sections/section-props';
import { SettingsAccordion } from './sections/settings-accordion';

/** The bottom sheet stays a bottom sheet on tablets too (the shared one turns into a dialog). */
const SHEET =
  'h-[min(544px,85svh)] max-h-[85svh] sm:top-auto sm:bottom-0 sm:w-full sm:translate-y-0 sm:rounded-none sm:rounded-t-dialog sm:border-x-0 sm:border-b-0 sm:pb-[env(safe-area-inset-bottom)]';

const CHIP = {
  saved: 'bg-[#2C7350]',
  draft: 'bg-[#B83E26]',
} as const;

export function PhoneEditor(props: SectionProps) {
  const t = useTranslations('guestPage');
  const { editor, readOnly, collectionId } = props;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PreviewState>(DEFAULT_PREVIEW_STATE);
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
        <div className="h-[min(608px,calc(100svh-15rem))] min-h-[22rem]">
          <PreviewFrame
            collectionId={collectionId}
            page={editor.previewPage}
            state={state}
            device="phone"
          />
        </div>
        <PreviewStateSelect
          value={state}
          onChange={setState}
          className="mt-4 h-12 justify-self-center"
        />
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
              <SettingsAccordion mode="single" {...props} />
            </div>
          </SheetBody>
          <SaveBar editor={editor} readOnly={readOnly} size="touch" className="px-5" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
