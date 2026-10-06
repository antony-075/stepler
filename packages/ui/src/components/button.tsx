import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york), styled for V1 «Графіт» (DESIGN-SYSTEM.md §0.5). Deviations:
// - variants: `default` (indigo, the primary action), `pencil` (the guest's main action; the
//   same accent since V1),
//   `outline`, `ghost`, `destructive` (inside ConfirmDialog); no `secondary` (use `outline`) and
//   no `link` (text links are links);
// - sizes: default 44px on phones and touch, 36px with a mouse from `md` (V1 density); `guest`
//   56px (the guest's main action), `lg` 48px, `icon` 44×44 (36×36 with a mouse from `md`),
//   `adaptive` (icon on phones, default from `sm`), `sm` 36px (32px with a mouse from `md`) for
//   dense rows and quiet header controls; no xs sizes;
// - 6px radius, a 2px focus outline (lib/focus), pressed = scale 0.97 (no colour of its own);
// - disabled is a solid muted fill with muted text, not half-transparent, so a label such as
//   "Wait, checking…" stays readable; `aria-disabled` looks the same.
const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-[color,background-color,border-color,transform] duration-(--duration-fast) ease-out select-none active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
        // Bordered: focus turns the border violet with a soft halo, not a second line (§2.5).
        outline:
          'border border-border-strong bg-card text-foreground hover:border-input hover:bg-hover-card data-[state=open]:border-input focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none',
        ghost:
          'text-foreground hover:bg-hover-ghost active:bg-hover-ghost data-[state=open]:bg-hover-ghost',
      },
      size: {
        default:
          'h-11 px-4 text-[0.9375rem] has-[>svg]:px-3.5 md:pointer-fine:h-9 md:pointer-fine:px-3.5 md:pointer-fine:text-sm md:pointer-fine:has-[>svg]:px-3',
        sm: 'h-9 gap-1.5 px-3 text-sm has-[>svg]:px-2.5 md:pointer-fine:h-8 md:pointer-fine:text-[0.875rem]',
        lg: 'h-12 px-5 text-base has-[>svg]:px-4',
        guest: 'h-14 px-6 type-body-lg font-semibold',
        icon: 'size-11 md:pointer-fine:size-9',
        /** A square icon button on phones (44px, name it with `aria-label`), the default size with
         *  its label from `sm` (hide the label below `sm` with `sr-only sm:not-sr-only`). */
        adaptive:
          'size-11 px-0 text-[0.9375rem] sm:h-11 sm:w-auto sm:px-4 sm:has-[>svg]:px-3.5 md:pointer-fine:h-9 md:pointer-fine:px-3.5 md:pointer-fine:text-sm',
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
  'inline-flex size-11 md:pointer-fine:size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-hover-card hover:text-foreground motion-reduce:transition-none',
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
