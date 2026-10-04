import type { Meta, StoryObj } from '@storybook/react-vite';
import { Menu } from 'lucide-react';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './sheet';

function NavSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader closeLabel="Close menu">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <nav aria-label="Main" className="grid gap-1 p-3">
            <a href="#collections">Collections</a>
            <a href="#settings">Settings</a>
          </nav>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

const meta = {
  title: 'Components/Sheet',
  component: NavSheet,
  parameters: { viewport: { defaultViewport: 'phone' } },
} satisfies Meta<typeof NavSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The admin navigation on phones: opens from the left, traps focus, Escape returns focus. */
export const Navigation: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: 'Open menu' });
    await userEvent.click(trigger);
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    // Never wider than the screen minus a strip of the page to tap away.
    await expect(sheet.getBoundingClientRect().width).toBeLessThanOrEqual(window.innerWidth - 48);
    await expect(screen.getByRole('button', { name: 'Close menu' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expect(trigger).toHaveFocus();
  },
};

function PanelSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Settings</Button>
      </SheetTrigger>
      <SheetContent side="right" aria-describedby={undefined}>
        <SheetHeader closeLabel="Close">
          <SheetTitle>Main link</SheetTitle>
        </SheetHeader>
        <SheetBody className="p-4">
          {Array.from({ length: 40 }, (_, index) => (
            <p key={index}>Permissions, status and the danger zone.</p>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** A panel of work from the right: the full screen on a phone. */
export const RightOnPhone: Story = {
  render: () => <PanelSheet />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));
    const sheet = await screen.findByRole('dialog', { name: 'Main link' });
    await expect(sheet).toHaveAttribute('data-side', 'right');
    await expect(Math.round(sheet.getBoundingClientRect().width)).toBe(window.innerWidth);
    // Only the body scrolls: the close button stays where it was.
    const close = screen.getByRole('button', { name: 'Close' });
    const top = close.getBoundingClientRect().top;
    const body = sheet.querySelector<HTMLElement>('[data-slot="sheet-body"]')!;
    body.scrollTop = 400;
    await expect(body.scrollTop).toBeGreaterThan(0);
    await expect(close.getBoundingClientRect().top).toBe(top);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  },
};

function BottomSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Write a wish</Button>
      </SheetTrigger>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader closeLabel="Close">
          <SheetTitle>Your wish</SheetTitle>
        </SheetHeader>
        <SheetBody className="p-4">
          <p>A short task over the guest page.</p>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** A short guest task: from the bottom edge on a phone, full width. */
export const BottomOnPhone: Story = {
  render: () => <BottomSheet />,
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: 'Write a wish' });
    await userEvent.click(trigger);
    const sheet = await screen.findByRole('dialog', { name: 'Your wish' });
    await expect(sheet).toHaveAttribute('data-side', 'bottom');
    await waitFor(() =>
      expect(Math.round(sheet.getBoundingClientRect().bottom)).toBe(window.innerHeight),
    );
    await expect(Math.round(sheet.getBoundingClientRect().width)).toBe(window.innerWidth);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expect(trigger).toHaveFocus();
  },
};

/** From `sm` it is a centred dialog of at most 560px. */
export const BottomOnTablet: Story = {
  globals: { viewport: { value: 'tablet' } },
  render: () => <BottomSheet />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Write a wish' }));
    const sheet = await screen.findByRole('dialog', { name: 'Your wish' });
    await waitFor(async () => {
      const box = sheet.getBoundingClientRect();
      await expect(Math.round(box.width)).toBe(560);
      await expect(Math.abs(box.top + box.height / 2 - window.innerHeight / 2)).toBeLessThanOrEqual(
        1,
      );
    });
  },
};

export const NavigationDark: Story = {
  ...Navigation,
  globals: { theme: 'dark' },
};
