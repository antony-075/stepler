import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type UnsavedBarProps = {
  /** True while the form holds changes that are not saved. */
  open: boolean;
  /** What is pending, e.g. «Є незбережені зміни — гості їх ще не бачать». */
  message: string;
  /** Cancel and Save. */
  children: ReactNode;
  className?: string;
};

/**
 * Says a form has unsaved changes, with its Cancel and Save (DESIGN-SYSTEM.md §5.2; owner review
 * 2026-10-02: a muted line next to the buttons went unnoticed). A warning-soft bar with the
 * warning icon and a warning edge, sticky to the bottom of the viewport while its form is on
 * screen (put it last in the form), so Save stays in reach on a long form on a phone. The
 * message is in a polite live region that is always mounted, so screen readers hear it when the
 * first change is made. The bar is gone while nothing changed.
 */
function UnsavedBar({ open, message, children, className }: UnsavedBarProps) {
  return (
    <div
      data-slot="unsaved-bar"
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'sticky bottom-3 z-(--z-sticky) grid min-w-0 gap-3 rounded-control border border-warning/50 bg-warning-soft p-3 pl-4 text-foreground shadow-popover',
        'min-[480px]:grid-cols-[minmax(0,1fr)_auto] min-[480px]:items-center',
        'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in motion-safe:data-[state=open]:slide-in-from-bottom-1 motion-safe:data-[state=open]:animation-duration-[var(--duration-base)]',
        // The live region stays mounted while closed; only the box disappears.
        'data-[state=closed]:contents',
        className,
      )}
    >
      <p
        role="status"
        className={cn('flex min-w-0 items-start gap-2 text-[0.9375rem] font-semibold', {
          'sr-only': !open,
        })}
      >
        {open ? (
          <>
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            <span className="min-w-0">{message}</span>
          </>
        ) : null}
      </p>
      {open ? (
        <div className="flex flex-col-reverse gap-2 min-[480px]:flex-row min-[480px]:justify-end">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export { UnsavedBar, type UnsavedBarProps };
