'use client';

import { ChevronDown, TriangleAlert } from 'lucide-react';
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { createContext, type ReactNode, useContext, useId, useState } from 'react';
import { cn } from '../lib/utils';
import { Badge, type BadgeVariant } from './badge';
import { Button } from './button';
import { QrFrame } from './qr-frame';

/*
 * Design (DESIGN-SYSTEM.md §5.15, §6.7; owner reviews 2026-10-02: the first panel was "all in a
 * heap", the four-part card was long and "pressed to the left"; this section is "very
 * sensitive", so clarity beats density):
 * - One card per guest link, as an accordion. The header is what an admin needs every day and is
 *   always visible: a small QR, the name with its status tag, one line on what the link is for,
 *   what guests can do in words, and the link itself with Copy and Download QR. «Керувати»
 *   opens the rest: what guests can do (as controls), the state switch and the danger zone.
 * - Every card starts closed, the main one too: the header already has everything to share it,
 *   and closed cards keep the tab a short list you can scan. Nothing is lost on close: the parts
 *   stay mounted (hidden), so unsaved changes survive and the header says they are there.
 * - The toggle is a real button (`aria-expanded`, `aria-controls`; Radix Collapsible) named
 *   after the link for screen readers. Opening fades the parts in (base duration); under reduced
 *   motion they are simply there. Closing is instant.
 * - Inside, a part's heading and sentence sit on the left of its controls once the card is wide
 *   (`@container`, from 48rem); on phones they stack. The danger part is set apart the way the
 *   settings' danger zone is: the soft destructive fill, a warning icon by the heading, and one
 *   row per action (what it does on the left, the button on the right).
 * - The QR is a thumbnail here (64px on phones, 112px once the card is wide), white in both
 *   themes so it scans; the big one is in the downloaded file.
 */

type LinkCardStatus = 'active' | 'paused';

const STATUS_VARIANT: Record<LinkCardStatus, BadgeVariant> = {
  active: 'success',
  paused: 'warning',
};

/** The card's heading level, so its parts can be one level below. */
const LevelContext = createContext<2 | 3>(2);

type LinkCardProps = {
  /** The link's name (e.g. «Основне посилання» or an additional link's label). */
  title: string;
  /** `h2` on its own, `h3` inside a titled group (additional links). */
  level?: 2 | 3;
  status: LinkCardStatus;
  /** The status in words; the tag's dot is decoration. */
  statusLabel: string;
  /** One quiet line under the title (what this link is for, when it was made). */
  meta?: ReactNode;
  /** What guests can do, in words, so a closed card still says it. */
  summary?: ReactNode;
  /** A tag next to the status, e.g. «Є незбережені зміни» while the parts hold unsaved edits. */
  notice?: ReactNode;
  /** The QR code; `null` draws an empty frame for a link that cannot be shown. */
  qr: ReactNode;
  /** The link field (a `CopyField` with a hidden label), or what to say instead. */
  share: ReactNode;
  /** Next to the field, e.g. the Download QR menu. */
  actions?: ReactNode;
  /** The toggle's visible text, e.g. «Керувати». */
  toggleLabel: string;
  /**
   * Its accessible name, starting with the visible text and naming the link, e.g. «Керувати
   * «Фотограф»», so several cards' toggles are told apart.
   */
  toggleName: string;
  defaultOpen?: boolean;
  /** `LinkCardSection`s, shown when open. */
  children: ReactNode;
  className?: string;
};

function LinkCard({
  title,
  level = 2,
  status,
  statusLabel,
  meta,
  summary,
  notice,
  qr,
  share,
  actions,
  toggleLabel,
  toggleName,
  defaultOpen = false,
  children,
  className,
}: LinkCardProps) {
  const titleId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <CollapsiblePrimitive.Root asChild open={open} onOpenChange={setOpen}>
      <section
        data-slot="link-card"
        data-status={status}
        aria-labelledby={titleId}
        className={cn(
          // `overflow-clip`, not hidden: it rounds the corners without becoming a scroll
          // container, so a sticky bar inside still sticks to the viewport.
          '@container/link-card grid min-w-0 overflow-clip rounded-sheet border bg-card text-card-foreground',
          className,
        )}
      >
        <header
          className={cn(
            'grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-4 p-4 sm:px-6 sm:py-5',
            '@[48rem]/link-card:grid-cols-[auto_minmax(0,1fr)_auto] @[48rem]/link-card:gap-x-6',
          )}
        >
          <QrFrame className="col-start-1 row-start-1 size-16 p-1 @[48rem]/link-card:row-span-2 @[48rem]/link-card:size-28 @[48rem]/link-card:p-1.5">
            {qr}
          </QrFrame>
          {/* Phones: the title beside the QR, the two lines under both (the column beside a
              64px QR is too narrow for sentences). Wide: one block beside the QR. */}
          <div className="contents @[48rem]/link-card:col-start-2 @[48rem]/link-card:row-start-1 @[48rem]/link-card:grid @[48rem]/link-card:min-w-0 @[48rem]/link-card:content-start @[48rem]/link-card:gap-1">
            <div className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 self-center">
              <Heading id={titleId} className="type-h2 min-w-0 [overflow-wrap:anywhere]">
                {title}
              </Heading>
              <Badge variant={STATUS_VARIANT[status]}>{statusLabel}</Badge>
              {notice}
            </div>
            {meta === undefined && summary === undefined ? null : (
              <div className="col-span-2 grid min-w-0 gap-1 @[48rem]/link-card:col-span-1">
                {meta === undefined ? null : (
                  <p className="text-sm text-pretty text-muted-foreground [overflow-wrap:anywhere]">
                    {meta}
                  </p>
                )}
                {summary === undefined ? null : (
                  <p
                    data-slot="link-card-summary"
                    className="text-sm text-pretty [overflow-wrap:anywhere]"
                  >
                    {summary}
                  </p>
                )}
              </div>
            )}
          </div>
          <div
            className={cn(
              'col-span-2 flex min-w-0 flex-col gap-2',
              '@[48rem]/link-card:col-span-2 @[48rem]/link-card:col-start-2 @[48rem]/link-card:row-start-2 @[48rem]/link-card:flex-row @[48rem]/link-card:items-start',
            )}
          >
            <div className="min-w-0 @[48rem]/link-card:max-w-[44rem] @[48rem]/link-card:flex-1">
              {share}
            </div>
            {actions === undefined ? null : (
              <div className="flex min-w-0 flex-col gap-2 *:w-full @[48rem]/link-card:flex-row @[48rem]/link-card:*:w-auto">
                {actions}
              </div>
            )}
          </div>
          <CollapsiblePrimitive.Trigger asChild>
            <Button
              variant="ghost"
              data-slot="link-card-toggle"
              aria-label={toggleName}
              className={cn(
                'col-span-2 w-full justify-between border border-input',
                '@[48rem]/link-card:col-span-1 @[48rem]/link-card:col-start-3 @[48rem]/link-card:row-start-1 @[48rem]/link-card:w-auto @[48rem]/link-card:self-start @[48rem]/link-card:border-transparent',
                '[&[data-state=open]>svg]:rotate-180',
              )}
            >
              <span>{toggleLabel}</span>
              <ChevronDown
                aria-hidden="true"
                className="transition-transform duration-(--duration-base) ease-out motion-reduce:transition-none"
              />
            </Button>
          </CollapsiblePrimitive.Trigger>
        </header>
        {/* Mounted while closed (hidden), so the parts keep their state, e.g. unsaved edits. */}
        <CollapsiblePrimitive.Content
          forceMount
          data-slot="link-card-content"
          className={cn(
            'grid min-w-0 data-[state=closed]:hidden',
            'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in motion-safe:data-[state=open]:slide-in-from-top-1 motion-safe:data-[state=open]:animation-duration-[var(--duration-base)]',
          )}
        >
          <LevelContext.Provider value={level}>{children}</LevelContext.Provider>
        </CollapsiblePrimitive.Content>
      </section>
    </CollapsiblePrimitive.Root>
  );
}

type LinkCardSectionProps = {
  title: string;
  /** One plain sentence on what this part does. */
  description?: ReactNode;
  /** `danger`: rotate, revoke or delete; the soft destructive fill and a warning icon. */
  tone?: 'default' | 'danger';
  children: ReactNode;
  className?: string;
};

function LinkCardSection({
  title,
  description,
  tone = 'default',
  children,
  className,
}: LinkCardSectionProps) {
  const level = useContext(LevelContext);
  const Heading = level === 2 ? 'h3' : 'h4';
  const titleId = useId();
  const danger = tone === 'danger';
  return (
    <section
      data-slot="link-card-section"
      data-tone={tone}
      aria-labelledby={titleId}
      className={cn(
        'grid min-w-0 gap-4 border-t p-4 sm:px-6 sm:py-5',
        '@[48rem]/link-card:grid-cols-[14rem_minmax(0,1fr)] @[48rem]/link-card:gap-10',
        '@[72rem]/link-card:grid-cols-[16rem_minmax(0,1fr)]',
        { 'border-t-destructive bg-destructive-soft': danger },
        className,
      )}
    >
      <div className="grid content-start gap-1">
        <Heading
          id={titleId}
          className="flex items-center gap-2 text-base leading-[1.35] font-semibold"
        >
          {danger ? (
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          ) : null}
          {title}
        </Heading>
        {description === undefined ? null : (
          <p
            className={cn('text-sm leading-[1.45] text-pretty', {
              'text-muted-foreground': !danger,
            })}
          >
            {description}
          </p>
        )}
      </div>
      <div className="@container/link-card-part min-w-0">{children}</div>
    </section>
  );
}

/**
 * One irreversible action in the danger part: its name and what it does on the left, the button
 * on the right once the part is wide (from 36rem); stacked on phones. Rows are split by hairlines.
 */
function LinkCardDangerAction({
  id,
  title,
  description,
  children,
}: {
  /** The name's id; the description is `${id}-hint` (pass it to the button as aria-describedby). */
  id: string;
  title: string;
  description: ReactNode;
  /** The button. */
  children: ReactNode;
}) {
  return (
    <div
      data-slot="link-card-danger-action"
      className="grid gap-3 border-destructive/25 py-4 not-first:border-t first:pt-0 last:pb-0 @[36rem]/link-card-part:grid-cols-[minmax(0,1fr)_auto] @[36rem]/link-card-part:items-center @[36rem]/link-card-part:gap-8"
    >
      <div className="grid min-w-0 gap-0.5">
        <p id={id} className="text-[0.9375rem] font-semibold">
          {title}
        </p>
        <p id={`${id}-hint`} className="max-w-[60ch] text-sm leading-[1.45] text-pretty">
          {description}
        </p>
      </div>
      <div className="grid min-w-0 *:w-full @[36rem]/link-card-part:*:w-auto">{children}</div>
    </div>
  );
}

export {
  LinkCard,
  LinkCardDangerAction,
  LinkCardSection,
  type LinkCardProps,
  type LinkCardSectionProps,
  type LinkCardStatus,
};
