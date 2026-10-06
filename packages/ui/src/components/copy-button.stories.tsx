import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { CopyButton } from './copy-button';
import { minTarget } from '../stories/target';

const LINK = 'https://stepler.app/g/anna-and-taras';

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
  return () => {
    Reflect.deleteProperty(navigator, 'clipboard');
  };
}

const writeText = fn(async (_text: string) => {});

const meta = {
  title: 'Components/CopyButton',
  component: CopyButton,
  args: {
    value: LINK,
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    failedLabel: 'Could not copy. Open the link and copy it from the address bar.',
    accessibleLabel: 'Copy “Photographer”',
  },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Copies, says "Copied" for 2s without changing width, and announces it. */
export const Copy: Story = {
  beforeEach: () => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    return stubClipboard({ writeText });
  },
  play: async ({ canvas, canvasElement }) => {
    await document.fonts.ready;
    const button = canvas.getByRole('button', { name: 'Copy “Photographer”' });
    const width = button.getBoundingClientRect().width;
    await userEvent.click(button);
    await expect(writeText).toHaveBeenCalledWith(LINK);
    const status = canvasElement.querySelector('[data-slot="copy-button-status"]');
    await waitFor(() => expect(status).toHaveTextContent('Copied'));
    await expect(canvas.getByRole('button', { name: 'Copied' })).toBeVisible();
    await expect(button.getBoundingClientRect().width).toBe(width);
  },
};

/** Without a clipboard the failure is shown and announced. */
export const Failed: Story = {
  beforeEach: () => stubClipboard(undefined),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Copy “Photographer”' }));
    const status = canvasElement.querySelector('[data-slot="copy-button-status"]');
    await waitFor(() => expect(status).toHaveTextContent(/^Could not copy/));
    await expect(status).toBeVisible();
  },
};

/** Next to a value it copies: icon only, named by the action, a check when done. */
export const IconOnly: Story = {
  args: { iconOnly: true, copyLabel: 'Copy link', accessibleLabel: undefined },
  beforeEach: () => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    return stubClipboard({ writeText });
  },
  play: async ({ canvas, canvasElement }) => {
    const button = canvas.getByRole('button', { name: 'Copy link' });
    await expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(minTarget());
    await userEvent.click(button);
    await expect(writeText).toHaveBeenCalledWith(LINK);
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Copied' })).toBeVisible());
    const status = canvasElement.querySelector('[data-slot="copy-button-status"]');
    await expect(status).toHaveTextContent('Copied');
  },
};
