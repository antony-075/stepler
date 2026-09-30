import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { onClick: fn(), children: 'Upload photos' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas }) => {
    // The decorator applies the default global.
    await expect(document.documentElement.dataset.theme).toBe('light');
    await userEvent.click(canvas.getByRole('button', { name: 'Upload photos' }));
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole('button', { name: 'Upload photos' });
    await expect(button).toBeDisabled();
    await userEvent.click(button, { pointerEventsCheck: 0 });
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

/** `aria-disabled` keeps the button focusable (e.g. while pending) but looks like `disabled`. */
export const AriaDisabled: Story = {
  args: { 'aria-disabled': true },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Upload photos' });
    button.focus();
    await expect(button).toHaveFocus();
    await expect(getComputedStyle(button).opacity).toBe('0.5');
    await expect(getComputedStyle(button).pointerEvents).toBe('none');
  },
};

export const IconOnly: Story = {
  args: {
    size: 'icon',
    'aria-label': 'Close',
    children: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Close' });
    // 44px minimum touch target (rule 05).
    await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};
