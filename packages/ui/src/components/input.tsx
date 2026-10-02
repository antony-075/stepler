import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

/**
 * The field look shared by Input, Textarea and SelectTrigger (DESIGN-SYSTEM.md §5.2): a sheet
 * with a 1px `--input` edge and an 8px radius; hover darkens the edge to `--foreground`; focus
 * turns it violet and adds the 2px ring; invalid uses `--destructive` for both; disabled is a
 * muted fill with muted text (readable, not half-transparent).
 */
const fieldClassName = cn(
  'w-full min-w-0 rounded-control border border-input bg-card text-base text-foreground transition-[border-color] duration-(--duration-fast) outline-none motion-reduce:transition-none',
  'hover:border-foreground',
  'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
  'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
  'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground',
);

// Based on shadcn/ui (new-york). Deviations: 48px tall (touch target, rule 05), a 16px font so
// iOS Safari does not zoom into the field on focus, and the field look above.
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldClassName,
        'flex h-12 px-3.5 py-2 selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold placeholder:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { fieldClassName, Input };
