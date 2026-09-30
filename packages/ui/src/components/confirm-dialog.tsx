'use client';

import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { type MouseEvent, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Alert } from './alert';
import { Button } from './button';
import { DialogFooter, DialogHeader, dialogContentClassName } from './dialog';
import { Spinner } from './spinner';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Announced by the spinner while `onConfirm` is pending (e.g. "Видаляємо"). */
  pendingLabel: string;
  /** Styles the confirm button as destructive. Initial focus is on Cancel either way. */
  destructive?: boolean;
  /** Resolve to close the dialog; reject to keep it open and show `errorMessage`. */
  onConfirm: () => Promise<void>;
  /** Shown in an error Alert when `onConfirm` rejects; required so a failure always has feedback. */
  errorMessage: string;
  className?: string;
};

type Status = 'idle' | 'pending' | 'error';

/**
 * Asks before an action, especially a destructive one. Built on Radix AlertDialog, so it traps
 * focus, only closes by an explicit choice (Escape or Cancel, never an outside click) and returns
 * focus to the trigger. Initial focus goes to Cancel, never to the action. While `onConfirm` is
 * pending, both buttons are disabled and Escape is ignored; a rejection keeps the dialog open
 * with the error.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  destructive = false,
  onConfirm,
  errorMessage,
  className,
}: ConfirmDialogProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [wasOpen, setWasOpen] = useState(open);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // The dialog is controlled, often without an AlertDialog.Trigger (a menu item or a row
  // button opens it), so it remembers what had focus and returns focus there on close.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Ignores a settle that arrives after the dialog was closed or reopened.
  const attempt = useRef(0);
  const pending = status === 'pending';

  // Every opening starts clean (no stale error or spinner from the last time).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStatus('idle');
  }

  const handleConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    // AlertDialog.Action closes on click; the dialog closes only after `onConfirm` resolves.
    event.preventDefault();
    if (pending) return;
    const current = ++attempt.current;
    setStatus('pending');
    try {
      await onConfirm();
      if (current !== attempt.current) return;
      setStatus('idle');
      onOpenChange(false);
    } catch {
      if (current !== attempt.current) return;
      setStatus('error');
    }
  };

  return (
    <AlertDialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay
          data-slot="confirm-dialog-overlay"
          className="fixed inset-0 z-50 bg-black/50 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0"
        />
        <AlertDialogPrimitive.Content
          data-slot="confirm-dialog"
          aria-busy={pending || undefined}
          className={cn(dialogContentClassName, className)}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            attempt.current += 1;
            const target = returnFocusRef.current;
            returnFocusRef.current = null;
            if (target?.isConnected) {
              event.preventDefault();
              target.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <DialogHeader>
            <AlertDialogPrimitive.Title
              data-slot="confirm-dialog-title"
              className="text-lg leading-6 font-bold"
            >
              {title}
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description
              data-slot="confirm-dialog-description"
              className="text-sm text-muted-foreground"
            >
              {description}
            </AlertDialogPrimitive.Description>
          </DialogHeader>
          {status === 'error' ? <Alert variant="error">{errorMessage}</Alert> : null}
          <DialogFooter>
            <AlertDialogPrimitive.Cancel asChild>
              <Button
                ref={cancelRef}
                data-slot="confirm-dialog-cancel"
                variant="outline"
                disabled={pending}
              >
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                data-slot="confirm-dialog-action"
                variant={destructive ? 'destructive' : 'default'}
                disabled={pending}
                onClick={(event) => void handleConfirm(event)}
              >
                {pending ? <Spinner label={pendingLabel} className="size-4" /> : null}
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </DialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export { ConfirmDialog, type ConfirmDialogProps };
