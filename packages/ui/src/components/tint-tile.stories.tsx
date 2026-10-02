import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImagePlus } from 'lucide-react';
import { expect } from 'storybook/test';
import { FRAME_TINTS } from '../lib/frame-tints';
import { TintTile } from './tint-tile';

const meta = {
  title: 'Components/TintTile',
  component: TintTile,
  args: { tint: 'lavender', children: 'ЮБ' },
  decorators: [
    (Story) => (
      <div className="flex flex-wrap items-center gap-4 rounded-sheet border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TintTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A collection's cover before it has content: its initials in its tint. Decorative. */
export const Initials: Story = {
  play: async ({ canvasElement }) => {
    const tile = canvasElement.querySelector('[data-slot="tint-tile"]');
    await expect(tile).toHaveAttribute('aria-hidden', 'true');
    await expect(tile).toHaveAttribute('data-tint', 'lavender');
    await expect(tile).toHaveTextContent('ЮБ');
  },
};

/** Every tint at every size; axe checks the ink on each fill. */
export const AllTints: Story = {
  render: () => (
    <>
      {FRAME_TINTS.map((tint, index) => (
        <div key={tint} className="flex items-center gap-3">
          <TintTile tint={tint} size="sm">
            {['В', 'ЮБ', 'Х', 'ДН'][index]}
          </TintTile>
          <TintTile tint={tint}>{['В', 'ЮБ', 'Х', 'ДН'][index]}</TintTile>
          <TintTile tint={tint} size="lg">
            <ImagePlus aria-hidden="true" />
          </TintTile>
        </div>
      ))}
    </>
  ),
  play: async ({ canvasElement }) => {
    const tints = [...canvasElement.querySelectorAll('[data-slot="tint-tile"]')].map((tile) =>
      tile.getAttribute('data-tint'),
    );
    await expect(new Set(tints)).toEqual(new Set(FRAME_TINTS));
  },
};

export const AllTintsDark: Story = {
  ...AllTints,
  globals: { theme: 'dark' },
};
