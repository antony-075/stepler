'use client';

import { Check, Copy } from 'lucide-react';
import { type ReactNode, useCallback, useId, useRef } from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';
import { useClipboardCopy } from './copy-button';
import { Input } from './input';
import { Label } from './label';

type CopyFieldProps = {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
  /** Shown and announced when the clipboard is unavailable or refuses; the value is then selected. */
  failedLabel: string;
  /** Keeps the label for screen readers only, where the context already says what the value is. */
  hideLabel?: boolean;
  /** More actions after Copy, in the same row (e.g. «Відкрити» the link in a new tab). */
  children?: ReactNode;
  className?: string;
};

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
  hideLabel = false,
  children,
  className,
}: CopyFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectValue = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const { status, copy } = useClipboardCopy(selectValue);

  const copied = status === 'copied';

  return (
    <div
      data-slot="copy-field"
      className={cn('@container/copy-field grid min-w-0 gap-2', className)}
    >
      <Label htmlFor={id} className={cn({ 'sr-only': hideLabel })}>
        {label}
      </Label>
      {/* Below 22rem (a phone-width panel; 34rem with more actions) the buttons go under the
          field at full width, so the field keeps enough of the value to recognise it. */}
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2',
          children ? '@[34rem]/copy-field:flex-row' : '@[22rem]/copy-field:flex-row',
        )}
      >
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
        <div className="flex gap-2 *:flex-1">
          {/* \`lg\` matches the input's 48px height. */}
          <Button type="button" variant="outline" size="lg" onClick={() => void copy(value)}>
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
          {children}
        </div>
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
