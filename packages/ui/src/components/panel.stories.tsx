import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Button } from './button';
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelFooter,
  PanelHeader,
  PanelTitle,
} from './panel';
import { Separator } from './separator';

const meta = {
  title: 'Components/Panel',
  component: Panel,
  decorators: [
    (Story) => (
      <div className="w-md max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Panel>
      <PanelHeader>
        <PanelTitle>Anna and Taras, wedding</PanelTitle>
        <PanelDescription>Created on 12 September</PanelDescription>
      </PanelHeader>
      <PanelContent>
        <p>128 photos, 6 videos and 14 notes from 37 guests.</p>
      </PanelContent>
      <PanelFooter>
        <Button>Open collection</Button>
      </PanelFooter>
    </Panel>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Anna and Taras, wedding' }),
    ).toBeVisible();
    await expect(canvasElement.querySelector('[data-slot="panel"]')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Open collection' })).toBeVisible();
  },
};

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('heading', { level: 2 })).toBeVisible();
  },
};

/** `PanelContent` alone is the single-step card used by sign-in and verify. */
export const ContentOnly: Story = {
  render: () => (
    <Panel>
      <PanelContent>
        <p>Check your inbox: we sent a sign-in link.</p>
      </PanelContent>
    </Panel>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Check your inbox: we sent a sign-in link.')).toBeVisible();
  },
};

export const TitleAsChild: Story = {
  render: () => (
    <Panel>
      <PanelHeader>
        <PanelTitle asChild>
          <h3>Guest link</h3>
        </PanelTitle>
      </PanelHeader>
      <PanelContent>
        <p>Anyone with this link can upload.</p>
      </PanelContent>
    </Panel>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 3, name: 'Guest link' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { level: 2 })).toBeNull();
  },
};

/**
 * Only a following panel section trims the bottom padding: content before a Separator keeps it,
 * and a footer after content still gets its top spacing.
 */
export const SeparatedContent: Story = {
  render: () => (
    <Panel>
      <PanelContent>
        <p>Guests can see earlier uploads.</p>
      </PanelContent>
      <Separator />
      <PanelContent>
        <p>Uploads are open until 20 September.</p>
      </PanelContent>
      <PanelFooter>
        <Button>Save</Button>
      </PanelFooter>
    </Panel>
  ),
  play: async ({ canvasElement }) => {
    const contents = Array.from(
      canvasElement.querySelectorAll<HTMLElement>('[data-slot="panel-content"]'),
    );
    const footers = Array.from(
      canvasElement.querySelectorAll<HTMLElement>('[data-slot="panel-footer"]'),
    );
    await expect(contents).toHaveLength(2);
    await expect(footers).toHaveLength(1);
    const [first, second] = contents as [HTMLElement, HTMLElement];
    await expect(getComputedStyle(first).paddingBottom).not.toBe('0px');
    await expect(getComputedStyle(second).paddingBottom).toBe('0px');
    await expect(getComputedStyle(footers[0]!).paddingTop).toBe('16px');
  },
};

const LONG_TITLE = 'a'.repeat(40) + '@' + 'example-collection.com';

/** Review Focus 5: a long unbroken title or email must not scroll the page at 360px. */
export const LongText: Story = {
  globals: { viewport: { value: 'phone' } },
  render: () => (
    <Panel>
      <PanelHeader>
        <PanelTitle>{LONG_TITLE}</PanelTitle>
        <PanelDescription>{LONG_TITLE}</PanelDescription>
      </PanelHeader>
      <PanelContent>
        <p>{LONG_TITLE}</p>
      </PanelContent>
    </Panel>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(window.innerWidth).toBe(360);
    await expect(LONG_TITLE.length).toBeGreaterThanOrEqual(60);
    await expect(canvas.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** `sheet`: no padding, rows or a grid fill it edge to edge; rows split with `divide-y`. */
export const Sheet: Story = {
  render: () => (
    <Panel variant="sheet" className="divide-y">
      {['Весілля Олі та Тараса', 'Ювілей бабусі Галини', 'Випускний 11-Б'].map((title) => (
        <div key={title} className="flex min-h-14 items-center px-4">
          {title}
        </div>
      ))}
    </Panel>
  ),
  play: async ({ canvasElement }) => {
    const sheet = canvasElement.querySelector<HTMLElement>('[data-slot="panel"]')!;
    await expect(sheet).toHaveAttribute('data-variant', 'sheet');
    await expect(getComputedStyle(sheet).borderTopLeftRadius).toBe('8px');
  },
};

export const SheetDark: Story = {
  ...Sheet,
  globals: { theme: 'dark' },
};

/** V1 is flat: a panel is set apart by its 1px edge, no shadow in either theme. */
export const Elevation: Story = {
  render: () => (
    <Panel>
      <PanelContent>A panel on the light table.</PanelContent>
    </Panel>
  ),
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector<HTMLElement>('[data-slot="panel"]')!;
    await expect(getComputedStyle(panel).boxShadow).toBe('none');
    await expect(getComputedStyle(panel).borderTopWidth).toBe('1px');
  },
};

export const ElevationDark: Story = {
  ...Elevation,
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector<HTMLElement>('[data-slot="panel"]')!;
    await expect(getComputedStyle(panel).boxShadow).toBe('none');
  },
};
