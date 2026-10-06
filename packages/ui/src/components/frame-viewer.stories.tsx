import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';
import { samplePhoto } from '../stories/sample-photo';
import { Button } from './button';
import { FrameViewer } from './frame-viewer';
import { minTarget } from '../stories/target';

const FRAMES = [
  { number: 85, hue: 30 },
  { number: 86, hue: 150 },
  { number: 87, hue: 250 },
];

/** A gallery stand-in: a frame opens the viewer; arrows and buttons move between frames. */
function Gallery({
  onPrev,
  onNext,
  text,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  text?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const current = open === null ? undefined : FRAMES[open];
  return (
    <>
      <div className="flex gap-2">
        {FRAMES.map((frame, index) => (
          <Button key={frame.number} variant="outline" onClick={() => setOpen(index)}>
            Кадр {frame.number}
          </Button>
        ))}
      </div>
      <FrameViewer
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        title={current ? `#0${current.number} 21:10 Ірина` : ''}
        closeLabel="Закрити"
        prevLabel="Попередній кадр"
        nextLabel="Наступний кадр"
        onPrev={
          open !== null && open > 0
            ? () => {
                onPrev?.();
                setOpen(open - 1);
              }
            : undefined
        }
        onNext={
          open !== null && open < FRAMES.length - 1
            ? () => {
                onNext?.();
                setOpen(open + 1);
              }
            : undefined
        }
        actions={
          <Button
            variant="ghost"
            className="text-viewer-foreground hover:bg-[rgb(255_255_255/0.12)]"
          >
            Завантажити
          </Button>
        }
        details={<p className="text-muted-foreground">Додано о 21:10, 14 вересня</p>}
      >
        {text ? (
          // A long text scrolls inside a focusable box, so keyboard users can scroll it too.
          <p
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className="max-w-[60ch] overflow-y-auto text-xl leading-normal whitespace-pre-line"
          >
            {text}
          </p>
        ) : current ? (
          <img alt="" src={samplePhoto(current.hue)} className="h-[60dvh] w-auto" />
        ) : null}
      </FrameViewer>
    </>
  );
}

const meta = {
  title: 'Components/FrameViewer',
  component: Gallery,
  args: { onPrev: fn(), onNext: fn() },
} satisfies Meta<typeof Gallery>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens on the dark stage; →/← step; focus stays inside; Escape returns focus to the opener. */
export const Keyboard: Story = {
  play: async ({ canvas, args }) => {
    const opener = canvas.getByRole('button', { name: 'Кадр 86' });
    await userEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: '#086 21:10 Ірина' });
    await waitFor(() => expect(dialog).toBeVisible());

    await userEvent.keyboard('{ArrowRight}');
    await expect(args.onNext).toHaveBeenCalledOnce();
    await expect(screen.getByRole('dialog', { name: '#087 21:10 Ірина' })).toBeVisible();
    // The last frame has no next button.
    await expect(screen.queryByRole('button', { name: 'Наступний кадр' })).toBeNull();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(args.onPrev).toHaveBeenCalledOnce();

    // Tab cycles inside the viewer.
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      await expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

/** The buttons are 44px and named; the close button closes. */
export const Buttons: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Кадр 85' }));
    const next = await screen.findByRole('button', { name: 'Наступний кадр' });
    await expect(screen.queryByRole('button', { name: 'Попередній кадр' })).toBeNull();
    for (const button of [next, screen.getByRole('button', { name: 'Закрити' })]) {
      const box = button.getBoundingClientRect();
      await expect(box.width).toBeGreaterThanOrEqual(minTarget());
      await expect(box.height).toBeGreaterThanOrEqual(minTarget());
    }
    await userEvent.click(next);
    await expect(args.onNext).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  },
};

/** A 5000-character text at 360px never scrolls the page sideways. */
export const LongTextPhone: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { text: 'Вітаємо!'.repeat(625) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Кадр 86' }));
    const dialog = await screen.findByRole('dialog');
    await expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Кадр 86' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
  },
};
