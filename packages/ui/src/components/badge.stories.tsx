import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Badge, type BadgeVariant } from './badge';

const VARIANTS: { variant: BadgeVariant; text: string }[] = [
  { variant: 'neutral', text: 'Archived' },
  { variant: 'info', text: 'Draft' },
  { variant: 'success', text: 'Active' },
  { variant: 'warning', text: 'Expires soon' },
  { variant: 'danger', text: 'Revoked' },
];

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: 'Active' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every variant on the card surface, where badges usually sit; axe checks the contrast. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 rounded-[20px] bg-card p-4">
      {VARIANTS.map(({ variant, text }) => (
        <Badge key={variant} variant={variant}>
          {text}
        </Badge>
      ))}
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    for (const { variant, text } of VARIANTS) {
      await expect(canvas.getByText(text).closest('[data-slot="badge"]')).toHaveAttribute(
        'data-variant',
        variant,
      );
    }
    // Status text, not a control: nothing to tab to.
    await expect(canvasElement.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
  },
};

export const AllVariantsDark: Story = {
  ...AllVariants,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByText('Revoked')).toBeVisible();
  },
};

export const OnPageBackground: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 bg-background p-4">
      {VARIANTS.map(({ variant, text }) => (
        <Badge key={variant} variant={variant}>
          {text}
        </Badge>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Archived')).toBeVisible();
  },
};

export const OnPageBackgroundDark: Story = {
  ...OnPageBackground,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByText('Archived')).toBeVisible();
  },
};

const LONG_NAME = 'anna.and.taras.wedding.guests.from.lviv@example-collection.com';

/** Long text truncates inside its container; the caller passes the full text as `title`. */
export const LongText: Story = {
  globals: { viewport: { value: 'phone' } },
  render: () => (
    <div className="w-full min-w-0">
      <Badge variant="info" title={LONG_NAME}>
        {LONG_NAME}
      </Badge>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(window.innerWidth).toBe(360);
    const text = canvas.getByText(LONG_NAME);
    await expect(text.closest('[data-slot="badge"]')).toHaveAttribute('title', LONG_NAME);
    // Truncated, not wrapped or overflowing.
    await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
