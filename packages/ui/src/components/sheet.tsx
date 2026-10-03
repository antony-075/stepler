'use client';

import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { closeButtonClassName } from './button';
import { dialogOverlayClassName, dialogTitleClassName } from './dialog';

function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

type SheetContentProps = ComponentProps<typeof SheetPrimitive.Content> & {
  /**
   * `left`: the admin navigation on phones and tablets, at most 20rem. `right`: a panel of work
   * over the page (a guest link's settings), full screen on phones, up to 44rem from `sm`.
   * `bottom`: a short task on the guest page (name, a wish): from the bottom edge on phones, in
   * the thumb zone, with the safe area; a centred dialog of at most 560px from `sm`.
   */
  side?: 'left' | 'right' | 'bottom';
};

const SIDES = {
  left: 'inset-y-0 left-0 w-[min(20rem,calc(100vw-3rem))] border-r motion-safe:data-[state=closed]:slide-out-to-left motion-safe:data-[state=open]:slide-in-from-left',
  right:
    'inset-y-0 right-0 w-full border-l sm:w-[min(44rem,calc(100vw-3rem))] motion-safe:data-[state=closed]:slide-out-to-right motion-safe:data-[state=open]:slide-in-from-right',
  bottom: cn(
    'inset-x-0 bottom-0 mx-auto max-h-[calc(100dvh-3rem)] w-full max-w-[560px] rounded-t-dialog border-t bg-popover pb-[env(safe-area-inset-bottom)]',
    'motion-safe:data-[state=closed]:slide-out-to-bottom motion-safe:data-[state=open]:slide-in-from-bottom',
    'sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-2rem)] sm:-translate-y-1/2 sm:rounded-dialog sm:border sm:pb-0',
  ),
} as const;

// Based on shadcn/ui (new-york) sheet (DESIGN-SYSTEM.md §5.4, §6.0). Deviations: the page
// colour, not a popover (the bottom one is a popover: it sits over the guest page like a dialog) (the left one is the same sidebar the desktop shows, moved over the
// page; the right one holds sheets of its own), never wider than the screen minus a 3rem strip
// of the page to tap away (the right one fills a phone), a 1px edge, no shadow in dark, the
// dialog overlay, the close button in `SheetHeader` (it never scrolls), slides in (240ms) and out (160ms);
// under reduced motion it fades instead. Radix traps focus inside, closes on Escape and on the
// overlay, and returns focus to the trigger.
function SheetContent({ className, children, side = 'left', ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay data-slot="sheet-overlay" className={dialogOverlayClassName} />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-(--z-modal) flex flex-col overflow-hidden bg-background text-foreground shadow-dialog outline-none',
          SIDES[side],
          'ease-out animation-duration-[var(--duration-slow)] data-[state=closed]:animation-duration-[160ms]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:data-[state=closed]:fade-out-0 motion-reduce:data-[state=open]:fade-in-0',
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

/**
 * The sheet's top row (owner review 2026-10-02: the close scrolled away): 56px min, a hairline
 * below, the content (title, a status, a back arrow) and the 44px close button in one row, the
 * close vertically centred with the title. It never scrolls: put the rest in `SheetBody`.
 */
function SheetHeader({
  className,
  children,
  closeLabel,
  ...props
}: ComponentProps<'div'> & { closeLabel: string }) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        'flex min-h-14 shrink-0 items-center gap-3 border-b bg-background py-1.5 pr-2 pl-4 sm:pl-6',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
      <SheetPrimitive.Close
        data-slot="sheet-close"
        aria-label={closeLabel}
        className={cn(closeButtonClassName, 'hover:bg-hover')}
      >
        <X aria-hidden="true" className="size-4" />
      </SheetPrimitive.Close>
    </div>
  );
}

/**
 * The only scroll container of a sheet, under its header; overscroll does not reach the page.
 * A sticky footer (e.g. `UnsavedBar`) inside it stays at its bottom edge.
 */
function SheetBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-body"
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(dialogTitleClassName, className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetContentProps,
};
