import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york), with the same edge, focus and invalid styles as Input. The field
// grows with its text (`field-sizing: content`) up to max-h-72, then scrolls. 16px font so iOS
// Safari does not zoom on focus.
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content max-h-72 min-h-24 w-full min-w-0 rounded-lg border border-input bg-card px-3.5 py-3 text-base font-medium transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
        'hover:border-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
