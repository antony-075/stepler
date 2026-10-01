import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Separator } from './separator';

const meta = {
  title: 'Components/Separator',
  component: Separator,
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-80 max-w-full">
      <p>Photos</p>
      <Separator className="my-3" />
      <p>Videos</p>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    // Decorative by default: hidden from assistive technology.
    await expect(canvas.queryByRole('separator')).toBeNull();
    const line = canvasElement.querySelector('[data-slot="separator"]');
    await expect(line).toHaveAttribute('data-orientation', 'horizontal');
    await expect(line?.getBoundingClientRect().height).toBe(1);
  },
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-6 items-center gap-3">
      <span>Photos</span>
      <Separator orientation="vertical" />
      <span>Videos</span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const line = canvasElement.querySelector('[data-slot="separator"]');
    await expect(line).toHaveAttribute('data-orientation', 'vertical');
    await expect(line?.getBoundingClientRect().width).toBe(1);
  },
};

export const Semantic: Story = {
  render: () => (
    <div className="w-80 max-w-full">
      <p>Owner</p>
      <Separator decorative={false} className="my-3" />
      <p>Guests</p>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('separator')).toBeVisible();
  },
};

export const Dark: Story = {
  ...Horizontal,
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvasElement.querySelector('[data-slot="separator"]')).toBeVisible();
  },
};
