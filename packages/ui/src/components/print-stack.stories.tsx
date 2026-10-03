import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { samplePhoto } from '../stories/sample-photo';
import { PrintStack } from './print-stack';

const print = (hue: number, frameNo?: number) => ({
  key: String(hue),
  image: <img alt="" src={samplePhoto(hue)} />,
  frameNo,
});

const meta = {
  title: 'Components/PrintStack',
  component: PrintStack,
  args: {
    prints: [print(30, 114), print(150, 115), print(210, 116)],
    label: 'Ваші кадри: 30',
  },
  render: (args) => (
    <div className="grid place-items-center bg-background p-6">
      <PrintStack {...args} />
    </div>
  ),
} satisfies Meta<typeof PrintStack>;

export default meta;
type Story = StoryObj<typeof meta>;

const rotations = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-slot="print"]')].map(
    (el) => getComputedStyle(el).rotate,
  );

/** Three prints: left −1.5°, right +1.5°, the newest on top, level, with the print shadow. */
export const Three: Story = {
  play: async ({ canvas, canvasElement }) => {
    const stack = canvas.getByRole('img', { name: 'Ваші кадри: 30' });
    await expect(stack).toBeVisible();
    await expect(rotations(canvasElement)).toEqual(['-1.5deg', '1.5deg', 'none']);
    await expect(canvas.getByText('#116')).toBeInTheDocument();
    const prints = canvasElement.querySelectorAll<HTMLElement>('[data-slot="print"]');
    await expect(getComputedStyle(prints[2]!).boxShadow).not.toBe('none');
  },
};

export const Two: Story = {
  args: { prints: [print(30, 1), print(150, 2)], label: 'Ваші кадри: 2' },
  play: async ({ canvasElement }) => {
    await expect(rotations(canvasElement)).toEqual(['-1.5deg', 'none']);
  },
};

/** One print lies level. */
export const One: Story = {
  args: { prints: [print(210, 7)], label: 'Ваші кадри: 1' },
  play: async ({ canvasElement }) => {
    await expect(rotations(canvasElement)).toEqual(['none']);
  },
};

/** 320px phone: the stack is 220px wide and the page does not scroll sideways. */
export const Phone: Story = {
  globals: { viewport: { value: 'small' } },
  play: async ({ canvas }) => {
    const stack = canvas.getByRole('img', { name: 'Ваші кадри: 30' });
    await expect(stack.getBoundingClientRect().width).toBe(220);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const Dark: Story = {
  ...Three,
  globals: { theme: 'dark' },
};
