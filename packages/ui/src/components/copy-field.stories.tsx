import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { CopyField } from './copy-field';

const LINK = 'https://stepler.app/c/anna-and-taras';

/** Replaces `navigator.clipboard` for one story and restores the browser's on cleanup. */
function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
  return () => {
    Reflect.deleteProperty(navigator, 'clipboard');
  };
}

const writeText = fn(async (_text: string) => {});

const meta = {
  title: 'Components/CopyField',
  component: CopyField,
  args: {
    label: 'Guest link',
    value: LINK,
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    failedLabel: 'Could not copy. The link is selected: copy it with your keyboard.',
  },
  decorators: [
    (Story) => (
      <div className="w-md max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CopyField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Copies the value, announces "Copied" and returns to "Copy" after 2 seconds. */
export const Copy: Story = {
  beforeEach: () => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    return stubClipboard({ writeText });
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('textbox', { name: 'Guest link' })).toHaveValue(LINK);
    const status = canvasElement.querySelector('[aria-live="polite"]');
    await expect(status).toBeEmptyDOMElement();

    await userEvent.click(canvas.getByRole('button', { name: 'Copy' }));
    await expect(writeText).toHaveBeenCalledWith(LINK);
    await expect(status).toHaveTextContent('Copied');
    await expect(canvas.getByRole('button', { name: 'Copied' })).toBeVisible();

    await waitFor(() => expect(canvas.getByRole('button', { name: 'Copy' })).toBeVisible(), {
      timeout: 3000,
    });
    await expect(status).toBeEmptyDOMElement();
  },
};

/** Focusing the field selects the whole value, ready for a manual copy. */
export const SelectOnFocus: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByRole<HTMLInputElement>('textbox', { name: 'Guest link' });
    await expect(input).toHaveAttribute('readonly');
    await userEvent.click(input);
    await waitFor(() => expect(input.selectionEnd).toBe(LINK.length));
    await expect(input.selectionStart).toBe(0);
  },
};

/** Without the clipboard API the text is selected and the failure is announced. */
export const Unavailable: Story = {
  beforeEach: () => stubClipboard(undefined),
  play: async ({ canvas, canvasElement }) => {
    const input = canvas.getByRole<HTMLInputElement>('textbox', { name: 'Guest link' });
    await userEvent.click(canvas.getByRole('button', { name: 'Copy' }));
    await expect(input).toHaveFocus();
    await expect(input.selectionStart).toBe(0);
    await expect(input.selectionEnd).toBe(LINK.length);
    await expect(canvasElement.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Could not copy.',
    );
  },
};

/** A clipboard that refuses (no permission) is handled like a missing one. */
export const Rejected: Story = {
  beforeEach: () => {
    writeText.mockReset();
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    return stubClipboard({ writeText });
  },
  play: async ({ canvas, canvasElement }) => {
    const input = canvas.getByRole<HTMLInputElement>('textbox', { name: 'Guest link' });
    await userEvent.click(canvas.getByRole('button', { name: 'Copy' }));
    await expect(writeText).toHaveBeenCalledWith(LINK);
    await waitFor(() => expect(input.selectionEnd).toBe(LINK.length));
    await expect(canvasElement.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Could not copy.',
    );
    await expect(canvas.getByRole('button', { name: 'Copy' })).toBeVisible();
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('button', { name: 'Copy' })).toBeVisible();
  },
};

const LONG_LINK = `https://stepler.app/c/${'anna-and-taras-wedding-in-lviv-'.repeat(4)}`.slice(
  0,
  120,
);

/** A 120-character link at 360px stays inside the field (Review Focus 5). */
export const LongValue: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { value: LONG_LINK },
  play: async ({ canvas, canvasElement }) => {
    await expect(window.innerWidth).toBe(360);
    await expect(LONG_LINK.length).toBe(120);
    await expect(canvas.getByRole('textbox', { name: 'Guest link' })).toHaveValue(LONG_LINK);
    const button = canvas.getByRole('button', { name: 'Copy' });
    await expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
