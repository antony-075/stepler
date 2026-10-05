import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent } from 'storybook/test';
import { Slider } from './slider';

/** A labelled slider with its value read out beside it, as the guest page editor's «Затемнення». */
function Dimming({ min = 50, max = 90 }: { min?: number; max?: number }) {
  const [value, setValue] = useState(60);
  return (
    <div className="grid max-w-sm grid-cols-[auto_minmax(0,1fr)_3ch] items-center gap-3">
      <span id="dim-label" className="text-sm font-semibold">
        Затемнення
      </span>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([next]) => setValue(next ?? value)}
        aria-labelledby="dim-label"
        thumbLabel="Затемнення"
        getAriaValueText={(v) => `${v}%`}
      />
      <span className="type-data text-sm tabular-nums">{value}%</span>
    </div>
  );
}

const meta = {
  title: 'Components/Slider',
  component: Dimming,
} satisfies Meta<typeof Dimming>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Keyboard: Story = {
  play: async ({ canvas }) => {
    const thumb = canvas.getByRole('slider', { name: 'Затемнення' });
    await expect(thumb).toHaveAttribute('aria-valuenow', '60');
    await expect(thumb).toHaveAttribute('aria-valuetext', '60%');
    thumb.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(thumb).toHaveAttribute('aria-valuenow', '62');
    await userEvent.keyboard('{End}');
    await expect(thumb).toHaveAttribute('aria-valuenow', '90');
    await userEvent.keyboard('{Home}');
    await expect(canvas.getByText('50%')).toBeVisible();
    // The whole row takes a touch: 44px.
    const root = thumb.closest<HTMLElement>('[data-slot="slider"]')!;
    await expect(root.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};

/** At 320px the slider shrinks with the row; nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: 'small' } },
  play: async () => {
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
