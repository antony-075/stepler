import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronLeft, Plus } from 'lucide-react';
import { expect } from 'storybook/test';
import { Button } from './button';
import { PageHeader } from './page-header';

const meta = {
  title: 'Components/PageHeader',
  component: PageHeader,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'Collections',
    description: 'Everything your guests have shared, one collection per event.',
    actions: (
      <Button>
        <Plus aria-hidden="true" />
        New collection
      </Button>
    ),
  },
  decorators: [
    (Story) => (
      <main className="stepler-container py-6">
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

function parts(canvasElement: HTMLElement) {
  const title = canvasElement.querySelector('h1');
  const actions = canvasElement.querySelector('[data-slot="page-header-actions"]');
  if (!title || !actions) throw new Error('page header parts missing');
  return { title: title.getBoundingClientRect(), actions: actions.getBoundingClientRect() };
}

/** On phones the actions stack under the title. */
export const WithActions: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas, canvasElement }) => {
    await expect(window.innerWidth).toBe(360);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Collections' })).toBeVisible();
    const { title, actions } = parts(canvasElement);
    await expect(actions.top).toBeGreaterThan(title.bottom);
    await expect(canvas.getByRole('button', { name: 'New collection' })).toBeVisible();
  },
};

/** From `sm` the actions sit on the title's row, aligned right. */
export const WithActionsLaptop: Story = {
  globals: { viewport: { value: 'laptop' } },
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(1280);
    const { title, actions } = parts(canvasElement);
    await expect(actions.top).toBeLessThan(title.bottom);
    await expect(actions.left).toBeGreaterThan(title.right);
    const container = canvasElement.querySelector('main');
    if (!container) throw new Error('container missing');
    // Aligned with the container's content edge (the 32px gutter from `lg`).
    await expect(Math.round(container.getBoundingClientRect().right - actions.right)).toBe(32);
  },
};

/** An optional link slot above the title. */
export const WithBack: Story = {
  args: {
    back: (
      <a href="#collections" className="inline-flex min-h-11 items-center gap-1 text-primary">
        <ChevronLeft aria-hidden="true" className="size-4" />
        All collections
      </a>
    ),
    title: 'Anna and Taras, wedding',
    description: undefined,
  },
  play: async ({ canvas, canvasElement }) => {
    const back = canvas.getByRole('link', { name: 'All collections' });
    const title = canvas.getByRole('heading', { level: 1, name: 'Anna and Taras, wedding' });
    await expect(back.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      title.getBoundingClientRect().top,
    );
    // The back link does not poke out above the header.
    const header = canvasElement.querySelector('[data-slot="page-header"]')!;
    await expect(back.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      header.getBoundingClientRect().top,
    );
    await expect(canvasElement.querySelectorAll('h1')).toHaveLength(1);
  },
};

export const TitleOnly: Story = {
  args: { description: undefined, actions: undefined },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Collections' })).toBeVisible();
    await expect(canvasElement.querySelector('[data-slot="page-header-actions"]')).toBeNull();
  },
};

const LONG_NAME = 'anna.and.taras.wedding.in.lviv.photos@example-family.com'.padEnd(60, 'x');

/** A 60-character unbroken name at 360px wraps inside the page (Review Focus 5). */
export const LongTitle: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { title: LONG_NAME, description: LONG_NAME },
  play: async ({ canvas, canvasElement }) => {
    await expect(window.innerWidth).toBe(360);
    await expect(LONG_NAME.length).toBe(60);
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(LONG_NAME);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** The container keeps a 16px gutter on phones. */
export const ContainerPhone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvasElement }) => {
    const title = canvasElement.querySelector('h1');
    if (!title) throw new Error('title missing');
    await expect(Math.round(title.getBoundingClientRect().left)).toBe(16);
  },
};

/** The admin area uses `compact`: the admin h1, 44px from 1280px (32px at 768, 28px on phones). */
export const Compact: Story = {
  args: {
    size: 'compact',
    title: 'Settings',
    description: 'How your workspace looks and which language it uses.',
    actions: undefined,
  },
  globals: { viewport: { value: 'laptop' } },
  play: async ({ canvas }) => {
    const title = canvas.getByRole('heading', { level: 1, name: 'Settings' });
    await expect(getComputedStyle(title).fontSize).toBe('44px');
    await expect(title).toHaveAttribute('data-size', 'compact');
  },
};

export const CompactPhone: Story = {
  ...Compact,
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    const title = canvas.getByRole('heading', { level: 1, name: 'Settings' });
    await expect(getComputedStyle(title).fontSize).toBe('28px');
  },
};

/** A back link with a long unbroken label (a collection title) truncates on a phone. */
export const LongBackPhone: Story = {
  args: {
    back: (
      <a href="#collection" className="inline-flex min-h-11 max-w-full items-center gap-1">
        <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{'Ж'.repeat(100)}</span>
      </a>
    ),
    title: 'Collection settings',
    description: undefined,
    actions: undefined,
  },
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    const back = canvas.getByRole('link');
    await expect(back.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth - 16);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
