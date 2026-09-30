import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import { Toaster, ToastProvider, useToast } from './toast';

type TriggerProps = {
  title?: string;
  description?: string;
  variant?: 'info' | 'success' | 'error';
  count?: number;
};

function Trigger({ title = 'Link copied', description, variant, count = 1 }: TriggerProps) {
  const { toast } = useToast();
  return (
    <Button
      onClick={() => {
        for (let i = 1; i <= count; i += 1) {
          toast({ title: count > 1 ? `${title} ${i}` : title, description, variant });
        }
      }}
    >
      Show toast
    </Button>
  );
}

const withToaster: Decorator = (Story) => (
  <ToastProvider label="Notification">
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
  },
};

export const ErrorDark: Story = {
  ...Error,
  globals: { theme: 'dark' },
};

export const Info: Story = {
  args: { variant: 'info', title: 'Uploads resume when you are back online' },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await waitFor(() => expect(toasts()).toHaveLength(1));
    await expect(toasts()[0]).toHaveAttribute('data-variant', 'info');
  },
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
