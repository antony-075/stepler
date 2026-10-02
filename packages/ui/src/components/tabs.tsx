import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
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

// Deviation from shadcn: no grey track. The list is a row of text tabs on a 1px `--border` base
// line; it never widens the page: it is capped at its container and scrolls horizontally inside
// itself when the triggers do not fit (phones, long labels).
function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex w-full max-w-full items-stretch gap-1 overflow-x-auto border-b text-muted-foreground [scrollbar-width:thin]',
        className,
      )}
      {...props}
    />
  );
}

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

export { Tabs, TabsContent, TabsList, TabsTrigger };
