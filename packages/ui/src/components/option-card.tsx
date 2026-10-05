'use client';

import { Check } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { type ComponentProps, type ReactNode, useId } from 'react';
import { focusHalo } from '../lib/focus';
import { cn } from '../lib/utils';

/**
 * A single choice shown as cards, each with a picture (DESIGN-SYSTEM.md §5.2; the theme on
 * /app/settings). A Radix radio group: one tab stop, arrows move and select, Space selects. Name
 * it with `aria-label` or `aria-labelledby`. The cards sit in one row from `sm` (three fit a
 * settings panel), stacked on phones.
 */
function OptionCardGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="option-card-group"
      className={cn('grid gap-3 sm:auto-cols-fr sm:grid-flow-col', className)}
      {...props}
    />
  );
}

type OptionCardProps = Omit<ComponentProps<typeof RadioGroupPrimitive.Item>, 'children'> & {
  /** The option's name; the radio's accessible name. */
  title: string;
  /** One line under the title; the radio's description. */
  description?: string;
  /** The picture above the title (decorative, hidden from assistive technology). */
  preview?: ReactNode;
};

/**
 * One card: the picture, the title (15px/600) and a muted line. Selected: a 1px `--foreground`
 * edge like a selected filter chip and an ink check in the corner, so the choice never rests on
 * colour alone (`aria-checked` says it too). Hover darkens the edge; focus is the violet ring.
 */
function OptionCard({ className, title, description, preview, ...props }: OptionCardProps) {
  const id = useId();
  return (
    <RadioGroupPrimitive.Item
      data-slot="option-card"
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      className={cn(
        'group/option relative grid min-w-0 content-start gap-3 rounded-sheet border bg-card p-3 text-left transition-[border-color] duration-(--duration-fast) motion-reduce:transition-none',
        focusHalo,
        'data-[state=checked]:focus-visible:border-ring',
        'hover:border-input data-[state=checked]:border-foreground',
        'disabled:cursor-not-allowed disabled:text-muted-foreground',
        className,
      )}
      {...props}
    >
      {preview ? (
        <span data-slot="option-card-preview" aria-hidden="true" className="block">
          {preview}
        </span>
      ) : null}
      <span className="grid gap-0.5 px-1 pb-1">
        <span id={`${id}-title`} className="text-[0.9375rem] font-semibold">
          {title}
        </span>
        {description ? (
          <span id={`${id}-description`} className="text-sm leading-[1.45] text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <RadioGroupPrimitive.Indicator
        data-slot="option-card-check"
        className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"
      >
        <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { OptionCard, OptionCardGroup, type OptionCardProps };
