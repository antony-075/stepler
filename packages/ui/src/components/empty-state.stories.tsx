import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImagePlus } from 'lucide-react';
import { expect, fn, userEvent } from 'storybook/test';
import { Button } from './button';
import { EmptyState } from './empty-state';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
  args: {
    icon: <ImagePlus />,
    title: 'No photos yet',
    description: 'Share the link with guests, or upload the first photos yourself.',
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'No photos yet' })).toBeVisible();
    await expect(canvasElement.querySelector('[data-slot="empty-state-icon"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  },
};

const onUpload = fn();

export const WithAction: Story = {
  args: {
    headingLevel: 3,
    action: <Button onClick={onUpload}>Upload photos</Button>,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 3, name: 'No photos yet' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { level: 2 })).toBeNull();

    const button = canvas.getByRole('button', { name: 'Upload photos' });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(onUpload).toHaveBeenCalledTimes(1);
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('heading', { name: 'No photos yet' })).toBeVisible();
  },
};
