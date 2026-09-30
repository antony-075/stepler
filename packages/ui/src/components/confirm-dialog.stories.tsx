import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import { ConfirmDialog } from './confirm-dialog';

type DemoProps = {
  onConfirm: () => Promise<void>;
  destructive?: boolean;
};

function Demo({ onConfirm, destructive }: DemoProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Delete photo
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this photo?"
        description="Guests will no longer see it. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        pendingLabel="Deleting"
        destructive={destructive}
        onConfirm={onConfirm}
        errorMessage="Could not delete the photo. Try again."
      />
    </>
  );
}

const meta = {
  title: 'Components/ConfirmDialog',
  component: Demo,
  args: { destructive: true, onConfirm: fn(async () => {}) },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Waits for the zoom-in entrance, so sizes are measured at rest. */
async function settled(element: HTMLElement) {
  await waitFor(() =>
    expect(element.getAnimations().filter((a) => a.playState === 'running')).toHaveLength(0),
  );
}

async function openDialog(canvas: { getByRole: typeof screen.getByRole }) {
  const trigger = canvas.getByRole('button', { name: 'Delete photo' });
  await userEvent.click(trigger);
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete this photo?' });
  return { trigger, dialog };
}

/**
 * Review Focus 3: opening moves focus to Cancel (never the destructive action); Escape closes
 * without confirming, and focus returns to the trigger.
 */
export const Destructive: Story = {
  play: async ({ args, canvas }) => {
    const { trigger, dialog } = await openDialog(canvas);
    await expect(dialog).toHaveAccessibleDescription(
      'Guests will no longer see it. This cannot be undone.',
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await expect(args.onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const DestructiveDark: Story = {
  ...Destructive,
  globals: { theme: 'dark' },
};

/** Cancel closes without confirming, like Escape. */
export const Cancel: Story = {
  play: async ({ args, canvas }) => {
    const { trigger } = await openDialog(canvas);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await expect(args.onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** A resolved `onConfirm` closes the dialog. */
export const Confirm: Story = {
  args: { destructive: false },
  play: async ({ args, canvas }) => {
    await openDialog(canvas);
    const confirm = screen.getByRole('button', { name: 'Delete' });
    await expect(confirm).toHaveAttribute('data-variant', 'default');
    await userEvent.click(confirm);
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  },
};

/**
 * While `onConfirm` is pending both buttons are `aria-disabled` (not `disabled`, which would drop
 * focus to the page), the confirm button spins, focus stays in the dialog, and neither button
 * nor Escape does anything.
 */
export const Pending: Story = {
  args: { onConfirm: fn(() => new Promise<void>(() => {})) },
  play: async ({ args, canvas }) => {
    const { dialog } = await openDialog(canvas);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    const confirm = dialog.querySelector<HTMLButtonElement>('[data-slot="confirm-dialog-action"]');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(confirm).toHaveAttribute('aria-disabled', 'true'));
    await expect(cancel).toHaveAttribute('aria-disabled', 'true');
    await expect(screen.getByRole('status', { name: 'Deleting' })).toBeInTheDocument();
    await expect(dialog.contains(document.activeElement)).toBe(true);
    // Activating either button again does nothing.
    confirm!.focus();
    await userEvent.keyboard('{Enter}');
    cancel.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    // Escape does not dismiss while the action is in flight.
    await userEvent.keyboard('{Escape}');
    await expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await expect(dialog.contains(document.activeElement)).toBe(true);
  },
};

/** Review Focus 3: a rejected `onConfirm` keeps the dialog open and shows the error. */
export const Failure: Story = {
  args: { onConfirm: fn(() => Promise.reject(new Error('network'))) },
  play: async ({ args, canvas }) => {
    const { dialog } = await openDialog(canvas);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    const alert = await screen.findByRole('alert');
    await expect(alert).toHaveTextContent('Could not delete the photo. Try again.');
    await expect(dialog).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Delete' });
    await expect(confirm).not.toHaveAttribute('aria-disabled');
    await expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveAttribute(
      'aria-disabled',
    );
    // Focus stays in the dialog, on the confirm button, ready for a retry.
    await expect(dialog.contains(document.activeElement)).toBe(true);
    await expect(confirm).toHaveFocus();
    // Reopening starts clean.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await openDialog(canvas);
    await expect(screen.queryByRole('alert')).toBeNull();
  },
};

export const FailureDark: Story = {
  ...Failure,
  globals: { theme: 'dark' },
};

/** On a 360px phone the dialog is full width minus the 16px gutters. */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    await expect(window.innerWidth).toBe(360);
    const { dialog } = await openDialog(canvas);
    await settled(dialog);
    const box = dialog.getBoundingClientRect();
    await expect(Math.round(box.left)).toBe(16);
    await expect(Math.round(box.right)).toBe(window.innerWidth - 16);
    for (const name of ['Delete', 'Cancel']) {
      const button = screen.getByRole('button', { name });
      await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
};
