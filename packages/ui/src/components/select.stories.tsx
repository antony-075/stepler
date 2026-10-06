import type { Meta, StoryObj } from '@storybook/react-vite';
import { Monitor, Moon, Sun } from 'lucide-react';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { minTarget } from '../stories/target';

// The theme and language settings on /app/settings are built on this: a row label names the
// select (`aria-labelledby`) and its hint describes it (`aria-describedby`).
function Demo({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <div className="grid w-full max-w-sm gap-2">
      <div id="theme-label" className="text-[0.9375rem] font-semibold">
        Theme
      </div>
      <p id="theme-hint" className="text-sm text-muted-foreground">
        System follows your device setting.
      </p>
      <Select defaultValue="system" onValueChange={onValueChange}>
        <SelectTrigger aria-labelledby="theme-label" aria-describedby="theme-hint">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="system">
              <Monitor aria-hidden="true" />
              System
            </SelectItem>
            <SelectItem value="light">
              <Sun aria-hidden="true" />
              Light
            </SelectItem>
            <SelectItem value="dark">
              <Moon aria-hidden="true" />
              Dark
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

const meta = {
  title: 'Components/Select',
  component: Demo,
  args: { onValueChange: fn() },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Waits for the zoom-in entrance, so sizes are measured at rest. */
async function settled(element: HTMLElement) {
  await waitFor(() =>
    expect(element.getAnimations().filter((a) => a.playState === 'running')).toHaveLength(0),
  );
}

/** Enter opens on the selected option, arrows move, Enter picks, Escape closes without change. */
export const Keyboard: Story = {
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Theme' });
    await expect(trigger).toHaveAccessibleDescription('System follows your device setting.');
    await expect(trigger).toHaveTextContent('System');
    await expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());

    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const list = await screen.findByRole('listbox');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const system = screen.getByRole('option', { name: 'System' });
    await waitFor(() => expect(system).toHaveFocus());
    await expect(system).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const dark = screen.getByRole('option', { name: 'Dark' });
    await expect(dark).toHaveFocus();
    // Keyboard focus is shown with an inset outline, not only the faint hover fill.
    await expect(dark.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(dark).outlineStyle).toBe('solid');
    await expect(list).toBeVisible();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await expect(args.onValueChange).toHaveBeenLastCalledWith('dark');
    await expect(trigger).toHaveTextContent('Dark');
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger.matches(':focus-visible')).toBe(true);

    // Escape closes and keeps the value.
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{ArrowUp}{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await expect(trigger).toHaveTextContent('Dark');
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** A click opens it and picks an option; every option is a 44px touch target; no ring stays. */
export const Pointer: Story = {
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Theme' });
    await userEvent.click(trigger);
    await settled(await screen.findByRole('listbox'));
    // The selected option gets focus on open, but a pointer user sees no ring on it.
    const system = screen.getByRole('option', { name: 'System' });
    await waitFor(() => expect(system).toHaveFocus());
    await expect(getComputedStyle(system).outlineStyle).toBe('none');
    for (const option of screen.getAllByRole('option')) {
      await expect(option.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
    }
    await userEvent.click(screen.getByRole('option', { name: 'Light' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await expect(args.onValueChange).toHaveBeenLastCalledWith('light');
    await expect(trigger).toHaveTextContent('Light');
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger.matches(':focus-visible')).toBe(false);

    // Opened with the pointer and closed with Escape: still no ring for a mouse user.
    await userEvent.click(trigger);
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger.matches(':focus-visible')).toBe(false);
  },
};

/** On a phone the select fills its row and the open list fits the viewport. */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    await expect(window.innerWidth).toBe(360);
    const trigger = canvas.getByRole('combobox', { name: 'Theme' });
    const row = trigger.parentElement!.getBoundingClientRect();
    await expect(trigger.getBoundingClientRect().width).toBeCloseTo(row.width, 0);
    await userEvent.click(trigger);
    const list = await screen.findByRole('listbox');
    await settled(list);
    const box = list.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    // Close it before the page-wide axe check (Radix hides the rest of the page while open).
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  },
};

/**
 * Ends with the list open so axe audits it. Scoped to the list: while it is open Radix marks the
 * rest of the page `aria-hidden`, which axe would report as hidden focusable content.
 */
export const OpenAudit: Story = {
  parameters: { a11y: { context: '[data-slot="select-content"]' } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Theme' }));
    await settled(await screen.findByRole('listbox'));
    await expect(screen.getByRole('option', { name: 'Dark' })).toBeVisible();
  },
};

export const OpenAuditDark: Story = {
  ...OpenAudit,
  globals: { theme: 'dark' },
};
