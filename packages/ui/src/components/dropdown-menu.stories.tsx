import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

function Demo() {
  const [theme, setTheme] = useState('system');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Account</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>anna@example.com</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const meta = {
  title: 'Components/DropdownMenu',
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

/** Enter opens, ArrowDown moves, Escape closes and returns focus to the trigger. */
export const Keyboard: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: 'Account' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const settings = screen.getByRole('menuitem', { name: 'Settings' });
    await waitFor(() => expect(settings).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    const system = screen.getByRole('menuitemradio', { name: 'System' });
    await expect(system).toHaveFocus();
    // Keyboard focus is shown with a ring, not only the faint muted background.
    await expect(system).toHaveAttribute('data-highlighted');
    await expect(system.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(system).boxShadow).not.toBe('none');
    await expect(getComputedStyle(settings).boxShadow).toBe('none');
    await expect(menu).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Picking a radio item checks it; every item is a 44px touch target. */
export const Radio: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Account' }));
    await settled(await screen.findByRole('menu'));
    for (const item of [
      ...screen.getAllByRole('menuitem'),
      ...screen.getAllByRole('menuitemradio'),
    ]) {
      await expect(item.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    await expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await userEvent.click(canvas.getByRole('button', { name: 'Account' }));
    await expect(await screen.findByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  },
};

export const Dark: Story = {
  ...Radio,
  globals: { theme: 'dark' },
};

/** The open menu fits inside a 360px phone without horizontal scroll. */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    await expect(window.innerWidth).toBe(360);
    await userEvent.click(canvas.getByRole('button', { name: 'Account' }));
    const menu = await screen.findByRole('menu');
    await settled(menu);
    const box = menu.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    // Close it before the axe check: while a modal menu is open Radix marks the rest of the page
    // `aria-hidden` (focus is trapped in the menu), which axe reports as hidden focusable content.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  },
};

/**
 * Ends with the menu open so axe audits its contents. The audit is scoped to the menu: while a
 * modal menu is open Radix marks the rest of the page `aria-hidden` (focus is trapped in the
 * menu), which axe would report as hidden focusable content.
 */
export const OpenAudit: Story = {
  parameters: { a11y: { context: '[data-slot="dropdown-menu-content"]' } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Account' }));
    const menu = await screen.findByRole('menu');
    await settled(menu);
    await expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  },
};
