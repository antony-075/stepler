'use client';

import { Check, Copy } from 'lucide-react';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';

/** How long the button says `copiedLabel` after a successful copy. */
const COPIED_FEEDBACK_MS = 2000;

type CopyStatus = 'idle' | 'copied' | 'failed';

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Copies text to the clipboard and reports how it went: `copied` for 2s after a success,
 * `failed` until the next try when the clipboard is missing or refuses. The status goes back to
 * `idle` for one frame before each new outcome, so a live region announces a repeated outcome
 * again. A stale result (a newer click, or after unmount) is ignored. `onFail` runs on failure
 * (`CopyField` selects its value for a manual copy).
 */
function useClipboardCopy(onFail?: () => void): {
  status: CopyStatus;
  copy: (value: string) => Promise<void>;
} {
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(
    () => () => {
      attempt.current += 1;
      clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(
    async (value: string) => {
      const current = ++attempt.current;
      clearTimeout(resetTimer.current);
      setStatus('idle');
      // Typed as optional: the API is missing on insecure origins and in some embedded browsers.
      const clipboard: Clipboard | undefined = navigator.clipboard;
      let copiedOk = true;
      try {
        if (!clipboard) throw new Error('Clipboard API unavailable');
        await clipboard.writeText(value);
      } catch {
        copiedOk = false;
      }
      // Let the cleared region render before the new message goes in.
      await nextFrame();
      if (current !== attempt.current) return;
      if (!copiedOk) {
        onFail?.();
        setStatus('failed');
        return;
      }
      setStatus('copied');
      resetTimer.current = setTimeout(() => setStatus('idle'), COPIED_FEEDBACK_MS);
    },
    [onFail],
  );

  return { status, copy };
}

type CopyButtonProps = Omit<ComponentProps<typeof Button>, 'onClick' | 'children' | 'value'> & {
  value: string;
  copyLabel: string;
  copiedLabel: string;
  /** Announced (and shown under the button) when the clipboard is unavailable or refuses. */
  failedLabel: string;
  /**
   * The button's accessible name when the visible label alone is not enough (a row of links:
   * «Копіювати “Фотограф”»). Keep the visible label at its start (WCAG 2.5.3).
   */
  accessibleLabel?: string;
  /** On the wrapper; the button fills it (e.g. `w-full sm:w-auto`). */
  className?: string;
  /**
   * Only the icon (a ghost 44px button next to the value it copies): the name is `copyLabel`,
   * then `copiedLabel` for 2s while the icon turns into a check.
   */
  iconOnly?: boolean;
  /** Runs when the clipboard is unavailable or refuses (e.g. select the shown value). */
  onFail?: () => void;
};

/**
 * A copy button without a field, for a list row that already shows the value (the Links tab).
 * The label switches to `copiedLabel` for 2s; both labels share one grid cell so the button does
 * not change width. Success and failure are announced through a polite live region; a failure
 * also stays visible until the next try. With a field to select from, use `CopyField`.
 */
function CopyButton({
  value,
  copyLabel,
  copiedLabel,
  failedLabel,
  accessibleLabel,
  variant,
  className,
  iconOnly = false,
  onFail,
  ...props
}: CopyButtonProps) {
  const { status, copy } = useClipboardCopy(onFail);
  const copied = status === 'copied';
  if (iconOnly) {
    return (
      <span data-slot="copy-button" className={cn('relative inline-grid', className)}>
        <Button
          type="button"
          variant={variant ?? 'ghost'}
          size="icon"
          aria-label={copied ? copiedLabel : copyLabel}
          title={copied ? copiedLabel : copyLabel}
          onClick={() => void copy(value)}
          className="text-muted-foreground hover:text-foreground"
          {...props}
        >
          {copied ? (
            <Check aria-hidden="true" className="text-success" />
          ) : (
            <Copy aria-hidden="true" />
          )}
        </Button>
        <CopyStatusText status={status} copiedLabel={copiedLabel} failedLabel={failedLabel} />
      </span>
    );
  }
  return (
    <span data-slot="copy-button" className={cn('relative inline-grid', className)}>
      <Button
        type="button"
        variant={variant ?? 'outline'}
        aria-label={
          accessibleLabel === undefined ? undefined : copied ? copiedLabel : accessibleLabel
        }
        onClick={() => void copy(value)}
        {...props}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span className="grid">
          <span className={cn('col-start-1 row-start-1', { invisible: copied })}>{copyLabel}</span>
          <span className={cn('col-start-1 row-start-1', { invisible: !copied })}>
            {copiedLabel}
          </span>
        </span>
      </Button>
      <CopyStatusText status={status} copiedLabel={copiedLabel} failedLabel={failedLabel} />
    </span>
  );
}

/** The polite live region; a failure also shows on the popover surface until the next try. */
function CopyStatusText({
  status,
  copiedLabel,
  failedLabel,
}: {
  status: CopyStatus;
  copiedLabel: string;
  failedLabel: string;
}) {
  return (
    <span
      data-slot="copy-button-status"
      aria-live="polite"
      className={cn('text-sm', {
        'sr-only': status !== 'failed',
        // Over whatever is below, on the popover surface, so the row keeps its height.
        'absolute top-full right-0 z-(--z-popover) mt-1 w-max max-w-64 rounded-control border bg-popover px-3 py-2 text-popover-foreground shadow-popover':
          status === 'failed',
      })}
    >
      {status === 'copied' ? copiedLabel : null}
      {status === 'failed' ? failedLabel : null}
    </span>
  );
}

export { CopyButton, useClipboardCopy, type CopyButtonProps, type CopyStatus };
