import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { samplePhoto } from '../stories/sample-photo';
import { Frame } from './frame';
import { FrameGrid } from './frame-grid';

function frames(count: number) {
  return Array.from({ length: count }, (_, i) => (
    <Frame
      key={i}
      kind="photo"
      number={i + 1}
      time={`20:${String(i % 60).padStart(2, '0')}`}
      media={<img alt="" src={samplePhoto((i * 37) % 360)} />}
      accessibleName={`Кадр ${i + 1}, фото`}
      onOpen={() => {}}
    />
  ));
}

/** The grid's content box is `width` (its 1px edge is outside), as DESIGN-SYSTEM.md §7.2 counts. */
function sheet(width: number, count = 14) {
  return (
    <div style={{ width: width + 2 }}>
      <FrameGrid ariaLabel="Кадри колекції">{frames(count)}</FrameGrid>
    </div>
  );
}

const meta = {
  title: 'Components/FrameGrid',
  component: FrameGrid,
  args: { ariaLabel: 'Кадри колекції', children: null },
} satisfies Meta<typeof FrameGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

async function expectColumns(canvasElement: HTMLElement, expected: number) {
  const list = canvasElement.querySelector<HTMLElement>('[data-slot="frame-grid"] ul')!;
  await expect(getComputedStyle(list).getPropertyValue('--cols').trim()).toBe(String(expected));
  const first = list.children[0]!.getBoundingClientRect();
  const row = Array.from(list.children).filter(
    (item) => Math.round(item.getBoundingClientRect().top) === Math.round(first.top),
  );
  await expect(row).toHaveLength(expected);
}

/** A 320px phone: three columns of about 95px. */
export const Phone288: Story = {
  render: () => sheet(288),
  play: async ({ canvasElement }) => expectColumns(canvasElement, 3),
};

/** A 1440px desktop beside the timeline and details: eight columns. */
export const Desktop944: Story = {
  render: () => sheet(944),
  play: async ({ canvasElement }) => expectColumns(canvasElement, 8),
};

/** 1920px: twelve columns at most; frames grow no further. */
export const Wide1680: Story = {
  render: () => sheet(1680, 26),
  play: async ({ canvasElement }) => expectColumns(canvasElement, 12),
};

/** Steps in between (§7.2 table). */
export const Steps: Story = {
  render: () => (
    <div className="grid gap-4">
      {[343, 528, 704, 1304].map((width) => (
        <div key={width} data-width={width}>
          {sheet(width, 12)}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const expected: Record<string, string> = { 343: '3', 528: '5', 704: '6', 1304: '10' };
    for (const box of canvasElement.querySelectorAll<HTMLElement>('[data-width]')) {
      const list = box.querySelector<HTMLElement>('ul')!;
      await expect(getComputedStyle(list).getPropertyValue('--cols').trim()).toBe(
        expected[box.dataset.width!],
      );
    }
  },
};

/** Dense: 4px frame padding; a short last row stays plain sheet. */
export const Dense: Story = {
  render: () => (
    <div style={{ width: 530 }}>
      <FrameGrid ariaLabel="Кадри колекції" density="dense">
        {frames(7)}
      </FrameGrid>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector<HTMLElement>('[data-slot="frame"]')!;
    await expect(getComputedStyle(frame).paddingTop).toBe('4px');
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  render: () => sheet(528, 7),
  play: async ({ canvasElement }) => expectColumns(canvasElement, 5),
};
