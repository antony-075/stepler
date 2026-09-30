import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Input } from './input';
import { Toaster, ToastProvider, useToast } from './toast';

/**
 * Regression tests: overlays and toasts do not animate under `prefers-reduced-motion: reduce`.
 *
 * These stories are tagged `reduced-motion`, so they run only in the `storybook-reduced-motion`
 * Vitest project, whose Playwright context emulates the media feature (see vitest.config.ts).
 * They are hidden from the Storybook sidebar (`!dev`) because a normal browser does not emulate
 * it. Each play function first checks that the emulation is active, so a misconfigured project
 * fails instead of passing vacuously.
 */
const meta = {
  title: 'Tests/ReducedMotion',
  tags: ['!dev', '!autodocs', 'reduced-motion'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

async function expectReducedMotion() {
  await expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
}

/** No CSS animation or transition runs on the element or anything inside it. */
async function expectNoAnimations(element: Element) {
  const running = element
    .getAnimations({ subtree: true })
    .filter((animation) => animation.playState === 'running');
  await expect(running).toHaveLength(0);
}

/** Checks right after mounting and again a frame later, when an entrance would be mid-flight. */
async function expectStill(element: Element) {
  await expectNoAnimations(element);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await expectNoAnimations(element);
}

export const Dialog_: Story = {
  name: 'Dialog',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent closeLabel="Close">
        <DialogTitle>Rename collection</DialogTitle>
        <DialogDescription>Guests see this name on the upload page.</DialogDescription>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvas }) => {
    await expectReducedMotion();
    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog');
    await expectStill(dialog);
    await expectStill(document.querySelector('[data-slot="dialog-overlay"]')!);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  },
};

export const DropdownMenu_: Story = {
  name: 'DropdownMenu',
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Open menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvas }) => {
    await expectReducedMotion();
    await userEvent.click(canvas.getByRole('button', { name: 'Open menu' }));
    await expectStill(await screen.findByRole('menu'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  },
};

function ToastTrigger() {
  const { toast } = useToast();
  return <Button onClick={() => toast({ title: 'Link copied' })}>Show toast</Button>;
}

export const Toast: Story = {
  render: () => (
    <ToastProvider label="Notification">
      <ToastTrigger />
      <Toaster label="Notifications" closeLabel="Close" />
    </ToastProvider>
  ),
  play: async ({ canvas }) => {
    await expectReducedMotion();
    await userEvent.click(canvas.getByRole('button', { name: 'Show toast' }));
    await waitFor(() => expect(document.querySelector('[data-slot="toast"]')).not.toBeNull());
    await expectStill(document.querySelector('[data-slot="toast"]')!);
  },
};

/**
 * Button and Input drop their colour/ring transitions. (The press offset, `motion-reduce:active:
 * translate-y-0`, is not asserted: synthetic events do not set `:active`.)
 */
export const Controls: Story = {
  render: () => (
    <div className="grid gap-2">
      <Button>Save</Button>
      <Input aria-label="Name" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expectReducedMotion();
    const button = canvas.getByRole('button', { name: 'Save' });
    await expect(getComputedStyle(button).transitionProperty).toBe('none');
    await expect(getComputedStyle(canvas.getByRole('textbox')).transitionProperty).toBe('none');
  },
};
