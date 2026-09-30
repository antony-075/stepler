import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

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
