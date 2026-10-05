import { Slider as SliderPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york) slider, one thumb (DESIGN-SYSTEM.md §5). The root is 44px tall,
// so the whole row takes a touch, while the track shows 4px of `--input` with an ink range and a
// 20px ink thumb with the violet focus ring. Arrow keys step, Page Up/Down step by ten, Home/End
// go to the ends (Radix). Give it an accessible name (`aria-label` or `aria-labelledby`) and,
// when the number means more than the bare value, `getAriaValueText`.
function Slider({
  className,
  thumbLabel,
  getAriaValueText,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root> & {
  /** The thumb's accessible name (the slider role sits on the thumb). */
  thumbLabel?: string;
  getAriaValueText?: (value: number) => string;
}) {
  const value = props.value?.[0] ?? props.defaultValue?.[0];
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex h-11 w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-full bg-input"
      >
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={thumbLabel}
        {...(getAriaValueText === undefined || value === undefined
          ? {}
          : { 'aria-valuetext': getAriaValueText(value) })}
        className={cn(
          'block size-5 rounded-full border-2 border-background bg-primary shadow-sm transition-transform duration-(--duration-fast) hover:scale-110 motion-reduce:transition-none',
          focusRing,
        )}
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
