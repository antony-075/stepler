import { Check, Copy } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

/** How long the button says `copiedLabel` after a successful copy. */
const COPIED_FEEDBACK_MS = 2000;

type CopyFieldProps = {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
  /** Shown and announced when the clipboard is unavailable or refuses; the value is then selected. */
  failedLabel: string;
  className?: string;
};

type CopyStatus = 'idle' | 'copied' | 'failed';

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * A read-only value (e.g. a guest link) with a copy button. Success is announced through a
 * polite live region and the button says `copiedLabel` for 2s. Without a working clipboard the
 * value is selected for a manual copy and `failedLabel` is shown and announced until the next try.
 */
function CopyField({
  label,
  value,
  copyLabel,
  copiedLabel,
  failedLabel,
  className,
}: CopyFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Identifies the latest click; a stale clipboard result or one after unmount is ignored.
  const attempt = useRef(0);
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(
    () => () => {
      attempt.current += 1;
      clearTimeout(resetTimer.current);
    },
    [],
  );

  function selectValue() {
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function copy() {
    const current = ++attempt.current;
    clearTimeout(resetTimer.current);
    // Empty the live region first so a repeated outcome (a second failure) is announced again.
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
      selectValue();
      setStatus('failed');
      return;
    }
    setStatus('copied');
    resetTimer.current = setTimeout(() => setStatus('idle'), COPIED_FEEDBACK_MS);
  }

  const copied = status === 'copied';

  return (
    <div data-slot="copy-field" className={cn('grid min-w-0 gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-w-0 gap-2">
        <Input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          // A click after focus places the caret; select everything again unless the user
          // dragged to select part of the value.
          onClick={(event) => {
            const input = event.currentTarget;
            if (input.selectionStart === input.selectionEnd) input.select();
          }}
          className="flex-1"
        />
        {/* \`lg\` matches the input's 48px height. */}
        <Button type="button" variant="outline" size="lg" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {/* Both labels share one grid cell, so the button is as wide as the longer one and
              the input does not shift when the label changes. `invisible` also removes the
              inactive label from the accessible name. */}
          <span className="grid">
            <span className={cn('col-start-1 row-start-1', { invisible: copied })}>
              {copyLabel}
            </span>
            <span className={cn('col-start-1 row-start-1', { invisible: !copied })}>
              {copiedLabel}
            </span>
          </span>
        </Button>
      </div>
      <p
        data-slot="copy-field-status"
        aria-live="polite"
        className={cn('text-sm text-muted-foreground', { 'sr-only': status !== 'failed' })}
      >
        {status === 'copied' ? copiedLabel : null}
        {status === 'failed' ? failedLabel : null}
      </p>
    </div>
  );
}

export { CopyField, type CopyFieldProps };
