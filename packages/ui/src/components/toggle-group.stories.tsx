import type { Meta, StoryObj } from '@storybook/react-vite';
import { Monitor, Moon, Sun } from 'lucide-react';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

// The header's theme and language switches (Tasks 9 and 10) are built on this.
const meta = {
  title: 'Components/ToggleGroup',
  component: ToggleGroup,
  args: { defaultValue: 'system', 'aria-label': 'Theme', onValueChange: fn() },
  render: (args) => (
    <ToggleGroup {...args}>
      <ToggleGroupItem value="system" icon={<Monitor />} hideLabel="phone">
        System
      </ToggleGroupItem>
      <ToggleGroupItem value="light" icon={<Sun />} hideLabel="phone">
        Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" icon={<Moon />} hideLabel="phone">
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

/** On phones the labels are visually hidden but still name the items. */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    await expect(window.innerWidth).toBe(360);
    const light = canvas.getByRole('radio', { name: 'Light' });
    const label = canvas.getByText('Light');
    // `sr-only` collapses the label to 1px; the icon is what shows.
    await expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    await expect(light.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await expectItemsAreTouchTargets(canvas.getAllByRole('radio'));
  },
};

/** From `sm` the labels show next to the icons. */
export const Laptop: Story = {
  globals: { viewport: { value: 'laptop' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Light').getBoundingClientRect().width).toBeGreaterThan(1);
  },
};

/** The language switch: text-only items that carry their own `lang`. */
export const Language: Story = {
  args: { defaultValue: 'uk', 'aria-label': 'Language' },
  render: (args) => (
    <ToggleGroup {...args}>
      <ToggleGroupItem value="uk" lang="uk" aria-label="Українська">
        UA
      </ToggleGroupItem>
      <ToggleGroupItem value="en" lang="en" aria-label="English">
        EN
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvas, args }) => {
    const english = canvas.getByRole('radio', { name: 'English' });
    await expect(english).toHaveAttribute('lang', 'en');
    await expect(canvas.getByRole('radio', { name: 'Українська' })).toHaveAttribute('lang', 'uk');
    await userEvent.click(english);
    await expect(english).toHaveAttribute('aria-checked', 'true');
    await expect(args.onValueChange).toHaveBeenLastCalledWith('en');
    await expectItemsAreTouchTargets(canvas.getAllByRole('radio'));
  },
};
