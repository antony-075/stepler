import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { FRAME_TINTS } from '../lib/frame-tints';
import { samplePhoto } from '../stories/sample-photo';
import { CollectionCover } from './collection-cover';

const meta = {
  title: 'Components/CollectionCover',
  component: CollectionCover,
  args: { tint: 'lavender', initials: 'ЮБ', size: 'cover' },
  decorators: [
    (Story) => (
      <div className="flex flex-wrap items-center gap-4 rounded-sheet border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CollectionCover>;

export default meta;
type Story = StoryObj<typeof meta>;

const slots = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('[data-slot="collection-cover"]'),
];

/** No cover yet: the initials in the collection's tint, at every size. Decorative. */
export const Initials: Story = {
  render: (args) => (
    <>
      <CollectionCover {...args} size="sm" />
      <CollectionCover {...args} size="cover" />
      <div className="w-72">
        <CollectionCover {...args} size="hero" />
      </div>
    </>
  ),
  play: async ({ canvasElement }) => {
    const all = slots(canvasElement);
    await expect(all).toHaveLength(3);
    for (const slot of all) {
      await expect(slot).toHaveAttribute('data-state', 'initials');
      await expect(slot).toHaveAttribute('data-tint', 'lavender');
      await expect(slot).toHaveAttribute('aria-hidden', 'true');
      await expect(slot).toHaveTextContent('ЮБ');
    }
    const [sm, cover] = all.map((slot) => slot.getBoundingClientRect());
    await expect(Math.round(sm!.width)).toBe(44);
    await expect(Math.round(cover!.width)).toBe(cover!.height);
  },
};

/** A cover picture fills the same box, cropped with `object-cover`; no initials show. */
export const Image: Story = {
  render: (args) => (
    <>
      <CollectionCover {...args} size="sm" image={<img alt="" src={samplePhoto(30)} />} />
      <CollectionCover {...args} size="cover" image={<img alt="" src={samplePhoto(150)} />} />
    </>
  ),
  play: async ({ canvasElement }) => {
    for (const slot of slots(canvasElement)) {
      await expect(slot).toHaveAttribute('data-state', 'image');
      await expect(slot).toHaveAttribute('aria-hidden', 'true');
      await expect(slot).not.toHaveTextContent('ЮБ');
      const img = slot.querySelector('img')!;
      const box = slot.getBoundingClientRect();
      const picture = img.getBoundingClientRect();
      await expect(Math.round(picture.width)).toBe(Math.round(box.width));
      await expect(Math.round(picture.height)).toBe(Math.round(box.height));
      await expect(getComputedStyle(img).objectFit).toBe('cover');
    }
  },
};

/** The guest page's hero at a phone's column and a desktop side panel: 16:10 by default. */
export const Hero: Story = {
  render: (args) => (
    <div className="grid gap-4">
      <div className="w-[328px]" data-width="phone">
        <CollectionCover {...args} size="hero" image={<img alt="" src={samplePhoto(210)} />} />
      </div>
      <div className="w-[1024px] max-w-none" data-width="wide">
        <CollectionCover {...args} size="hero" image={<img alt="" src={samplePhoto(90)} />} />
      </div>
      <div className="w-[340px]" data-width="panel">
        <CollectionCover {...args} size="hero" className="aspect-[4/3]" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const ratio = (width: string) => {
      const slot = canvasElement.querySelector<HTMLElement>(
        `[data-width="${width}"] [data-slot="collection-cover"]`,
      )!;
      const box = slot.getBoundingClientRect();
      return box.width / box.height;
    };
    await expect(ratio('phone')).toBeCloseTo(16 / 10, 1);
    await expect(ratio('wide')).toBeCloseTo(16 / 10, 1);
    await expect(ratio('panel')).toBeCloseTo(4 / 3, 1);
  },
};

/** Every tint's initials; axe checks the ink on each fill. */
export const AllTints: Story = {
  render: () => (
    <>
      {FRAME_TINTS.map((tint, index) => (
        <div key={tint} className="flex items-center gap-3">
          <CollectionCover tint={tint} initials={['В', 'ЮБ', 'Х', 'ДН'][index] ?? 'В'} size="sm" />
          <CollectionCover
            tint={tint}
            initials={['В', 'ЮБ', 'Х', 'ДН'][index] ?? 'В'}
            size="cover"
          />
        </div>
      ))}
    </>
  ),
  play: async ({ canvasElement }) => {
    const tints = slots(canvasElement).map((slot) => slot.getAttribute('data-tint'));
    await expect(new Set(tints)).toEqual(new Set(FRAME_TINTS));
  },
};

export const AllTintsDark: Story = {
  ...AllTints,
  globals: { theme: 'dark' },
};
