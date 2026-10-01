import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Field } from './field';
import { Input } from './input';

function Demo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Rename collection</Button>
      </DialogTrigger>
      <DialogContent closeLabel="Close">
        <DialogHeader>
          <DialogTitle>Rename collection</DialogTitle>
          <DialogDescription>Guests see this name on the upload page.</DialogDescription>
        </DialogHeader>
        <Field id="collection-name" label="Name">
          {(control) => <Input {...control} defaultValue="Anna and Taras, wedding" />}
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const meta = {
  title: 'Components/Dialog',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Waits for the zoom-in entrance, so sizes are measured at rest. */
async function settled(element: HTMLElement) {
  await waitFor(() =>
    expect(element.getAnimations().filter((a) => a.playState === 'running')).toHaveLength(0),
  );
}

/** Opening moves focus inside; the close button is labelled; Escape returns focus. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: 'Rename collection' });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Rename collection' });
    await expect(dialog).toHaveAccessibleDescription('Guests see this name on the upload page.');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await settled(dialog);
    const close = screen.getByRole('button', { name: 'Close' });
    await expect(close.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
};

/** The labelled close button closes the dialog. */
export const CloseButton: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Rename collection' }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  },
};

/** Full width minus the 16px gutters on a phone; `max-w-md` from `sm`. */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    await expect(window.innerWidth).toBe(360);
    await userEvent.click(canvas.getByRole('button', { name: 'Rename collection' }));
    const dialog = await screen.findByRole('dialog');
    await settled(dialog);
    const box = dialog.getBoundingClientRect();
    await expect(Math.round(box.left)).toBe(16);
    await expect(Math.round(box.right)).toBe(window.innerWidth - 16);
  },
};

export const Laptop: Story = {
  globals: { viewport: { value: 'laptop' } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Rename collection' }));
    const dialog = await screen.findByRole('dialog');
    await settled(dialog);
    // max-w-md = 28rem.
    await expect(Math.round(dialog.getBoundingClientRect().width)).toBe(448);
  },
};

/**
 * Ends with the dialog open so axe audits its contents. The audit is scoped to the dialog: while
 * a modal dialog is open Radix marks the rest of the page `aria-hidden`, which axe would report
 * as hidden focusable content.
 */
export const OpenAudit: Story = {
  parameters: { a11y: { context: '[data-slot="dialog-content"]' } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Rename collection' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename collection' });
    await settled(dialog);
    await expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
  },
};

export const OpenAuditDark: Story = {
  ...OpenAudit,
  globals: { theme: 'dark' },
};
