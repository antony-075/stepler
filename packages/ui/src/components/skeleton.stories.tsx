import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Skeleton } from './skeleton';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  render: (args) => (
    <div data-testid="tile" className="grid w-64 gap-3">
      <Skeleton {...args} className="aspect-square w-full" />
      <Skeleton {...args} className="h-4 w-3/4" />
      <Skeleton {...args} className="h-4 w-1/2" />
    </div>
  ),
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const tile = canvas.getByTestId('tile');
    const blocks = tile.querySelectorAll('[data-slot="skeleton"]');
    await expect(blocks).toHaveLength(3);
    // Placeholders are hidden from assistive technology; the page announces loading itself.
    for (const block of blocks) await expect(block).toHaveAttribute('aria-hidden', 'true');
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(
      canvas.getByTestId('tile').querySelectorAll('[data-slot="skeleton"]'),
    ).toHaveLength(3);
  },
};
