import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { Button } from './button';
import { Frame } from './frame';
import { samplePhoto } from '../stories/sample-photo';
import { FrameGrid } from './frame-grid';

const meta = {
  title: 'Components/Frame',
  component: Frame,
  args: {
    kind: 'photo',
    number: 86,
    time: '21:10',
    accessibleName: 'Кадр 86, фото, 21:10, Ірина',
    media: <img alt="" src={samplePhoto(150)} />,
    onOpen: fn(),
  },
  render: (args) => (
    <div className="w-40">
      <Frame {...args} />
    </div>
  ),
} satisfies Meta<typeof Frame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A photo opens the viewer; its name is the frame's whole meaning, the media is hidden. */
export const Photo: Story = {
  play: async ({ canvas, args }) => {
    const frame = canvas.getByRole('button', { name: 'Кадр 86, фото, 21:10, Ірина' });
    await expect(frame).not.toHaveAttribute('aria-pressed');
    await expect(canvas.getByText('#086')).toBeInTheDocument();
    await userEvent.click(frame);
    await expect(args.onOpen).toHaveBeenCalledOnce();
  },
};

/** Every kind side by side on one sheet. */
export const Kinds: Story = {
  render: () => (
    <div className="max-w-[640px]">
      <FrameGrid ariaLabel="Кадри">
        <Frame
          kind="photo"
          number={1}
          time="20:01"
          media={<img alt="" src={samplePhoto(30)} />}
          accessibleName="Кадр 1, фото, 20:01"
          onOpen={() => {}}
        />
        <Frame
          kind="video"
          number={2}
          time="20:04"
          meta="1:30"
          media={<img alt="" src={samplePhoto(210)} />}
          accessibleName="Кадр 2, відео 1:30, 20:04"
          onOpen={() => {}}
        />
        <Frame
          kind="document"
          number={3}
          time="20:09"
          meta="8,6 МБ"
          docType="PDF"
          docTitle="Програма вечора"
          accessibleName="Кадр 3, документ PDF «Програма вечора», 20:09"
          onOpen={() => {}}
        />
        <Frame
          kind="text"
          number={4}
          time="20:15"
          text="Вітаємо! Нехай кожен день буде як сьогодні."
          name="Ірина"
          accessibleName="Кадр 4, побажання, 20:15, Ірина"
          onOpen={() => {}}
        />
        <Frame
          kind="pending-preview"
          number={5}
          time="20:16"
          placeholderLabel="Готується прев’ю"
          accessibleName="Кадр 5, фото, 20:16, готується прев’ю"
          onOpen={() => {}}
        />
        <Frame
          kind="empty"
          number={6}
          time=""
          placeholderLabel="Чекає на перший кадр"
          accessibleName="Кадр 6 ще порожній"
        />
      </FrameGrid>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('list', { name: 'Кадри' })).toBeVisible();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(6);
    await expect(canvas.getByText('Готується прев’ю')).toBeVisible();
    // The empty frame is not interactive: a named group, not a button.
    await expect(canvas.getByRole('group', { name: 'Кадр 6 ще порожній' })).toBeVisible();
  },
};

/** Selection mode: a toggle with `aria-pressed`, a pencil edge, a circle and a ✓. */
export const Selected: Story = {
  args: {
    selectable: true,
    selected: true,
    onToggleSelect: fn(),
    accessibleName: 'Кадр 86, фото, 21:10, вибрано',
  },
  play: async ({ canvas, canvasElement, args }) => {
    const frame = canvas.getByRole('button', { name: /вибрано/ });
    await expect(frame).toHaveAttribute('aria-pressed', 'true');
    const root = canvasElement.querySelector<HTMLElement>('[data-slot="frame"]')!;
    await expect(getComputedStyle(root).boxShadow).toContain('inset');
    await expect(
      canvasElement.querySelector('[data-slot="pencil-mark"][data-variant="circle"]'),
    ).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(frame);
    await expect(args.onToggleSelect).toHaveBeenCalledOnce();
    await expect(args.onOpen).not.toHaveBeenCalled();
  },
};

/** "New" is a pencil underline under the number, and the words in the name. */
export const New: Story = {
  args: { isNew: true, accessibleName: 'Кадр 86, фото, 21:10, нове' },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-slot="pencil-mark"][data-variant="underline"]'),
    ).not.toBeNull();
  },
};

/** Another guest's frame: no number, only the time. */
export const WithoutNumber: Story = {
  args: { number: undefined, accessibleName: 'Фото, 21:10' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/^#/)).toBeNull();
    await expect(canvas.getByText('21:10')).toBeVisible();
  },
};

/** 5000 characters clamp to five lines inside the square; the frame keeps its width. */
export const LongText: Story = {
  args: {
    kind: 'text',
    media: undefined,
    text: 'Вітаємо з днем весілля! '.repeat(210).slice(0, 5000),
    name: 'Олена',
    accessibleName: 'Кадр 86, побажання, 21:10, Олена',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('[data-slot="frame"]')!;
    const media = canvasElement.querySelector<HTMLElement>('[data-slot="frame-media"]')!;
    await expect(root.getBoundingClientRect().width).toBe(160);
    const box = media.getBoundingClientRect();
    await expect(Math.round(box.height)).toBe(Math.round(box.width));
    await expect(getComputedStyle(media.querySelector('p')!).webkitLineClamp).toBe('5');
  },
};

/** A 100-character unbroken file name breaks anywhere instead of widening the frame. */
export const LongFileName: Story = {
  args: {
    kind: 'document',
    media: undefined,
    docType: 'DOCX',
    docTitle: 'x'.repeat(100),
    accessibleName: 'Кадр 86, документ DOCX, 21:10',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('[data-slot="frame"]')!;
    await expect(root.getBoundingClientRect().width).toBe(160);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};

/** An action under the frame (a failed upload's retry), outside the frame's button. */
export const WithAction: Story = {
  args: {
    actions: (
      <Button variant="outline" className="w-full">
        Повторити
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    const retry = canvas.getByRole('button', { name: 'Повторити' });
    await expect(retry.closest('[data-slot="frame-actions"]')).not.toBeNull();
    await expect(retry.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  render: Kinds.render,
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getAllByRole('listitem')).toHaveLength(6);
  },
};
