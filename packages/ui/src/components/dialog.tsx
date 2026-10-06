'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { closeButtonClassName } from './button';

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

// Overlay, panel, title and description classes are shared with `ConfirmDialog` (Radix
// AlertDialog) so both dialogs match.
const dialogOverlayClassName = cn(
  'fixed inset-0 z-(--z-overlay) bg-overlay',
  'animation-duration-[var(--duration-slow)] data-[state=closed]:animation-duration-[120ms]',
  'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0',
);

// A 17px/650 heading (DESIGN-SYSTEM.md §0.3), fixed at every width.
const dialogTitleClassName =
  'text-[1.0625rem] leading-[1.25] font-[650] tracking-[-0.01em] text-balance';

const dialogDescriptionClassName = 'text-sm leading-normal text-muted-foreground';

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(dialogOverlayClassName, className)}
      {...props}
    />
  );
}

// The modal layer: `--popover`, a 12px radius, `--shadow-dialog`, over `--overlay`. Opens with a
// fade, an 8px rise and a 0.98 → 1 scale (180ms); leaves faster (120ms, fade and 0.98); no
// motion under reduced motion.
const dialogContentClassName = cn(
  'fixed top-1/2 left-1/2 z-(--z-modal) grid ease-out max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-dialog border bg-popover p-5 text-popover-foreground shadow-dialog outline-none [overflow-wrap:anywhere] sm:max-w-[480px] sm:p-6',
  'animation-duration-[var(--duration-slow)] data-[state=closed]:animation-duration-[120ms]',
  'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-98 motion-safe:data-[state=open]:slide-in-from-bottom-2 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-98',
);

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /** Accessible name of the corner close button (e.g. "Закрити"). */
  closeLabel: string;
  /** Hide the corner close button when the footer already has a Cancel. */
  showCloseButton?: boolean;
};

// Based on shadcn/ui (new-york). Deviations: full width minus the 16px gutters on phones and
// 480px from `sm`, its body scrolls inside when taller than the screen (the box and the close
// button do not; overscroll does not reach the page), a 44px close button whose label is a prop, direction C surface and motion (above), and no motion under reduced motion.
function DialogContent({
  className,
  children,
  closeLabel,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        // The box itself does not scroll: its body does (below), so the close button stays in
        // the corner, level with the title, however long the content (owner review 2026-10-02).
        className={cn(dialogContentClassName, 'overflow-hidden p-0 sm:p-0', className)}
        {...props}
      >
        <div
          data-slot="dialog-body"
          className={cn(
            'grid max-h-[calc(100dvh-2rem)] min-w-0 gap-5 overflow-y-auto overscroll-contain p-5 sm:p-6',
            // Only the header makes room for the close button, so the body stays symmetric.
            { '[&>[data-slot=dialog-header]]:pr-10': showCloseButton },
          )}
        >
          {children}
        </div>
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label={closeLabel}
            className={cn(closeButtonClassName, 'absolute top-2 right-2 sm:top-3 sm:right-3')}
          >
            <X aria-hidden="true" className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('grid min-w-0 gap-2 text-left', className)}
      {...props}
    />
  );
}

// Full-width buttons in a column on phones, the primary action last (at the bottom, nearest the
// thumb; put it last in the markup); a row aligned right from `sm`.
function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col gap-2 *:w-full sm:flex-row sm:justify-end sm:*:w-auto',
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(dialogTitleClassName, className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(dialogDescriptionClassName, className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  dialogContentClassName,
  DialogDescription,
  dialogDescriptionClassName,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  dialogOverlayClassName,
  DialogPortal,
  DialogTitle,
  dialogTitleClassName,
  DialogTrigger,
  type DialogContentProps,
};
