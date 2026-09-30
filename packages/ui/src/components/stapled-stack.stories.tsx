import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { StapledStack } from './stapled-stack';

const meta = {
  title: 'Components/StapledStack',
  component: StapledStack,
  args: {
    label:
      'Photo and video from guests, the evening programme and a note, stapled into one collection',
    photoCaption: 'Added by Marta, 21:10',
    videoCaption: 'Added by Andrii, 22:40',
    videoDuration: '0:42',
    documentKind: 'PDF',
    documentTitle: 'Evening programme',
    note: 'Thanks for a wonderful evening!',
    noteAuthor: 'Olena',
  },
  decorators: [
    (Story) => (
      <div className="w-[360px] max-w-full p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StapledStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, args }) => {
    // One image for assistive technology; the tiles inside are decorative.
    await expect(canvas.getByRole('img', { name: args.label })).toBeVisible();
  },
};
