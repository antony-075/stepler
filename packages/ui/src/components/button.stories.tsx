import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { Button, type ButtonProps } from './button';
import { minTarget } from '../stories/target';

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
    const button = canvas.getByRole('button', { name: 'Upload photos' });
    // Tailwind 4 resets buttons to the arrow; the base layer gives clickables the hand.
    await expect(getComputedStyle(button).cursor).toBe('pointer');
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole('button', { name: 'Upload photos' });
    await expect(button).toBeDisabled();
    await expect(getComputedStyle(button).cursor).toBe('not-allowed');
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
    await expect(getComputedStyle(button).pointerEvents).toBe('none');
    await expect(getComputedStyle(button).cursor).toBe('not-allowed');
    // The primary button turns solid muted rather than half-transparent, so its label stays
    // readable.
    await expect(getComputedStyle(button).opacity).toBe('1');
    await expect(getComputedStyle(button).backgroundColor).toBe('rgb(241, 241, 243)'); // --muted
  },
};

/** Every filled variant turns solid muted when disabled; nothing is half-transparent. */
export const AriaDisabledOutline: Story = {
  args: { 'aria-disabled': true, variant: 'outline' },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Upload photos' });
    await expect(getComputedStyle(button).opacity).toBe('1');
    await expect(getComputedStyle(button).backgroundColor).toBe('rgb(241, 241, 243)'); // --muted
  },
};

/** Keyboard focus draws a 2px violet outline 2px outside the button (`--ring` = `--link`). */
export const FocusRing: Story = {
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Upload photos' });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    const style = getComputedStyle(button);
    await expect(style.outlineStyle).toBe('solid');
    await expect(style.outlineWidth).toBe('2px');
    await expect(style.outlineOffset).toBe('2px');
    await expect(style.outlineColor).toBe('rgb(79, 70, 229)'); // --ring, the accent
  },
};

/** The guest's main action: pencil, 56px. */
export const Guest: Story = {
  args: { variant: 'pencil', size: 'guest', children: 'Додати фото', className: 'w-full' },
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'phone' } },
  render: (args) => (
    <div className="bg-background p-4">
      <Button {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Додати фото' });
    await expect(button.getBoundingClientRect().height).toBe(56);
    await expect(getComputedStyle(button).backgroundColor).toBe('rgb(79, 70, 229)'); // --pencil, the accent since V1
  },
};

export const GuestDark: Story = {
  ...Guest,
  globals: { viewport: { value: 'phone' }, theme: 'dark' },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Додати фото' });
    // Dark text on the peach pencil.
    await expect(getComputedStyle(button).color).toBe('rgb(12, 12, 14)');
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
    await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
  },
};

const VARIANTS = [
  'default',
  'pencil',
  'destructive',
  'outline',
  'ghost',
] as const satisfies readonly NonNullable<ButtonProps['variant']>[];
const SIZES = ['default', 'sm', 'lg', 'guest'] as const satisfies readonly NonNullable<
  ButtonProps['size']
>[];

/** Every variant at every size, enabled and disabled, on a card, so axe checks them all. */
export const AllVariants: Story = {
  render: () => (
    <div className="grid gap-3 rounded-sheet bg-card p-4">
      {SIZES.map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} size={size}>
              {`${variant} ${size}`}
            </Button>
          ))}
          {VARIANTS.map((variant) => (
            <Button key={`${variant}-disabled`} variant={variant} size={size} disabled>
              {`${variant} ${size} disabled`}
            </Button>
          ))}
          <Button variant="outline" size="icon" aria-label={`icon ${size}`}>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Button>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const size of SIZES) {
      for (const variant of VARIANTS) {
        const button = canvas.getByRole('button', { name: `${variant} ${size}` });
        await expect(button).toHaveAttribute('data-variant', variant);
        await expect(button).toHaveAttribute('data-size', size);
      }
    }
  },
};

export const AllVariantsDark: Story = {
  ...AllVariants,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('button', { name: 'destructive lg' })).toBeVisible();
  },
};

/** Ghost buttons sit on the page: transparent at rest, `--hover` when hovered or open. */
export const GhostOnPage: Story = {
  args: { variant: 'ghost', children: 'anna@example.com' },
  render: (args) => (
    <div className="flex min-h-40 items-center justify-center bg-background p-6">
      <Button {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'anna@example.com' });
    await expect(getComputedStyle(button).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    // Synthetic hover does not reach CSS `:hover`; the open state (a menu trigger) uses the same
    // fill, so assert it there.
    button.dataset.state = 'open';
    await waitFor(() =>
      expect(getComputedStyle(button).backgroundColor).toBe('rgba(24, 24, 27, 0.06)'),
    );
    delete button.dataset.state;
  },
};

export const GhostOnPageDark: Story = {
  ...GhostOnPage,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'anna@example.com' });
    button.dataset.state = 'open';
    await waitFor(() =>
      expect(getComputedStyle(button).backgroundColor).toBe('rgba(244, 244, 245, 0.08)'),
    );
    delete button.dataset.state;
  },
};
