// T1 «Класика» (`classic`) in PR H: today's guest page, moved here unchanged (plan Task 3, [D5]).
// It keeps the Stepler tokens and follows the visitor's light/dark setting; PR K redesigns it to
// the T1 artboard. Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design), as decided for the guest page (DESIGN-SYSTEM.md §6.1, §6.3, §7.1, §7.3):
// - One question per screen: what is this (the title, display size) and what do I do (one
//   pencil action in the thumb zone). Everything else is quieter and lower.
// - Phones (< 640): one column, the actions in a dock fixed at the bottom with the safe area (the
//   content and the footer get room below it). 640–1023: one centred column of 720px with the
//   actions under the title, no dock. ≥ 1024: two columns in the page container: the identity
//   and the actions on a sticky sheet on the left (380/420px), the frames on the right.
// - The cover, when set, is the hero above the title (16:10, 2:1 in the tablet column, 4:3 in
//   the side panel). The welcome is one paragraph after the counts line, in body size.
// - The terms notice closes the actions block, in the sheet and in the dock alike; the footer
//   always renders. A view-only link has no actions, no dock and no notice.

import { Button } from '@stepler/ui/components/button';
import { CollectionCover } from '@stepler/ui/components/collection-cover';
import { UploadDock } from '@stepler/ui/components/upload-dock';
import { cn } from '@stepler/ui/lib/utils';
import { ImagePlus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TemplateActions, TemplateImage, TemplateLayoutProps } from '../../react/model.ts';

/**
 * The hero's rendered width: the phone column (16px gutters), the 720px tablet column (24px
 * gutters), then the 380/420px side sheet less its 32/40px padding.
 */
/** Decorative: the h1 under the cover names the collection. */
const DECORATIVE = '';

const COVER_SIZES =
  '(min-width: 1280px) 340px, (min-width: 1024px) 316px, (min-width: 640px) min(720px, calc(100vw - 48px)), calc(100vw - 32px)';

export function ClassicLayout({ model, actions, slots }: TemplateLayoutProps) {
  const actionsBlock =
    actions === null ? null : <ClassicActions actions={actions} legalNotice={slots.legalNotice} />;
  return (
    // With a dock on phones (<640px, fixed) the footer needs room under it to be reached by
    // scrolling; a view-only link has no dock and no extra room.
    <div className="flex min-h-dvh flex-col bg-background max-sm:[&:has([data-slot=upload-dock])_footer]:pb-[13rem]">
      <header>
        <div className="stepler-container flex h-14 items-center justify-between gap-3">
          {slots.brand}
          {slots.languageSwitch}
        </div>
      </header>
      <main className="stepler-container flex-1 pt-6 pb-16 sm:pt-10 lg:pt-12">
        <div
          className={cn(
            'mx-auto grid w-full max-w-[720px] gap-8 sm:gap-10 lg:max-w-none lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-12 xl:grid-cols-[420px_minmax(0,1fr)] xl:gap-16',
            // Room for the fixed dock on phones.
            actions !== null && 'max-sm:pb-32',
          )}
        >
          {/* The collection's identity; from lg a sheet that stays in view beside the frames. */}
          <header className="grid content-start gap-3 lg:sticky lg:top-6 lg:rounded-sheet lg:border lg:bg-card lg:p-8 xl:p-10">
            {model.cover === null ? null : <ClassicCover image={model.cover} />}
            {/* Display size until the sheet: there it fits the 300–340px column without breaking words. */}
            <h1 className="type-display text-balance [overflow-wrap:anywhere] lg:text-[2.5rem] lg:leading-[1.1] xl:text-[2.75rem]">
              {model.title}
            </h1>
            {model.description === null ? null : (
              <p className="max-w-[60ch] whitespace-pre-line text-pretty [overflow-wrap:anywhere]">
                {model.description}
              </p>
            )}
            {model.countsLabel === null ? null : (
              <p className="flex flex-wrap gap-x-3 type-data text-[0.875rem] text-muted-foreground">
                <span className="tabular-nums">{model.countsLabel}</span>
                {model.lastAddedLabel === null ? null : <span>{model.lastAddedLabel}</span>}
              </p>
            )}
            {model.welcomeMessage === null ? null : (
              <p
                data-slot="guest-welcome"
                className="mt-2 max-w-[60ch] text-[1.0625rem] leading-normal text-pretty text-foreground [overflow-wrap:anywhere]"
              >
                {model.welcomeMessage}
              </p>
            )}
            {actionsBlock === null ? null : (
              <div className="mt-4 hidden gap-3 sm:grid sm:max-w-sm lg:mt-6 lg:max-w-none lg:border-t lg:pt-6">
                {actionsBlock}
                {actions?.note == null ? null : (
                  <p className="text-center text-sm text-muted-foreground sm:text-left">
                    {actions.note}
                  </p>
                )}
              </div>
            )}
          </header>

          <div className="grid min-w-0 content-start gap-10 lg:gap-12">
            {slots.ownFrames}
            {slots.allFrames}
          </div>
        </div>

        {actionsBlock === null ? null : (
          // Phones only: from 640px the actions sit under the title / in the side panel.
          <UploadDock
            className="sm:hidden"
            primary={actionsBlock}
            {...(actions?.note == null ? {} : { note: actions.note })}
          />
        )}
      </main>
      {slots.footer}
    </div>
  );
}

/**
 * The actions: in the dock on phones, under the title from 640px, in the side panel from 1024px.
 * Files take the pencil when the link takes any; the wish is then the quiet second action. The
 * terms notice closes the block in both cases.
 */
function ClassicActions({
  actions,
  legalNotice,
}: {
  actions: TemplateActions;
  legalNotice: ReactNode;
}) {
  const { primary, secondary } = actions;
  return (
    <div className="grid gap-2">
      <Button variant="pencil" size="guest" className="w-full" onClick={primary.onSelect}>
        {primary.icon === 'files' ? <ImagePlus aria-hidden="true" /> : null}
        {primary.label}
      </Button>
      {secondary === null ? null : (
        <Button variant="ghost" size="lg" className="w-full" onClick={secondary.onSelect}>
          {secondary.label}
        </Button>
      )}
      {legalNotice}
    </div>
  );
}

/**
 * The admin's cover as the hero above the title: decorative (the h1 names the collection), eager
 * (it is the first thing seen), with its dimensions so nothing shifts while it loads.
 */
function ClassicCover({ image }: { image: TemplateImage }) {
  return (
    <CollectionCover
      // Only the initials tile uses these; with a picture they are never shown.
      tint="sand"
      initials=""
      size="hero"
      className="mb-3 sm:aspect-[2/1] lg:mb-4 lg:aspect-[4/3]"
      image={
        // A presigned storage URL: nothing for an image optimiser to do.
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes={COVER_SIZES}
          alt={DECORATIVE}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          width={image.width}
          height={image.height}
          onError={image.onError}
        />
      }
    />
  );
}
