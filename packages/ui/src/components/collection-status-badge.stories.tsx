import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { CollectionStatusBadge, type CollectionDisplayStatus } from './collection-status-badge';

const STATUSES: { status: CollectionDisplayStatus; label: string; variant: string }[] = [
  { status: 'BLOCKED', label: 'Заблоковано', variant: 'danger' },
  { status: 'DELETING', label: 'Видаляється', variant: 'neutral' },
  { status: 'ARCHIVED', label: 'В архіві', variant: 'neutral' },
  { status: 'ACTIVE', label: 'Активна', variant: 'success' },
];

const meta = {
  title: 'Components/CollectionStatusBadge',
  component: CollectionStatusBadge,
  args: { status: 'ACTIVE', label: 'Активна' },
} satisfies Meta<typeof CollectionStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every display status on the card surface; blocked is the only red one, active the only green. */
export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 rounded-sheet bg-card p-4">
      {STATUSES.map(({ status, label }) => (
        <CollectionStatusBadge key={status} status={status} label={label} />
      ))}
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    for (const { status, label, variant } of STATUSES) {
      const badge = canvas.getByText(label).closest('[data-slot="collection-status"]');
      await expect(badge).toHaveAttribute('data-status', status);
      await expect(badge).toHaveAttribute('data-variant', variant);
    }
    // Blocked, deleting and archived carry an icon; active keeps the dot.
    await expect(canvasElement.querySelectorAll('[data-slot="badge-icon"]')).toHaveLength(3);
    await expect(canvasElement.querySelectorAll('[data-slot="badge-dot"]')).toHaveLength(1);
    // Status text, not a control.
    await expect(canvasElement.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
  },
};

export const AllStatusesDark: Story = {
  ...AllStatuses,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByText('Заблоковано')).toBeVisible();
  },
};

/** The dashboard's long form of the active status. */
export const ActiveLong: Story = {
  args: { status: 'ACTIVE', label: 'Колекція активна' },
};

export const Blocked: Story = {
  args: { status: 'BLOCKED', label: 'Blocked' },
};
