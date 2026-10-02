import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// The sheet of direction C (DESIGN-SYSTEM.md §5.3), replacing shadcn's Card: `--card`, a 4px
// radius, a 1px `--border` edge in both themes (the sheet-to-page contrast alone is 1.07 in
// light), no shadow. `panel` (default) is for settings and lists: padding lives on each section
// and rows inside are split with `divide-y`. `sheet` has no padding of its own: a contact grid
// or a list of rows fills it edge to edge.
const panelVariants = cva(
  'flex min-w-0 flex-col rounded-sheet border bg-card text-card-foreground',
  {
    variants: {
      variant: {
        panel: '',
        sheet: 'overflow-hidden',
      },
    },
    defaultVariants: { variant: 'panel' },
  },
);

type PanelProps = ComponentProps<'div'> & VariantProps<typeof panelVariants>;

function Panel({ className, variant = 'panel', ...props }: PanelProps) {
  return (
    <div
      data-slot="panel"
      data-variant={variant}
      className={cn(panelVariants({ variant }), className)}
      {...props}
    />
  );
}

// Sections share one padding scale (16px on phones, 24px from `sm`). A section followed by
// another panel section drops its bottom padding, so header → content reads as one block; a
// Separator or any other sibling keeps the full padding. Long unbroken text wraps instead of
// widening the panel: the title, the description and paragraphs inside content.
const BEFORE_SECTION = '[&:has(+[data-slot=panel-content],+[data-slot=panel-footer])]:pb-0';

function PanelHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-header"
      className={cn('grid gap-1 p-4 sm:p-6', BEFORE_SECTION, className)}
      {...props}
    />
  );
}

/** An `h2` by default (`asChild` for another level), sized as a panel heading (16 / 17px). */
function PanelTitle({
  className,
  asChild = false,
  ...props
}: ComponentProps<'h2'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'h2';

  return (
    <Comp
      data-slot="panel-title"
      className={cn('type-h3 [overflow-wrap:anywhere]', className)}
      {...props}
    />
  );
}

function PanelDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="panel-description"
      className={cn(
        'text-sm leading-[1.45] text-muted-foreground [overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    />
  );
}

function PanelContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-content"
      className={cn(
        'p-4 sm:p-6 [[data-slot=panel-header]+&]:pt-3 [&_p]:[overflow-wrap:anywhere]',
        BEFORE_SECTION,
        className,
      )}
      {...props}
    />
  );
}

function PanelFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-footer"
      className={cn(
        'flex flex-wrap items-center gap-3 p-4 sm:p-6 [[data-slot^=panel-]+&]:pt-4',
        className,
      )}
      {...props}
    />
  );
}

export {
  Panel,
  PanelContent,
  PanelDescription,
  PanelFooter,
  PanelHeader,
  PanelTitle,
  panelVariants,
  type PanelProps,
};
