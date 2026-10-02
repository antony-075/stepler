import type { Meta, StoryObj } from '@storybook/react-vite';
import { Monitor, Moon, Sun } from 'lucide-react';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { Panel, PanelContent } from './panel';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

// Direction C's filter chips (content type, grid or rows); not used by the app yet.
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

/**
 * Chips are 44px on a coarse pointer (touch, rule 05) and 36px for a fine pointer, where the
 * filter row is dense; at least 44px wide either way.
 */
async function expectItemsAreTouchTargets(radios: HTMLElement[]) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  for (const radio of radios) {
    const box = radio.getBoundingClientRect();
    await expect(box.height).toBe(coarse ? 44 : 36);
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

/**
 * On a sheet the selected chip has a 1px foreground edge and foreground text; the others have no
 * visible edge and muted text.
 */
async function expectReadsOnPanel(canvasElement: HTMLElement) {
  const group = canvasElement.querySelector<HTMLElement>('[data-slot="toggle-group"]')!;
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
  const selected = radios.find((radio) => radio.getAttribute('aria-checked') === 'true')!;
  const foreground = getComputedStyle(document.body).color;
  await expect(getComputedStyle(selected).borderTopColor).toBe(foreground);
  await expect(getComputedStyle(selected).color).toBe(foreground);
  for (const radio of radios.filter((radio) => radio !== selected)) {
    await expect(getComputedStyle(radio).borderTopColor).toBe('rgba(0, 0, 0, 0)');
    await expect(getComputedStyle(radio).color).not.toBe(foreground);
  }
}

const onPanel: Story['render'] = (args) => (
  <Panel className="max-w-md">
    <PanelContent className="grid gap-3">
      <span id="theme-label" className="font-semibold">
        Show
      </span>
      <ToggleGroup {...args} aria-label={undefined} aria-labelledby="theme-label">
        <ToggleGroupItem value="system">
          All <span className="type-data">126</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="light">
          Photos <span className="type-data">98</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="dark">
          Videos <span className="type-data">21</span>
        </ToggleGroupItem>
      </ToggleGroup>
    </PanelContent>
  </Panel>
);

/** Filter chips on a sheet, with counts as data. */
export const OnPanel: Story = {
  render: onPanel,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('radiogroup', { name: 'Show' })).toBeVisible();
    await waitFor(() => expectReadsOnPanel(canvasElement));
  },
};

export const OnPanelDark: Story = {
  globals: { theme: 'dark' },
  render: onPanel,
  play: async ({ canvas, canvasElement }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(canvas.getByRole('radio', { name: 'Videos 21' }));
    // The edge and text colour fade between chips (120ms): check once settled.
    await waitFor(() => expectReadsOnPanel(canvasElement));
  },
};
