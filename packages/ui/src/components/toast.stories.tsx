import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Toaster, ToastProvider, useToast } from './toast';

type TriggerProps = {
  title?: string;
  description?: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
  count?: number;
  durationMs?: number;
};

function Trigger({
  title = 'Link copied',
  description,
  variant,
  count = 1,
  durationMs,
}: TriggerProps) {
  const { toast } = useToast();
  return (
    <Button
      onClick={() => {
        for (let i = 1; i <= count; i += 1) {
          toast({ title: count > 1 ? `${title} ${i}` : title, description, variant, durationMs });
        }
      }}
    >
      Show toast
    </Button>
  );
}

const withToaster: Decorator = (Story) => (
  <ToastProvider announcementLabel="Notification">
    <Story />
    <Toaster label="Notifications" closeLabel="Close" />
  </ToastProvider>
);

const meta = {
  title: 'Components/Toast',
  component: Trigger,
  decorators: [withToaster],
} satisfies Meta<typeof Trigger>;

export default meta;
type Story = StoryObj<typeof meta>;

function toasts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="toast"]'));
}

/** Review Focus 4: the toast is announced politely through a `status` live region. */
export const Success: Story = {
  args: { variant: 'success', description: 'Guests can open it now.' },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    // Radix renders the announcement text on the next frame.
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Notification Link copied'));
    await expect(status).toHaveAttribute('aria-live', 'polite');
    const [toast] = toasts();
    await expect(toast).toBeVisible();
    await expect(toast).toHaveTextContent('Guests can open it now.');
    await expect(toast).toHaveClass('bg-success-soft');
    await expect(screen.getByRole('region', { name: /Notifications/ })).toBeInTheDocument();
  },
};

export const SuccessDark: Story = {
  ...Success,
  globals: { theme: 'dark' },
};

export const Error: Story = {
  args: { variant: 'error', title: 'Could not copy the link' },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await expect(await screen.findByRole('status')).toHaveAttribute('aria-live', 'assertive');
    await expect(toasts()[0]).toHaveAttribute('data-variant', 'error');
    await expect(toasts()[0]).toHaveClass('bg-destructive-soft');
  },
};

export const ErrorDark: Story = {
  ...Error,
  globals: { theme: 'dark' },
};

/** A thing put on hold (a paused link): the warning icon, announced politely like success. */
export const Warning: Story = {
  args: { variant: 'warning', title: 'Link paused' },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await expect(await screen.findByRole('status')).toHaveAttribute('aria-live', 'polite');
    const [toast] = toasts();
    await expect(toast).toHaveAttribute('data-variant', 'warning');
    await expect(toast?.querySelector('svg')).toHaveClass('text-warning');
    // Tinted in the variant's soft fill (owner review 2026-10-02), not the white popover.
    await expect(toast).toHaveClass('bg-warning-soft');
  },
};

export const WarningDark: Story = {
  ...Warning,
  globals: { theme: 'dark' },
};

export const Info: Story = {
  args: { variant: 'info', title: 'Uploads resume when you are back online' },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await waitFor(() => expect(toasts()).toHaveLength(1));
    await expect(toasts()[0]).toHaveAttribute('data-variant', 'info');
    await expect(toasts()[0]).toHaveClass('bg-info-soft');
  },
};

export const InfoDark: Story = {
  ...Info,
  globals: { theme: 'dark' },
};

export const Dismiss: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    const close = await screen.findByRole('button', { name: 'Close' });
    await expect(close.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.click(close);
    await waitFor(() => expect(toasts()).toHaveLength(0));
  },
};

/** At most three toasts are visible; the oldest ones are dropped. */
export const Stack: Story = {
  args: { count: 5 },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await waitFor(() => expect(toasts()).toHaveLength(3));
    const titles = toasts().map((toast) => toast.textContent);
    await expect(titles.some((text) => text?.includes('Link copied 5'))).toBe(true);
    await expect(titles.some((text) => text?.includes('Link copied 1'))).toBe(false);
  },
};

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Review Focus 4: on a 360px phone the toast sits above the bottom gutter and does not cover a
 * fixed bottom primary action (marked `data-toast-avoid`).
 */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { title: 'Collection saved' },
  render: (args) => (
    <>
      <Trigger {...args} />
      <div data-toast-avoid="" className="fixed inset-x-0 bottom-0 border-t bg-card p-4">
        <Button className="w-full">Upload photos</Button>
      </div>
    </>
  ),
  play: async ({ canvas }) => {
    await expect(window.innerWidth).toBe(360);
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await waitFor(() => expect(toasts()).toHaveLength(1));
    const action = canvas.getByRole('button', { name: 'Upload photos' }).getBoundingClientRect();
    // Measured once the entrance animation has settled.
    const toast = toasts()[0]!;
    await waitFor(() => expect(toast.getAnimations()).toHaveLength(0));
    const box = toast.getBoundingClientRect();
    await expect(box.bottom).toBeLessThanOrEqual(window.innerHeight - 16);
    await expect(box.left).toBeGreaterThanOrEqual(16);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth - 16);
    await expect(overlaps(box, action)).toBe(false);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Review Focus 4: a hovered toast stays until the pointer leaves, then its timer resumes. */
export const PauseOnHover: Story = {
  args: { durationMs: 500 },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await waitFor(() => expect(toasts()).toHaveLength(1));
    await userEvent.hover(toasts()[0]!);
    await wait(900);
    await expect(toasts()).toHaveLength(1);
    await userEvent.unhover(toasts()[0]!);
    await waitFor(() => expect(toasts()).toHaveLength(0), { timeout: 2000 });
  },
};

/** Review Focus 4: a focused toast stays until focus leaves, then its timer resumes. */
export const PauseOnFocus: Story = {
  args: { durationMs: 500 },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: 'Show toast' });
    await userEvent.click(trigger);
    await waitFor(() => expect(toasts()).toHaveLength(1));
    toasts()[0]!.focus();
    await expect(toasts()[0]).toHaveFocus();
    await wait(900);
    await expect(toasts()).toHaveLength(1);
    trigger.focus();
    await waitFor(() => expect(toasts()).toHaveLength(0), { timeout: 2000 });
  },
};

function BarDemo(args: TriggerProps) {
  const [shown, setShown] = useState(false);
  const [tall, setTall] = useState(false);
  return (
    <>
      <Trigger {...args} />
      <Button variant="outline" onClick={() => setShown(true)}>
        Show bar
      </Button>
      <div
        data-toast-avoid=""
        className={cn('fixed inset-x-0 bottom-0 grid gap-2 border-t bg-card p-4', {
          hidden: !shown,
        })}
      >
        <Button variant="outline" className="w-full" onClick={() => setTall(true)}>
          More actions
        </Button>
        {tall ? <Button className="w-full">Upload photos</Button> : null}
      </div>
    </>
  );
}

async function expectAboveBar(canvasElement: HTMLElement) {
  const bar = canvasElement.querySelector<HTMLElement>('[data-toast-avoid]')!;
  await waitFor(async () => {
    const toast = toasts()[0]!;
    await expect(toast.getAnimations().filter((a) => a.playState === 'running')).toHaveLength(0);
    await expect(overlaps(toast.getBoundingClientRect(), bar.getBoundingClientRect())).toBe(false);
  });
}

/**
 * A bottom bar that appears or grows while a toast is open lifts the toast above it (the bars are
 * watched with a ResizeObserver, not only measured when the toast opens).
 */
export const AvoidChangingBar: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { title: 'Collection saved', durationMs: 60_000 },
  render: (args) => <BarDemo {...args} />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await waitFor(() => expect(toasts()).toHaveLength(1));
    await userEvent.click(canvas.getByRole('button', { name: 'Show bar' }));
    await expectAboveBar(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'More actions' }));
    await expect(canvas.getByRole('button', { name: 'Upload photos' })).toBeVisible();
    await expectAboveBar(canvasElement);
  },
};

function MountedBarDemo(args: TriggerProps) {
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Trigger {...args} />
      <Button variant="outline" onClick={() => setMounted(true)}>
        Mount bar
      </Button>
      {mounted ? (
        <div data-toast-avoid="" className="fixed inset-x-0 bottom-0 border-t bg-card p-4">
          <Button className="w-full">Upload photos</Button>
        </div>
      ) : null}
    </>
  );
}

/** A bottom bar that mounts while a toast is open (not just unhides) also lifts the toast. */
export const AvoidMountedBar: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { title: 'Collection saved', durationMs: 60_000 },
  render: (args) => <MountedBarDemo {...args} />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await waitFor(() => expect(toasts()).toHaveLength(1));
    await expect(canvasElement.querySelector('[data-toast-avoid]')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Mount bar' }));
    await expect(canvas.getByRole('button', { name: 'Upload photos' })).toBeVisible();
    await expectAboveBar(canvasElement);
  },
};
