import type { ComponentProps } from 'react';
import { fieldFocus } from '../lib/focus';
import { cn } from '../lib/utils';

/**
 * The field look shared by Input, Textarea and SelectTrigger (DESIGN-SYSTEM.md §5.2): a sheet
 * with a 1px `--input` edge and an 8px radius; hover darkens the edge to `--foreground`; focus
 * (any focus) turns it violet with a soft violet halo, no outline (owner remark 103); invalid
 * uses `--destructive` for both; disabled is a
 * muted fill with muted text (readable, not half-transparent).
 */
const fieldClassName = cn(
  'w-full min-w-0 rounded-control border border-input bg-card text-base text-foreground transition-[border-color,box-shadow] duration-(--duration-fast) motion-reduce:transition-none',
  'hover:border-foreground',
  fieldFocus,
  'aria-invalid:border-destructive aria-invalid:focus:border-destructive aria-invalid:focus:ring-destructive/25',
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
