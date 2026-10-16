import { Tabs as TabsPrimitive } from 'radix-ui';
import {
  Children,
  type ComponentProps,
  createContext,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
} from 'react';
import { focusRingInset } from '../lib/focus';
import { cn } from '../lib/utils';
import { SegmentThumb } from './segment-thumb';

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

type TabsVariant = 'line' | 'segmented' | 'nav';

const VariantContext = createContext<TabsVariant>('line');

/**
 * The `value` of each trigger child, in order (for the sliding thumb), looking into fragments
 * (a page that builds its triggers once as `<>…</>` for two layouts).
 */
function triggerValues(children: ReactNode): string[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: unknown; children?: ReactNode }>(child)) return [];
    if (child.type === Fragment) return triggerValues(child.props.children);
    return typeof child.props.value === 'string' ? [child.props.value] : [];
  });
}

// `line` (default; deviation from shadcn: no grey track): a row of text tabs on a 1px `--border`
// base line; it never widens the page: it is capped at its container and scrolls horizontally
// inside itself when the triggers do not fit (phones, long labels).
// `segmented` (V1, DESIGN-SYSTEM.md §0.5): equal segments on the grey track with a white thumb
// that slides to the active one; full width below `md` (where the collection page shows icon +
// count only), its own width from `md`.
// `nav` (V1): a vertical list of equal rows (the collection page's mini-nav from 1500px) with a
// soft accent highlight that slides to the active row. Give its Tabs `orientation="vertical"`.
// The thumb follows the active trigger by CSS alone (SegmentThumb).
function TabsList({
  className,
  variant = 'line',
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  const values = variant === 'line' ? [] : triggerValues(children);
  return (
    <VariantContext value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          variant === 'line' &&
            'flex w-full max-w-full items-stretch gap-1 overflow-x-auto border-b text-muted-foreground [scrollbar-width:thin]',
          variant === 'segmented' &&
            'relative isolate grid w-full auto-cols-[minmax(0,1fr)] grid-flow-col rounded-[7px] bg-track p-0.5 text-foreground-soft shadow-[inset_0_0_0_1px_var(--track-edge)] md:inline-grid md:w-auto md:auto-cols-fr md:self-start',
          variant === 'nav' && 'relative isolate flex flex-col text-foreground-soft',
          className,
        )}
        {...props}
      >
        {variant === 'segmented' ? <SegmentThumb count={values.length} /> : null}
        {variant === 'nav' ? (
          <SegmentThumb
            count={values.length}
            orientation="vertical"
            inset="0px"
            className="rounded-control bg-info-soft shadow-none"
          />
        ) : null}
        {children}
      </TabsPrimitive.List>
    </VariantContext>
  );
}

// A segment: 44px on phones and touch, transparent over the track (the thumb shows the active
// one), icon and label (and a count as data), the active one in foreground at 600. The ring is
// drawn inside. 8px side padding (16px from `xl`): the segments are equal, so the collection
// page's four labels («Гостьова сторінка», «Параметри колекції») fit 768px untruncated.
const SEGMENT = cn(
  'relative z-1 inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[5px] px-2 text-[0.875rem] md:pointer-fine:min-h-9 whitespace-nowrap xl:px-4 transition-colors duration-(--duration-fast) motion-reduce:transition-none',
  focusRingInset,
  'hover:text-foreground data-[state=active]:font-semibold data-[state=active]:text-foreground',
  'disabled:pointer-events-none disabled:text-muted-foreground',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-muted-foreground data-[state=active]:[&_svg]:text-primary",
);

// A row of the vertical `nav`: equal heights (the highlight moves by its own height), icon,
// label and an optional count pushed right; the active row on the soft accent with accent ink.
const NAV_ROW = cn(
  'relative z-1 flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-control px-2.5 md:pointer-fine:min-h-9 text-left text-[0.875rem] whitespace-nowrap transition-colors duration-(--duration-fast) motion-reduce:transition-none',
  focusRingInset,
  'hover:text-foreground data-[state=active]:font-semibold data-[state=active]:text-link',
  'disabled:pointer-events-none disabled:text-muted-foreground',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-muted-foreground data-[state=active]:[&_svg]:text-primary",
  '[&_[data-slot=tabs-count]]:ml-auto',
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
  if (variant === 'segmented' || variant === 'nav') {
    return (
      <TabsPrimitive.Trigger
        data-slot="tabs-trigger"
        className={cn(variant === 'nav' ? NAV_ROW : SEGMENT, className)}
        {...props}
      >
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
        // Hidden while inactive as well: with `non-scaling-stroke` Chromium dashes in screen
        // space, so `pathLength` alone left part of the line on inactive tabs.
        className="pointer-events-none absolute inset-x-2 bottom-1.5 h-1.5 w-[calc(100%-1rem)] overflow-visible opacity-0 group-data-[state=active]/tab:opacity-100"
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

/** A count inside a segment or nav row, as data (Geist Mono). */
function TabsCount({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="tabs-count"
      className={cn(
        'type-data inline-grid h-5 min-w-5 place-items-center rounded-[4px] px-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger, type TabsVariant };
