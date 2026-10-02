import type { Meta, StoryObj } from '@storybook/react-vite';
import { Trash2, TriangleAlert } from 'lucide-react';
import { expect } from 'storybook/test';
import { Button } from './button';
import { Input } from './input';
import { SettingRow, SettingsSection } from './setting-row';
import { Textarea } from './textarea';

function Demo({ title = 'Olia and Taras, wedding' }: { title?: string }) {
  return (
    <div className="mx-auto grid max-w-[640px] gap-8">
      <SettingsSection id="details" title="Details" description="Guests see these.">
        <SettingRow id="title" label="Title" hint="Up to 100 characters." control="wide">
          <Input aria-labelledby="title" aria-describedby="title-hint" defaultValue={title} />
        </SettingRow>
        <SettingRow id="description" label="Description" control="wide">
          <Textarea aria-labelledby="description" defaultValue="Saturday, 14:00" />
        </SettingRow>
      </SettingsSection>
      <SettingsSection id="access" title="Guest access">
        <SettingRow
          id="archive"
          label="Archive"
          hint="Guests lose access, everything is kept. You can bring it back at any time."
        >
          <Button variant="outline" aria-describedby="archive-hint">
            Archive
          </Button>
        </SettingRow>
      </SettingsSection>
      <SettingsSection id="danger" title="Danger zone" tone="danger">
        <SettingRow
          id="delete"
          label={
            <span className="flex items-center gap-2">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
              Delete collection
            </span>
          }
          hint="The collection and everything in it are deleted for good."
        >
          <Button variant="destructive" aria-describedby="delete-hint">
            <Trash2 aria-hidden="true" />
            Delete collection
          </Button>
        </SettingRow>
      </SettingsSection>
    </div>
  );
}

const meta = {
  title: 'Components/SettingRow',
  component: Demo,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <main className="stepler-container py-6">
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

function rowParts(canvasElement: HTMLElement, id: string) {
  const label = canvasElement.querySelector(`#${id}`);
  const row = label?.closest('[data-slot="setting-row"]');
  const control = row?.querySelector('[data-slot="setting-row-control"]');
  if (!label || !control) throw new Error(`row ${id} missing`);
  return { label: label.getBoundingClientRect(), control: control.getBoundingClientRect() };
}

/** On phones a wide row stacks: the input goes under its label and fills the row. */
export const Wide: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas, canvasElement }) => {
    await expect(window.innerWidth).toBe(360);
    const { label, control } = rowParts(canvasElement, 'title');
    await expect(control.top).toBeGreaterThan(label.bottom);
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toHaveAccessibleDescription(
      'Up to 100 characters.',
    );
  },
};

/** From 600px the label sits on the left and the input takes the rest of the row. */
export const WideLaptop: Story = {
  globals: { viewport: { value: 'laptop' } },
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(1280);
    const { label, control } = rowParts(canvasElement, 'title');
    await expect(control.top).toBeLessThan(label.bottom);
    await expect(control.left).toBeGreaterThan(label.right);
    // A compact row keeps its button at its own width on the right.
    const archive = rowParts(canvasElement, 'archive');
    await expect(archive.control.width).toBeLessThan(200);
    await expect(archive.control.left).toBeGreaterThan(archive.label.left + 200);
  },
};

/** A 100-character unbroken title neither widens the panel nor scrolls the page sideways. */
export const LongText: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { title: 'Ж'.repeat(100) },
  play: async ({ canvasElement }) => {
    const root = document.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    const panel = canvasElement.querySelector('[data-slot="settings-section-panel"]')!;
    await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
  },
};

/**
 * The danger panel: soft destructive fill, solid destructive edge, a warning icon by the row's
 * name and a filled destructive button (it opens a ConfirmDialog); axe checks its contrast.
 */
export const Danger: Story = {
  play: async ({ canvas, canvasElement }) => {
    const section = canvas.getByRole('region', { name: 'Danger zone' });
    await expect(section).toBeVisible();
    const panel = section.querySelector('[data-slot="settings-section-panel"]')!;
    await expect(panel).toHaveAttribute('data-tone', 'danger');
    await expect(canvasElement.querySelectorAll('h2')).toHaveLength(3);
  },
};

export const DangerDark: Story = { ...Danger, globals: { theme: 'dark' } };
