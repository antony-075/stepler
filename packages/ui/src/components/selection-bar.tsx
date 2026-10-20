// SelectionBar: what to do with the selected frames (DESIGN-SYSTEM.md §5.13, §7.3).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - V1: a dark inverse dock (`--inverse`) that rises in (160ms): «Вибрано 3» on the left, the
//   caller's actions (e.g. a destructive «Видалити») and «Скасувати вибір» on the right.
// - Sticky to the bottom of the grid column at every width, full-bleed on phones (the caller
//   gives the negative margin) with the safe area below. Sticky instead of the spec's fixed
//   below 1024: it keeps its place in the flow, so it never covers the last row of frames.
// - `data-toast-avoid` lifts toasts above it; `role="region"` with a label, the count in a polite
//   live region; `Escape` anywhere outside a dialog clears the selection.
// - 44px buttons; on phones «Скасувати вибір» is an icon button (named), its label from `sm`.
// - The bar's own buttons read as buttons on the dark dock (owner remark 2026-10-16: not white
//   words on black): a visible light edge and a faint fill, brighter on hover; the caller's
//   secondary actions (e.g. «Вибрати все завантажене») take the same `selectionBarButtonClassName`
//   with `variant="outline"`; a destructive action keeps its own red.
import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';

/** An outline button on the inverse dock: give it `variant="outline"` too. */
/** A number with its group separators («1 150»), never the space after it (it would be mono). */
const NUMBER = /(\d+(?:[\s\u00a0\u202f]\d+)*)/;

const selectionBarButtonClassName =
  'border-[color-mix(in_srgb,var(--inverse-foreground)_32%,transparent)] bg-[color-mix(in_srgb,var(--inverse-foreground)_8%,transparent)] text-inverse-foreground shadow-none hover:border-[color-mix(in_srgb,var(--inverse-foreground)_55%,transparent)] hover:bg-inverse-hover hover:text-inverse-foreground active:bg-inverse-hover pointer-coarse:h-11';

type SelectionBarProps = {
  /** How many frames are selected; the bar is the caller's to show only while this is > 0. */
  count: number;
  /** «Вибрано 3». */
  countLabel: string;
  /** The region's name, e.g. «Дії з вибраними кадрами». */
  label: string;
  /** Buttons, e.g. «Видалити»; secondary ones with `selectionBarButtonClassName`. */
  actions: ReactNode;
  onClear: () => void;
  /** «Скасувати вибір». */
  clearLabel: string;
  className?: string;
};

/** Is the key press meant for something else: a dialog, a menu, or a field being typed in? */
function belongsElsewhere(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !==
      null || target.matches('input, textarea, select, [contenteditable="true"]')
  );
}

function SelectionBar({
  count,
  countLabel,
  label,
  actions,
  onClear,
  clearLabel,
  className,
}: SelectionBarProps) {
  // The latest handler without re-subscribing on every render.
  const clear = useRef(onClear);
  useEffect(() => {
    clear.current = onClear;
  }, [onClear]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || belongsElsewhere(event.target)) {
        return;
      }
      clear.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      role="region"
      aria-label={label}
      data-slot="selection-bar"
      data-count={count}
      data-toast-avoid=""
      className={cn(
        'sticky bottom-0 z-(--z-dock) flex min-w-0 items-center gap-2 bg-inverse px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-inverse-foreground shadow-dock [--ring:var(--inverse-ring)]',
        'lg:bottom-4 lg:mx-auto lg:w-fit lg:max-w-full lg:rounded-sheet lg:py-1.5 lg:pr-1.5 lg:pl-4',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:animation-duration-[var(--duration-base)] ease-out',
        className,
      )}
    >
      <p aria-live="polite" className="min-w-0 flex-1 truncate text-sm font-semibold lg:mr-2">
        {/* The number in mono, the words as they are (the label stays one string to read). */}
        {countLabel.split(NUMBER).map((part, index) =>
          index % 2 === 1 ? (
            <span key={index} className="font-mono tabular-nums">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <Button
          type="button"
          variant="outline"
          size="adaptive"
          onClick={onClear}
          className={selectionBarButtonClassName}
        >
          <X aria-hidden="true" className="sm:hidden" />
          <span className="sr-only sm:not-sr-only">{clearLabel}</span>
        </Button>
      </div>
    </div>
  );
}

export { SelectionBar, selectionBarButtonClassName, type SelectionBarProps };
