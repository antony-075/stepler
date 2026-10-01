import { useId } from 'react';
import { cn } from '../lib/utils';

type SpinnerProps = {
  /** Announced to screen readers; not shown. */
  label: string;
  className?: string;
};

// A CSS ring in the current text colour (size with `className`, e.g. `size-8`). Under reduced
// motion it stops spinning and closes into a static ring.
function Spinner({ label, className }: SpinnerProps) {
  const labelId = useId();

  return (
    <span
      data-slot="spinner"
      role="status"
      aria-labelledby={labelId}
      className={cn('inline-flex size-5 shrink-0', className)}
    >
      <span
        aria-hidden="true"
        className="size-full animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none motion-reduce:border-r-current motion-reduce:opacity-60"
      />
      <span id={labelId} className="sr-only">
        {label}
      </span>
    </span>
  );
}

export { Spinner, type SpinnerProps };
