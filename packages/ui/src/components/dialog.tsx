'use client';

import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

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

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50',
        'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

/** Panel classes shared with `ConfirmDialog` (Radix AlertDialog) so both overlays match. */
const dialogContentClassName = cn(
  'fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-card outline-none [overflow-wrap:anywhere] sm:max-w-md',
  'duration-200 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95',
);

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /** Accessible name of the corner close button (e.g. "Закрити"). */
  closeLabel: string;
  /** Hide the corner close button when the footer already has a Cancel. */
  showCloseButton?: boolean;
};

// Based on shadcn/ui (new-york). Deviations: full width minus the 16px gutters on phones and
// `max-w-md` from `sm`, scrolls inside when taller than the screen, a 44px close button whose
// label is a prop, v4 tokens, and no motion under reduced motion.
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
        className={cn(dialogContentClassName, { 'pr-14': showCloseButton }, className)}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label={closeLabel}
            className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <XIcon aria-hidden="true" className="size-4" />
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

// Stacked on phones with the primary action first (on top); a row aligned right from `sm`.
function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-6 font-bold', className)}
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
      className={cn('text-sm text-muted-foreground', className)}
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
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  type DialogContentProps,
};
