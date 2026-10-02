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

/** Records every text the live region shows, so a repeated message can be told from a stale one. */
function recordAnnouncements(region: Element) {
  const texts: string[] = [];
  const observer = new MutationObserver(() => texts.push(region.textContent));
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  return { texts, stop: () => observer.disconnect() };
}

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
    const input = canvas.getByRole('textbox', { name: 'Guest link' });
    await expect(input).toHaveValue(LINK);
    const status = canvasElement.querySelector('[aria-live="polite"]');
    await expect(status).toBeEmptyDOMElement();
    const button = canvas.getByRole('button', { name: 'Copy' });
    // The button lines up with the input, and its width does not change with the label.
    await expect(button.getBoundingClientRect().height).toBe(input.getBoundingClientRect().height);
    const width = button.getBoundingClientRect().width;

    await userEvent.click(button);
    await expect(writeText).toHaveBeenCalledWith(LINK);
    await waitFor(() => expect(status).toHaveTextContent('Copied'));
    await expect(canvas.getByRole('button', { name: 'Copied' })).toBeVisible();
    await expect(button.getBoundingClientRect().width).toBe(width);

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
    const region = canvasElement.querySelector('[aria-live="polite"]');
    if (!region) throw new Error('live region missing');
    const button = canvas.getByRole('button', { name: 'Copy' });
    await userEvent.click(button);
    await waitFor(() => expect(input).toHaveFocus());
    await expect(input.selectionStart).toBe(0);
    await expect(input.selectionEnd).toBe(LINK.length);
    await expect(region).toHaveTextContent('Could not copy.');

    // A second failure empties the region and fills it again, so it is announced again.
    const announcements = recordAnnouncements(region);
    await userEvent.click(button);
    await waitFor(() => expect(announcements.texts.at(-1)).toMatch(/^Could not copy\./));
    announcements.stop();
    await expect(announcements.texts[0]).toBe('');
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
    await waitFor(() => expect(input).toHaveFocus());
    await expect(canvasElement.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Could not copy.',
    );
    await expect(canvas.getByRole('button', { name: 'Copy' })).toBeVisible();
  },
};

let resolveFirst: () => void = () => {};

/** A slow first copy that finishes after a newer, failed one does not overwrite its message. */
export const StaleResult: Story = {
  beforeEach: () => {
    writeText.mockReset();
    writeText
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFirst = resolve)))
      .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    return stubClipboard({ writeText });
  },
  play: async ({ canvas, canvasElement }) => {
    const region = canvasElement.querySelector('[aria-live="polite"]');
    const button = canvas.getByRole('button', { name: 'Copy' });
    await userEvent.click(button);
    await userEvent.click(button);
    await waitFor(() => expect(region).toHaveTextContent('Could not copy.'));
    resolveFirst();
    // Give the stale result a couple of frames to (wrongly) land.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(region).toHaveTextContent('Could not copy.');
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
    await expect(button.getBoundingClientRect().height).toBe(
      canvas.getByRole('textbox').getBoundingClientRect().height,
    );
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** Narrower than 22rem (a phone-width panel): the button goes under the field at full width. */
export const Narrow: Story = {
  globals: { viewport: { value: 'small' } },
  args: { value: LONG_LINK },
  play: async ({ canvas, canvasElement }) => {
    const input = canvas.getByRole('textbox', { name: 'Guest link' }).getBoundingClientRect();
    const button = canvas.getByRole('button', { name: 'Copy' }).getBoundingClientRect();
    await expect(button.top).toBeGreaterThanOrEqual(input.bottom);
    await expect(button.width).toBe(input.width);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
