import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { Button, type ButtonProps } from './button';

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

const VARIANTS = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
] as const satisfies readonly NonNullable<ButtonProps['variant']>[];
const SIZES = ['default', 'sm', 'lg'] as const satisfies readonly NonNullable<
  ButtonProps['size']
>[];

/** Every variant at every size, enabled and disabled, on a card, so axe checks them all. */
export const AllVariants: Story = {
  render: () => (
    <div className="grid gap-3 rounded-[20px] bg-card p-4">
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

/**
 * Ghost buttons sit directly on the page atmosphere: hover and open use a translucent foreground
 * tint that blends with the warm background instead of the cool grey muted surface.
 */
export const GhostOnAtmosphere: Story = {
  args: { variant: 'ghost', children: 'anna@example.com', className: 'text-foreground' },
  render: (args) => (
    <div className="stepler-atmosphere flex min-h-40 items-center justify-center bg-background p-6">
      <Button {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'anna@example.com' });
    await expect(getComputedStyle(button).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    // Synthetic hover does not reach CSS `:hover`; the open state (a menu trigger) uses the same
    // tint, so assert it there.
    button.dataset.state = 'open';
    // A translucent tint, never an opaque surface.
    await waitFor(() =>
      expect(getComputedStyle(button).backgroundColor).toMatch(/\/ 0\.06\)$|, 0\.06\)$/),
    );
    delete button.dataset.state;
  },
};

export const GhostOnAtmosphereDark: Story = {
  ...GhostOnAtmosphere,
  globals: { theme: 'dark' },
};
