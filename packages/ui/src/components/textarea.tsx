import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { fieldClassName } from './input';

// Based on shadcn/ui (new-york), with the Input's field look. The field grows with its text
// (`field-sizing: content`) up to max-h-72, then scrolls. 16px font so iOS Safari does not zoom
// on focus.
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldClassName,
        'flex field-sizing-content max-h-72 min-h-24 px-3.5 py-3 selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
