import type { Meta, StoryObj } from '@storybook/react-vite';
import { Monitor, Moon, Sun } from 'lucide-react';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

// The theme and language settings on /app/settings are built on this.
const meta = {
  title: 'Components/ToggleGroup',
  component: ToggleGroup,
  args: { defaultValue: 'system', 'aria-label': 'Theme', onValueChange: fn() },
  render: (args) => (
    <ToggleGroup {...args}>
      <ToggleGroupItem value="system" icon={<Monitor />}>
        System
      </ToggleGroupItem>
      <ToggleGroupItem value="light" icon={<Sun />}>
        Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" icon={<Moon />}>
        Dark
      </ToggleGroupItem>
    </ToggleGroup>
  ),
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

function checked(radios: HTMLElement[]) {
  return radios.filter((radio) => radio.getAttribute('aria-checked') === 'true');
}

async function expectItemsAreTouchTargets(radios: HTMLElement[]) {
  for (const radio of radios) {
    const box = radio.getBoundingClientRect();
    // 44px minimum touch target (rule 05).
    await expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(box.width).toBeGreaterThanOrEqual(44);
  }
}

/** Arrows move focus without selecting; Space selects. */
export const Keyboard: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    const system = canvas.getByRole('radio', { name: 'System' });
    const light = canvas.getByRole('radio', { name: 'Light' });
    await expect(system).toHaveAttribute('aria-checked', 'true');

    system.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(light).toHaveFocus());
    await expect(system).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard(' ');
    await expect(light).toHaveAttribute('aria-checked', 'true');
    await expect(args.onValueChange).toHaveBeenLastCalledWith('light');
    await expect(checked(canvas.getAllByRole('radio'))).toHaveLength(1);

    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(system).toHaveFocus());
    await expectItemsAreTouchTargets(canvas.getAllByRole('radio'));
  },
};

/** A segmented control always has one value: pressing the selected item does not clear it. */
export const NoDeselect: Story = {
  play: async ({ canvas, args }) => {
    const system = canvas.getByRole('radio', { name: 'System' });
    await userEvent.click(system);
    await expect(system).toHaveAttribute('aria-checked', 'true');
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('radio', { name: 'Dark' }));
    await expect(args.onValueChange).toHaveBeenLastCalledWith('dark');
    await expect(checked(canvas.getAllByRole('radio'))).toHaveLength(1);
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  args: { defaultValue: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  },
};

/** At 360px the three labelled items fit side by side, each a touch target. */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    await expect(window.innerWidth).toBe(360);
    const light = canvas.getByRole('radio', { name: 'Light' });
    await expect(canvas.getByText('Light').getBoundingClientRect().width).toBeGreaterThan(1);
    await expect(light.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(canvas.getByRole('radiogroup').getBoundingClientRect().right).toBeLessThanOrEqual(
      360,
    );
    await expectItemsAreTouchTargets(canvas.getAllByRole('radio'));
  },
};

/** The language switch: text-only items, each name in its own language (`lang`). */
export const Language: Story = {
  args: { defaultValue: 'uk', 'aria-label': 'Language' },
  render: (args) => (
    <ToggleGroup {...args}>
      <ToggleGroupItem value="uk" lang="uk">
        Українська
      </ToggleGroupItem>
      <ToggleGroupItem value="en" lang="en">
        English
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvas, args }) => {
    // The visible text is the accessible name (WCAG 2.5.3).
    const english = canvas.getByRole('radio', { name: 'English' });
    await expect(english).toHaveAttribute('lang', 'en');
    await expect(canvas.getByRole('radio', { name: 'Українська' })).toHaveAttribute('lang', 'uk');
    await userEvent.click(english);
    await expect(english).toHaveAttribute('aria-checked', 'true');
    await expect(args.onValueChange).toHaveBeenLastCalledWith('en');
    await expectItemsAreTouchTargets(canvas.getAllByRole('radio'));
  },
};
