import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york), styled for direction C (DESIGN-SYSTEM.md §5.1). Deviations:
// - variants: `default` (ink, the admin primary), `pencil` (only the guest's main action),
//   `outline`, `ghost`, `destructive` (inside ConfirmDialog); no `secondary` (use `outline`) and
//   no `link` (text links are links);
// - sizes: default 44px, `guest` 56px (the guest's main action), `lg` 48px, `icon` 44×44, `sm`
//   36px for dense pointer-first rows only, never the primary action on touch; no xs sizes;
// - 8px radius, a 2px focus outline (lib/focus), pressed = scale 0.98 (no colour of its own);
// - disabled is a solid muted fill with muted text, not half-transparent, so a label such as
//   "Wait, checking…" stays readable; `aria-disabled` looks the same.
const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-[color,background-color,border-color,transform] duration-(--duration-fast) ease-out select-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    focusRing,
    'disabled:pointer-events-none aria-disabled:pointer-events-none',
  ),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
        pencil: 'bg-pencil text-pencil-foreground hover:bg-pencil-hover active:bg-pencil-active',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-active',
        outline:
          'border border-input bg-card text-foreground hover:border-foreground data-[state=open]:border-foreground',
        ghost: 'text-foreground hover:bg-hover active:bg-hover data-[state=open]:bg-hover',
      },
      size: {
        default: 'h-11 px-4 text-[0.9375rem] has-[>svg]:px-3.5',
        sm: 'h-9 gap-1.5 px-3 text-sm has-[>svg]:px-2.5',
        lg: 'h-12 px-5 text-base has-[>svg]:px-4',
        guest: 'h-14 px-6 type-body-lg font-semibold',
        icon: 'size-11',
      },
    },
    compoundVariants: [
      {
        variant: ['default', 'pencil', 'destructive', 'outline'],
        className:
          'disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground aria-disabled:border-transparent aria-disabled:bg-muted aria-disabled:text-muted-foreground',
      },
      {
        variant: 'ghost',
        className:
          'disabled:bg-transparent disabled:text-muted-foreground aria-disabled:bg-transparent aria-disabled:text-muted-foreground',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/** The 44px icon-only close button of dialogs and toasts (muted, not a primary action). */
const closeButtonClassName = cn(
  'inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-hover-card hover:text-foreground motion-reduce:transition-none',
  focusRing,
);

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
