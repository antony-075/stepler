'use client';

import { Trash2 } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Alert } from './alert';
import { Button } from './button';
import {
  DialogFooter,
  DialogHeader,
  dialogContentClassName,
  dialogDescriptionClassName,
  dialogOverlayClassName,
  dialogTitleClassName,
} from './dialog';
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

/** A menu's trigger. Radix labels the menu with it; `aria-controls` is there only while open. */
function menuTrigger(menu: HTMLElement): HTMLElement | null {
  const labelledBy = menu.getAttribute('aria-labelledby');
  const byLabel = labelledBy ? document.getElementById(labelledBy) : null;
  if (byLabel !== null || menu.id === '') return byLabel;
  return document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`);
}

/**
 * Where focus goes back to on close. A menu item that opened the dialog unmounts with its menu
 * (at once under reduced motion), so focus would fall to the page: return it to the menu's
 * trigger instead. `menuLeftFocus` covers a dialog opened a tick after `onSelect` (a
 * `setTimeout`): by then the menu may be gone and nothing has focus.
 */
function focusReturnTarget(
  active: Element | null,
  menuLeftFocus: HTMLElement | null,
): HTMLElement | null {
  if (active === null || active === document.body) return menuLeftFocus;
  if (!(active instanceof HTMLElement)) return null;
  const menu = active.closest<HTMLElement>('[role="menu"]');
  return (menu === null ? null : menuTrigger(menu)) ?? active;
}

/**
 * Asks before an action, especially a destructive one. Built on Radix AlertDialog, so it traps
 * focus, only closes by an explicit choice (Escape or Cancel, never an outside click) and returns
 * focus to the trigger. Initial focus goes to Cancel, never to the action. While `onConfirm` is
 * pending, both buttons are `aria-disabled` (still focusable, so focus never falls out of the
 * dialog) and inert, and Escape is ignored; a rejection keeps the dialog open with the error and
 * focus on the confirm button.
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
  const confirmRef = useRef<HTMLButtonElement>(null);
  // The dialog is controlled, often without an AlertDialog.Trigger (a menu item or a row
  // button opens it), so it remembers what had focus (a menu item: its menu's trigger) and
  // returns focus there on close.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // The trigger of a menu that just lost focus with nothing focused since (see focusReturnTarget).
  const menuLeftFocusRef = useRef<HTMLElement | null>(null);
  // Ignores a settle that arrives after the dialog was closed or reopened.
  const attempt = useRef(0);
  const pending = status === 'pending';

  useEffect(() => {
    const onFocusOut = (event: FocusEvent) => {
      const menu =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('[role="menu"]')
          : null;
      const leavingMenu =
        menu !== null &&
        !(event.relatedTarget instanceof Node && menu.contains(event.relatedTarget));
      menuLeftFocusRef.current = leavingMenu ? menuTrigger(menu) : null;
    };
    const onFocusIn = () => {
      menuLeftFocusRef.current = null;
    };
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
    };
  }, []);

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
      confirmRef.current?.focus();
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
          className={dialogOverlayClassName}
        />
        <AlertDialogPrimitive.Content
          data-slot="confirm-dialog"
          aria-busy={pending || undefined}
          className={cn(dialogContentClassName, className)}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current = focusReturnTarget(
              document.activeElement,
              menuLeftFocusRef.current,
            );
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
              className={dialogTitleClassName}
            >
              {title}
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description
              data-slot="confirm-dialog-description"
              className={dialogDescriptionClassName}
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
                aria-disabled={pending || undefined}
              >
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                ref={confirmRef}
                data-slot="confirm-dialog-action"
                variant={destructive ? 'destructive' : 'default'}
                aria-disabled={pending || undefined}
                onClick={(event) => void handleConfirm(event)}
              >
                {pending ? (
                  <Spinner label={pendingLabel} className="size-4" />
                ) : destructive ? (
                  // Destructive and the pencil look alike in luminance: the icon says "delete".
                  <Trash2 aria-hidden="true" />
                ) : null}
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
