import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { Alert } from './alert';
import { Button } from './button';
import { minTarget } from '../stories/target';

const meta = {
  title: 'Components/Alert',
  component: Alert,
  args: {
    title: 'Upload paused',
    children: 'You are offline. Uploads continue when the connection is back.',
  },
  decorators: [
    (Story) => (
      <div className="w-96 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: { variant: 'info' },
  play: async ({ canvas, canvasElement }) => {
    const alert = canvas.getByRole('status');
    await expect(alert).toHaveTextContent('Upload paused');
    await expect(alert).toHaveAttribute('data-variant', 'info');
    // The icon is decorative.
    await expect(canvasElement.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  },
};

export const Success: Story = {
  args: { variant: 'success', title: 'Link copied', children: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Link copied');
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};

export const SuccessDark: Story = {
  ...Success,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('status')).toBeVisible();
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    title: 'Almost full',
    children: 'This collection has 2 GB of storage left.',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveAttribute('data-variant', 'warning');
  },
};

export const WarningDark: Story = {
  ...Warning,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('status')).toBeVisible();
  },
};

export const Error: Story = {
  args: {
    variant: 'error',
    title: undefined,
    children: 'This sign-in link has expired. Request a new one.',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'This sign-in link has expired. Request a new one.',
    );
    await expect(canvas.queryByRole('status')).toBeNull();
  },
};

export const ErrorDark: Story = {
  ...Error,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('alert')).toBeVisible();
  },
};

const onRetry = fn();

export const WithAction: Story = {
  args: {
    variant: 'error',
    title: 'Upload failed',
    children: '3 files were not uploaded.',
    action: (
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    const retry = canvas.getByRole('button', { name: 'Retry' });
    await userEvent.click(retry);
    await expect(onRetry).toHaveBeenCalledTimes(1);
    await expect(retry.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
  },
};
