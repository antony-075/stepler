import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { FRAME_TINTS } from '../lib/frame-tints';
import { FrameSlots } from './frame-slots';

const meta = {
  title: 'Components/FrameSlots',
  component: FrameSlots,
  args: { count: 5, tint: 'lavender' },
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-sheet border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FrameSlots>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One collection's tint: a row of numbered empty frames. Decorative, so hidden from AT. */
export const OneTint: Story = {
  play: async ({ canvasElement }) => {
    const slots = canvasElement.querySelector('[data-slot="frame-slots"]');
    await expect(slots).toHaveAttribute('aria-hidden', 'true');
    const frames = canvasElement.querySelectorAll('[data-slot="frame-slot"]');
    await expect(frames).toHaveLength(5);
    await expect(frames[0]).toHaveTextContent('#001');
    await expect(frames[4]).toHaveTextContent('#005');
    for (const frame of frames) await expect(frame).toHaveAttribute('data-tint', 'lavender');
  },
};

/** Without a tint the slots walk through every tint: the empty dashboard's composition. */
export const AllTints: Story = {
  args: { count: 6, tint: undefined, columns: 3 },
  play: async ({ canvasElement }) => {
    const tints = [...canvasElement.querySelectorAll('[data-slot="frame-slot"]')].map((frame) =>
      frame.getAttribute('data-tint'),
    );
    await expect(tints.slice(0, FRAME_TINTS.length)).toEqual([...FRAME_TINTS]);
  },
};

export const AllTintsDark: Story = {
  ...AllTints,
  globals: { theme: 'dark' },
};

/** Each tint on its own row, both themes from the toolbar. */
export const EveryTint: Story = {
  render: () => (
    <div className="grid gap-3">
      {FRAME_TINTS.map((tint) => (
        <FrameSlots key={tint} count={5} tint={tint} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="frame-slots"]')).toHaveLength(4);
  },
};
