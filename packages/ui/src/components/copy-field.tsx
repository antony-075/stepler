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
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  function selectValue() {
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function copy() {
    clearTimeout(resetTimer.current);
    // Typed as optional: the API is missing on insecure origins and in some embedded browsers.
    const clipboard: Clipboard | undefined = navigator.clipboard;
    try {
      if (!clipboard) throw new Error('Clipboard API unavailable');
      await clipboard.writeText(value);
    } catch {
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
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? copiedLabel : copyLabel}
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
