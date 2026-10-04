import type { Meta, StoryObj } from '@storybook/react-vite';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { samplePhoto } from '../stories/sample-photo';
import { Button } from './button';
import { Frame } from './frame';
import { FrameGrid } from './frame-grid';
import { SelectionBar } from './selection-bar';

const FRAMES = Array.from({ length: 24 }, (_, index) => index + 1);

/** A grid in selection mode with the bar under it, as the admin «Вміст» tab lays it out. */
function Demo({ onDelete }: { onDelete: (ids: number[]) => void }) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set([3, 5, 8]));
  const toggle = (n: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  return (
    <div className="grid px-4 pt-4 lg:px-8">
      <FrameGrid ariaLabel="Кадри">
        {FRAMES.map((n) => (
          <Frame
            key={n}
            kind="photo"
            number={n}
            time="21:10"
            media={<img alt="" src={samplePhoto(n * 15)} />}
            selectable
            selected={selected.has(n)}
            onToggleSelect={() => toggle(n)}
            accessibleName={`Кадр ${n}, фото, 21:10${selected.has(n) ? ', вибрано' : ''}`}
          />
        ))}
      </FrameGrid>
      {selected.size > 0 ? (
        <SelectionBar
          count={selected.size}
          countLabel={`Вибрано ${selected.size}`}
          label="Дії з вибраними кадрами"
          clearLabel="Скасувати вибір"
          onClear={() => setSelected(new Set())}
          className="-mx-4 lg:mx-0"
          actions={
            <Button type="button" variant="outline" onClick={() => onDelete([...selected])}>
              <Trash2 aria-hidden="true" />
              Видалити
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

const meta = {
  title: 'Components/SelectionBar',
  component: Demo,
  args: { onDelete: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The count in a named region; the action gets the selection; 44px buttons. */
export const Selected: Story = {
  play: async ({ canvas, args }) => {
    const bar = canvas.getByRole('region', { name: 'Дії з вибраними кадрами' });
    await expect(bar).toHaveTextContent('Вибрано 3');
    await expect(bar).toHaveAttribute('data-toast-avoid');
    await userEvent.click(canvas.getByRole('button', { name: 'Кадр 1, фото, 21:10' }));
    await expect(bar).toHaveTextContent('Вибрано 4');
    const remove = canvas.getByRole('button', { name: 'Видалити' });
    const clear = canvas.getByRole('button', { name: 'Скасувати вибір' });
    for (const button of [remove, clear]) {
      await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    await userEvent.click(remove);
    await expect(args.onDelete).toHaveBeenCalledWith([3, 5, 8, 1]);
  },
};

/** `Escape` (focus outside any dialog) clears the selection and the bar goes away. */
export const EscapeClears: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Кадр 1, фото, 21:10' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.queryByRole('region')).toBeNull());
    await expect(canvas.getByRole('button', { name: 'Кадр 3, фото, 21:10' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
};

/** 360px: the bar spans the phone, the clear button is a named icon, nothing scrolls sideways,
 *  and scrolled to the end the last row sits above the bar (it is in the flow, not over it). */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvas, canvasElement }) => {
    const bar = canvas.getByRole('region', { name: 'Дії з вибраними кадрами' });
    const clear = canvas.getByRole('button', { name: 'Скасувати вибір' });
    await expect(clear.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    window.scrollTo(0, document.documentElement.scrollHeight);
    await waitFor(async () => {
      const frames = canvasElement.querySelectorAll('[data-slot="frame"]');
      const last = frames[frames.length - 1]!.getBoundingClientRect();
      await expect(last.bottom).toBeLessThanOrEqual(bar.getBoundingClientRect().top + 1);
    });
  },
};

export const Dark: Story = { ...Selected, globals: { theme: 'dark' } };
