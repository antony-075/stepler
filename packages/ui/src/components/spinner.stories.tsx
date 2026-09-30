import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Spinner } from './spinner';

const meta = {
  title: 'Components/Spinner',
  component: Spinner,
  args: { label: 'Loading photos' },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const status = canvas.getByRole('status', { name: 'Loading photos' });
    await expect(status).toHaveTextContent('Loading photos');
    // The ring is decorative; the label is visually hidden but announced.
    await expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('status', { name: 'Loading photos' })).toBeInTheDocument();
  },
};
