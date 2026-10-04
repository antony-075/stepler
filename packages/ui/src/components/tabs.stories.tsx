import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Images, Link2 } from 'lucide-react';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from './tabs';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  args: { defaultValue: 'photos' },
  render: (args) => (
    <Tabs {...args} className="w-md max-w-full">
      <TabsList aria-label="Content type">
        <TabsTrigger value="photos">Photos</TabsTrigger>
        <TabsTrigger value="videos">Videos</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="photos">128 photos from 37 guests.</TabsContent>
      <TabsContent value="videos">6 videos.</TabsContent>
      <TabsContent value="notes">14 notes.</TabsContent>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

async function expectTriggersAreTouchTargets(tabs: HTMLElement[]) {
  for (const tab of tabs) {
    // 44px minimum touch target (rule 05).
    await expect(tab.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  }
}

/** Arrow keys move between tabs (automatic activation) and show the matching panel. */
export const Keyboard: Story = {
  play: async ({ canvas }) => {
    const photos = canvas.getByRole('tab', { name: 'Photos' });
    const videos = canvas.getByRole('tab', { name: 'Videos' });
    await expect(photos).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('128 photos');

    photos.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(videos).toHaveFocus());
    await expect(videos).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('6 videos.');

    await userEvent.click(canvas.getByRole('tab', { name: 'Notes' }));
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('14 notes.');
    await expectTriggersAreTouchTargets(canvas.getAllByRole('tab'));
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('tab', { name: 'Photos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  },
};

const LONG_LABELS = [
  'Photos and pictures',
  'Videos and clips',
  'Documents and files',
  'Notes and wishes',
  'Uploaded by me',
  'Hidden by the admin',
];

/** Six long labels scroll inside the list; the page and the story root do not widen. */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { defaultValue: 'tab-0' },
  render: (args) => (
    <Tabs {...args} className="w-full">
      <TabsList aria-label="Content type">
        {LONG_LABELS.map((label, index) => (
          <TabsTrigger key={label} value={`tab-${index}`}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {LONG_LABELS.map((label, index) => (
        <TabsContent key={label} value={`tab-${index}`}>
          {label}
        </TabsContent>
      ))}
    </Tabs>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(window.innerWidth).toBe(360);
    const list = canvas.getByRole('tablist');
    // The list itself overflows (it scrolls), the story root does not.
    await expect(list.scrollWidth).toBeGreaterThan(list.clientWidth);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

    // Moving to the last tab by keyboard scrolls it into view inside the list.
    canvas.getByRole('tab', { name: LONG_LABELS[0] }).focus();
    await userEvent.keyboard('{End}');
    const last = canvas.getByRole('tab', { name: LONG_LABELS[5] });
    await waitFor(() => expect(last).toHaveFocus());
    await waitFor(() =>
      expect(last.getBoundingClientRect().right).toBeLessThanOrEqual(
        list.getBoundingClientRect().right + 1,
      ),
    );
    await expectTriggersAreTouchTargets(canvas.getAllByRole('tab'));
  },
};

/** The admin collection tabs: counts as mono data, the active tab underlined in pencil. */
export const WithCounts: Story = {
  args: { defaultValue: 'frames' },
  render: (args) => (
    <Tabs {...args} className="w-full max-w-2xl">
      <TabsList aria-label="Collection">
        <TabsTrigger value="frames">
          Кадри <span className="type-data">126</span>
        </TabsTrigger>
        <TabsTrigger value="texts">
          Тексти <span className="type-data">14</span>
        </TabsTrigger>
        <TabsTrigger value="access">Доступ</TabsTrigger>
        <TabsTrigger value="settings">Налаштування</TabsTrigger>
      </TabsList>
      <TabsContent value="frames">126 frames.</TabsContent>
      <TabsContent value="texts">14 texts.</TabsContent>
      <TabsContent value="access">Guest links.</TabsContent>
      <TabsContent value="settings">Collection settings.</TabsContent>
    </Tabs>
  ),
  play: async ({ canvas }) => {
    const underline = (name: string | RegExp) =>
      canvas.getByRole('tab', { name }).querySelector('[data-slot="tabs-underline"] path')!;
    // The underline is decorative and drawn only under the active tab (it draws in 180ms).
    await expect(
      canvas.getByRole('tab', { name: /Кадри/ }).querySelector('[data-slot="tabs-underline"]'),
    ).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(getComputedStyle(underline(/Кадри/)).strokeDashoffset).toBe('0px'));
    await expect(getComputedStyle(underline('Доступ')).strokeDashoffset).toBe('1px');
    await userEvent.click(canvas.getByRole('tab', { name: 'Доступ' }));
    await waitFor(() => expect(getComputedStyle(underline('Доступ')).strokeDashoffset).toBe('0px'));
  },
};

export const WithCountsDark: Story = {
  ...WithCounts,
  globals: { theme: 'dark' },
};

/** At 360px the list scrolls inside itself instead of widening the page. */
export const WithCountsPhone: Story = {
  ...WithCounts,
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas }) => {
    const list = canvas.getByRole('tablist');
    await expect(list.scrollWidth).toBeGreaterThan(list.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** The segmented variant: equal segments on a phone, an icon, a label and a count. */
export const Segmented: Story = {
  render: (args) => (
    <Tabs {...args} className="w-md max-w-full">
      <TabsList variant="segmented" aria-label="Collection">
        <TabsTrigger value="photos">
          <Images aria-hidden="true" />
          Content
        </TabsTrigger>
        <TabsTrigger value="links">
          <Link2 aria-hidden="true" />
          Links
          <TabsCount>3</TabsCount>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="photos">The gallery.</TabsContent>
      <TabsContent value="links">The guest links.</TabsContent>
    </Tabs>
  ),
  play: async ({ canvas }) => {
    const [content, links] = canvas.getAllByRole('tab');
    await expect(content).toHaveAttribute('aria-selected', 'true');
    await expectTriggersAreTouchTargets(canvas.getAllByRole('tab'));
    content!.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(links).toHaveFocus());
    await expect(links).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('The guest links.');
  },
};

export const SegmentedDark: Story = {
  ...Segmented,
  globals: { theme: 'dark' },
};

/** Four segments on a 390px phone (the collection page's tabs): labels shorten, nothing scrolls. */
export const SegmentedFourOnPhone: Story = {
  render: (args) => (
    <Tabs {...args} className="w-[358px]">
      <TabsList variant="segmented" aria-label="Collection">
        <TabsTrigger value="photos">
          <Images aria-hidden="true" />
          <span className="min-w-0 truncate">Content</span>
        </TabsTrigger>
        <TabsTrigger value="links">
          <Link2 aria-hidden="true" />
          <span className="min-w-0 truncate">Links</span>
          <TabsCount>3</TabsCount>
        </TabsTrigger>
        <TabsTrigger value="options">
          <Link2 aria-hidden="true" />
          <span className="min-w-0 truncate">Collection settings</span>
        </TabsTrigger>
        <TabsTrigger value="look">
          <Images aria-hidden="true" />
          <span className="min-w-0 truncate">Guest page</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="photos">The gallery.</TabsContent>
      <TabsContent value="links">The links.</TabsContent>
      <TabsContent value="options">Collection settings.</TabsContent>
      <TabsContent value="look">Guest page.</TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const list = canvasElement.querySelector<HTMLElement>('[data-slot="tabs-list"]')!;
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth + 1);
    await expect(list.getBoundingClientRect().width).toBeLessThanOrEqual(358);
  },
};
