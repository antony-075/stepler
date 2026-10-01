import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Progress } from './progress';

const meta = {
  title: 'Components/Progress',
  component: Progress,
  args: { label: 'Uploading 3 of 12 files', value: 40, valueText: '40%, about a minute left' },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Determinate: Story = {
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('progressbar', { name: 'Uploading 3 of 12 files' });
    await expect(bar).toHaveAttribute('aria-valuenow', '40');
    await expect(bar).toHaveAttribute('aria-valuetext', '40%, about a minute left');
  },
};

export const DeterminateDark: Story = {
  ...Determinate,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  },
};

export const Indeterminate: Story = {
  args: { value: null, label: 'Preparing upload', valueText: undefined },
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('progressbar', { name: 'Preparing upload' });
    await expect(bar).not.toHaveAttribute('aria-valuenow');
    await expect(bar).toHaveAttribute('data-state', 'indeterminate');
  },
};
