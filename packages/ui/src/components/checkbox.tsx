import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york). The box is 20px with a 2px radius; checked is an ink fill with a
// white check (not the pencil: the pencil marks frames, a checkbox is a setting). Wrap it in a
// `Label` row of min-h-11 so the whole row is the 44px touch target (see the story).
function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-5 shrink-0 rounded-frame border border-input bg-card transition-[background-color,border-color] duration-(--duration-fast) motion-reduce:transition-none',
        focusRing,
        'hover:border-foreground',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'disabled:cursor-not-allowed disabled:bg-muted data-[state=checked]:disabled:border-muted-foreground data-[state=checked]:disabled:bg-muted-foreground',
        'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
