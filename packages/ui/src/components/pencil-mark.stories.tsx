import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { PencilMark } from './pencil-mark';

const meta = {
  title: 'Components/PencilMark',
  component: PencilMark,
  args: { variant: 'circle', seed: 0 },
  render: () => (
    <div className="grid gap-6">
      {(['circle', 'underline', 'cross'] as const).map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-6">
          {[0, 1, 2, 3, 4].map((seed) => (
            <PencilMark
              key={seed}
              variant={variant}
              seed={seed}
              className={
                variant === 'circle'
                  ? 'h-6 w-12'
                  : variant === 'underline'
                    ? 'h-1.5 w-11'
                    : 'size-24'
              }
            />
          ))}
        </div>
      ))}
    </div>
  ),
} satisfies Meta<typeof PencilMark>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five shapes per variant; always decorative; the cross is destructive, the rest pencil. */
export const Variants: Story = {
  play: async ({ canvasElement }) => {
    const marks = Array.from(canvasElement.querySelectorAll('[data-slot="pencil-mark"]'));
    await expect(marks).toHaveLength(15);
    for (const mark of marks) await expect(mark).toHaveAttribute('aria-hidden', 'true');
    const shapes = new Set(marks.map((mark) => mark.querySelector('path')!.getAttribute('d')));
    await expect(shapes.size).toBe(15);
    const cross = canvasElement.querySelector<SVGElement>('[data-variant="cross"]')!;
    const circle = canvasElement.querySelector<SVGElement>('[data-variant="circle"]')!;
    await expect(getComputedStyle(cross).color).not.toBe(getComputedStyle(circle).color);
  },
};

/** With motion the stroke draws once (180ms) and ends whole. */
export const Draws: Story = {
  play: async ({ canvasElement }) => {
    const path = canvasElement.querySelector('path')!;
    await expect(getComputedStyle(path).animationName).toBe('pencil-draw');
    await expect(getComputedStyle(path).animationIterationCount).toBe('1');
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="pencil-mark"]')).toHaveLength(15);
  },
};

/** Under reduced motion the stroke is simply there: no animation, offset 0. */
export const ReducedMotion: Story = {
  tags: ['!dev', 'reduced-motion'],
  play: async ({ canvasElement }) => {
    await expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
    for (const path of canvasElement.querySelectorAll('path')) {
      await expect(getComputedStyle(path).animationName).toBe('none');
      await expect(parseFloat(getComputedStyle(path).strokeDashoffset)).toBe(0);
    }
  },
};
