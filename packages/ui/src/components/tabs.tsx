import { Tabs as TabsPrimitive } from 'radix-ui';
import { type ComponentProps, createContext, useContext } from 'react';
import { focusRingInset } from '../lib/focus';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york).
function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex min-w-0 flex-col gap-3', className)}
      {...props}
    />
  );
}

type TabsVariant = 'line' | 'segmented';

const VariantContext = createContext<TabsVariant>('line');

// `line` (default; deviation from shadcn: no grey track): a row of text tabs on a 1px `--border`
// base line; it never widens the page: it is capped at its container and scrolls horizontally
// inside itself when the triggers do not fit (phones, long labels).
// `segmented` (owner review 2026-10-02: tabs that obviously click): a track on the page colour
// with a 1px edge, a 10px radius and 4px padding; full width with equal segments on phones,
// its own width from `sm`.
function TabsList({
  className,
  variant = 'line',
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <VariantContext value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          variant === 'line'
            ? 'flex w-full max-w-full items-stretch gap-1 overflow-x-auto border-b text-muted-foreground [scrollbar-width:thin]'
            : 'grid w-full auto-cols-[minmax(0,1fr)] grid-flow-col gap-1 rounded-[10px] border bg-background p-1 text-muted-foreground sm:inline-grid sm:w-auto sm:auto-cols-auto sm:self-start',
          className,
        )}
        {...props}
      />
    </VariantContext>
  );
}

// A segment: 44px, icon and label (and a count as data), muted until active; hover takes the
// page's hover fill; active is a raised sheet (`--card`, a 1px edge, a soft shadow in light)
// with foreground text. The violet ring is drawn inside.
const SEGMENT = cn(
  'inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-control border border-transparent px-2 text-[0.9375rem] sm:gap-2 sm:px-4 font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-(--duration-fast) motion-reduce:transition-none',
  focusRingInset,
  'hover:bg-hover hover:text-foreground',
  'data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgb(20_22_20/0.08)] data-[state=active]:hover:bg-card',
  'disabled:pointer-events-none disabled:text-muted-foreground',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
);

// Direction C (DESIGN-SYSTEM.md §5.6): 48px tabs, 15px/600 text, muted until active; the active
// tab is foreground with a hand-drawn pencil underline that draws itself in 180ms (pathLength 1,
// stroke-dashoffset 1 → 0; at once under reduced motion). The underline is decorative: the state
// is `aria-selected` and the text colour. Triggers never shrink or wrap, so a long label scrolls
// with the list instead of breaking mid-word. A count goes in the children as data
// (`<span className="type-data">126</span>`).
function TabsTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = useContext(VariantContext);
  if (variant === 'segmented') {
    return (
      <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn(SEGMENT, className)} {...props}>
        {children}
      </TabsPrimitive.Trigger>
    );
  }
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'group/tab relative inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-control px-3 text-[0.9375rem] font-semibold whitespace-nowrap transition-colors duration-(--duration-fast) motion-reduce:transition-none',
        focusRingInset,
        'hover:text-foreground data-[state=active]:text-foreground',
        'disabled:pointer-events-none disabled:text-muted-foreground',
        "[&>svg:not([data-slot=tabs-underline])]:pointer-events-none [&>svg:not([data-slot=tabs-underline])]:shrink-0 [&>svg:not([data-slot=tabs-underline]):not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <svg
        data-slot="tabs-underline"
        aria-hidden="true"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-2 bottom-1.5 h-1.5 w-[calc(100%-1rem)] overflow-visible"
      >
        <path
          d="M2 5 C24 2 50 3 72 5 C84 6 92 4 98 3"
          pathLength={1}
          fill="none"
          stroke="var(--pencil)"
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="[stroke-dasharray:1] [stroke-dashoffset:1] group-data-[state=active]/tab:[stroke-dashoffset:0] motion-safe:transition-[stroke-dashoffset] motion-safe:duration-(--duration-base) motion-safe:ease-out"
        />
      </svg>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'min-w-0 rounded-control outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  );
}

/** A count inside a segment, as data (Geist Mono) on a quiet fill. */
function TabsCount({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="tabs-count"
      className={cn(
        'type-data inline-grid h-5 min-w-5 place-items-center rounded-sheet bg-muted px-1.5 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger, type TabsVariant };
