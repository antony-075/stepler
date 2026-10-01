import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york), styled with the v4 tokens. Deviation: default, lg and icon meet a 44px touch target
// (rule 05); the xs sizes are removed. `sm` (36px) is for dense pointer-first layouts only
// (e.g. admin tables) and must not be the primary action on touch screens.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-base font-bold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/70 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Disabled: a solid muted fill instead of a half-transparent primary, so the label (often
        // the reason, "Wait, checking…") stays readable.
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:opacity-100 aria-disabled:shadow-none',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/70',
        outline: 'border border-input bg-card hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // A translucent foreground tint rather than `bg-muted`: ghost buttons sit on the page
        // (often the warm `stepler-atmosphere`), where the cool grey muted surface clashes.
        ghost:
          'text-primary hover:bg-foreground/[0.06] active:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.06]',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-9 gap-1.5 px-3 text-sm has-[>svg]:px-2.5',
        lg: 'h-12 px-6 has-[>svg]:px-4',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/** The 44px icon-only close button of dialogs and toasts (muted, not a primary action). */
const closeButtonClassName =
  'inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/70';

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants, closeButtonClassName, type ButtonProps };
