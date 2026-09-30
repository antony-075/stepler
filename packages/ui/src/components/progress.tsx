import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from '../lib/utils';

type ProgressProps = {
  /** 0–100; `null` means indeterminate. Out-of-range values are clamped. */
  value: number | null;
  /** The accessible name, e.g. "Uploading 3 of 12 files". */
  label: string;
  /** Spoken instead of the default percentage, e.g. "40%, about a minute left". */
  valueText?: string;
  className?: string;
};

// Based on shadcn/ui (new-york). Indeterminate progress pulses a full bar instead of sliding
// one; both motions stop under reduced motion.
function Progress({ value, label, valueText, className }: ProgressProps) {
  const clamped = value === null ? null : Math.min(100, Math.max(0, value));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clamped}
      aria-label={label}
      {...(valueText === undefined ? {} : { getValueLabel: () => valueText })}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full w-full bg-primary transition-transform duration-300 motion-reduce:transition-none',
          clamped === null && 'animate-pulse motion-reduce:animate-none',
        )}
        style={{ transform: `translateX(-${100 - (clamped ?? 100)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress, type ProgressProps };
