'use client';

import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';

/**
 * A guest link's whole address (owner 2026-10-03), the same in the share dialog and the link's
 * sheet: a read-only block in mono on the page colour with a border and radius, wrapped anywhere
 * (`break-all`), never cut. It grows with its text and fills the rest of its card's height (put
 * it in a flex column with `flex-1`). Focus or a click selects everything for a manual copy,
 * unless the click dragged to select part of it. Pair it with a `<label htmlFor={id}>`.
 */
export function LinkUrlBlock({
  id,
  value,
  className,
}: {
  id: string;
  value: string;
  className?: string;
}) {
  return (
    <textarea
      id={id}
      readOnly
      rows={3}
      value={value}
      translate="no"
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => {
        const field = event.currentTarget;
        if (field.selectionStart === field.selectionEnd) field.select();
      }}
      className={cn(
        'min-h-24 w-full flex-1 resize-none rounded-control border border-input bg-background px-3 py-2.5 align-top font-mono text-sm leading-relaxed break-all text-foreground [field-sizing:content]',
        focusRing,
        className,
      )}
    />
  );
}
