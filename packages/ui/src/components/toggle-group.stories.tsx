import type { Meta, StoryObj } from '@storybook/react-vite';
import { Monitor, Moon, Sun } from 'lucide-react';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { Panel, PanelContent } from './panel';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { minTarget } from '../stories/target';

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
 * Chips are 44px on a coarse pointer (touch, rule 05), 36px for a fine pointer and 32px with a
 * mouse from `md`, where the filter row is dense (V1).
 */
async function expectItemsAreTouchTargets(radios: HTMLElement[]) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const dense = window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
  for (const radio of radios) {
    const box = radio.getBoundingClientRect();
    await expect(box.height).toBe(coarse ? 44 : dense ? 32 : 36);
    await expect(box.width).toBeGreaterThanOrEqual(minTarget());
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

/** A token's computed colour, read through a probe element. */
function tokenColour(token: string, property: 'color' | 'backgroundColor' = 'color'): string {
  const probe = document.createElement('span');
  probe.style[property] = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();
  return value;
}

/**
 * On a panel (V1) the selected chip sits on the soft accent with accent text; the others keep
 * the quiet edge, the card fill and softer text.
 */
async function expectReadsOnPanel(canvasElement: HTMLElement) {
  const group = canvasElement.querySelector<HTMLElement>('[data-slot="toggle-group"]')!;
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
  const selected = radios.find((radio) => radio.getAttribute('aria-checked') === 'true')!;
  await expect(getComputedStyle(selected).color).toBe(tokenColour('--link'));
  await expect(getComputedStyle(selected).backgroundColor).toBe(
    tokenColour('--info-soft', 'backgroundColor'),
  );
  for (const radio of radios.filter((radio) => radio !== selected)) {
    await expect(getComputedStyle(radio).borderTopColor).toBe(tokenColour('--border-strong'));
    await expect(getComputedStyle(radio).color).toBe(tokenColour('--foreground-soft'));
  }
}

const onPanel: Story['render'] = (args) => (
  <Panel className="max-w-md">
    <PanelContent className="grid gap-3">
      <span id="theme-label" className="font-semibold">
        Show
      </span>
      <ToggleGroup {...args} aria-label={undefined} aria-labelledby="theme-label">
        <ToggleGroupItem value="system" count={126}>
          All
        </ToggleGroupItem>
        <ToggleGroupItem value="light" count={98}>
          Photos
        </ToggleGroupItem>
        <ToggleGroupItem value="dark" count={21}>
          Videos
        </ToggleGroupItem>
      </ToggleGroup>
    </PanelContent>
  </Panel>
);

/** Filter chips on a sheet, with counts as data (mono, read with the label). */
export const OnPanel: Story = {
  render: onPanel,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('radiogroup', { name: 'Show' })).toBeVisible();
    const photos = canvas.getByRole('radio', { name: 'Photos 98' });
    const count = photos.querySelector('[data-slot="toggle-group-item-count"]')!;
    await expect(getComputedStyle(count).fontFamily).toMatch(/Geist Mono/);
    await waitFor(() => expectReadsOnPanel(canvasElement));
    await expectItemsAreTouchTargets(canvas.getAllByRole('radio'));
  },
};

export const OnPanelDark: Story = {
  globals: { theme: 'dark' },
  render: onPanel,
  play: async ({ canvas, canvasElement }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(canvas.getByRole('radio', { name: 'Videos 21' }));
    // Focus would show as the violet edge (owner remark 103); the resting look is what is read.
    (document.activeElement as HTMLElement | null)?.blur();
    // The edge and text colour fade between chips (120ms): check once settled.
    await waitFor(() => expectReadsOnPanel(canvasElement));
  },
};

/**
 * A chip that can't be chosen («Відео» when no link lets guests add videos): a lock, the reason
 * as its description and in a tooltip on focus and on press; pressing it selects nothing.
 */
export const Locked: Story = {
  args: { defaultValue: 'all', 'aria-label': 'Тип' },
  render: (args) => (
    <ToggleGroup {...args}>
      <ToggleGroupItem value="all" count={3}>
        Усе
      </ToggleGroupItem>
      <ToggleGroupItem value="text" count={3}>
        Тексти
      </ToggleGroupItem>
      <ToggleGroupItem
        value="video"
        count={0}
        disabledReason="Жодне посилання не дозволяє додавати відео"
      >
        Відео
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvas, args }) => {
    const video = canvas.getByRole('radio', { name: 'Відео 0' });
    await expect(video).toHaveAttribute('aria-disabled', 'true');
    await expect(video).toHaveAccessibleDescription('Жодне посилання не дозволяє додавати відео');
    await expect(video.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    // Keyboard: arrows reach it, focus shows the reason, Space selects nothing.
    canvas.getByRole('radio', { name: 'Тексти 3' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(video).toHaveFocus());
    await waitFor(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        'Жодне посилання не дозволяє додавати відео',
      ),
    );
    await userEvent.keyboard(' ');
    await expect(video).toHaveAttribute('aria-checked', 'false');

    // A press (or a tap) shows the reason and selects nothing.
    await userEvent.click(video);
    await expect(video).toHaveAttribute('aria-checked', 'false');
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await expect(document.querySelector('[data-slot="tooltip-content"]')).toBeVisible();
  },
};

/**
 * Items wrapped in a Tooltip trigger (`asChild`) still show the selection: the trigger overwrites
 * the item's `data-state`, so the selected style also follows `aria-checked` (owner bug,
 * 2026-10-06: the editor's device toggle switched but never highlighted).
 */
export const WithTooltips: Story = {
  render: (args) => (
    <TooltipProvider>
      <ToggleGroup {...args}>
        {(['system', 'light', 'dark'] as const).map((value) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={value}>{value}</ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{value}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  ),
  play: async ({ canvas }) => {
    const radios = canvas.getAllByRole('radio');
    const [system, light] = radios as [HTMLElement, HTMLElement];
    await expect(system).toHaveAttribute('aria-checked', 'true');
    // Compared by fill and text colour: the clicked item also gets the violet focus edge.
    const selected = (el: HTMLElement) =>
      `${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).color}`;
    const selectedLook = selected(system);
    await expect(selectedLook).not.toBe(selected(light));
    await userEvent.click(light);
    await waitFor(() => expect(light).toHaveAttribute('aria-checked', 'true'));
    // The colours transition; wait for them to settle.
    await waitFor(() => expect(selected(light)).toBe(selectedLook));
  },
};

/** The thumb's index, as the `:has()` rules in globals.css compute it. */
function thumbIndex(canvasElement: HTMLElement): string {
  const thumb = canvasElement.querySelector<HTMLElement>('[data-slot="segment-thumb"]')!;
  return getComputedStyle(thumb).getPropertyValue('--thumb-index').trim();
}

/**
 * V1's segmented control (the dashboard's «Усі / Активні / Архів» and «Таблиця / Плитки»):
 * equal segments on the grey track, a white thumb that slides to the chosen one (CSS only).
 */
export const Segmented: Story = {
  args: { defaultValue: 'all', 'aria-label': 'Show' },
  render: (args) => (
    <ToggleGroup {...args} variant="segmented">
      <ToggleGroupItem value="all" count={6}>
        All
      </ToggleGroupItem>
      <ToggleGroupItem value="active" count={2}>
        Active
      </ToggleGroupItem>
      <ToggleGroupItem value="archived" count={4}>
        Archive
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvas, canvasElement }) => {
    const [all, , archived] = canvas.getAllByRole('radio') as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    await expect(all).toHaveAttribute('aria-checked', 'true');
    await expect(thumbIndex(canvasElement)).toBe('0');
    await userEvent.click(archived);
    await waitFor(() => expect(archived).toHaveAttribute('aria-checked', 'true'));
    await expect(thumbIndex(canvasElement)).toBe('2');
    // Equal segments: the thumb is exactly one segment wide.
    const thumb = canvasElement.querySelector<HTMLElement>('[data-slot="segment-thumb"]')!;
    await expect(Math.round(thumb.getBoundingClientRect().width)).toBe(
      Math.round(archived.getBoundingClientRect().width),
    );
    for (const radio of canvas.getAllByRole('radio')) {
      await expect(radio.getBoundingClientRect().height).toBeGreaterThanOrEqual(28);
    }
  },
};

export const SegmentedDark: Story = {
  ...Segmented,
  globals: { theme: 'dark' },
};
