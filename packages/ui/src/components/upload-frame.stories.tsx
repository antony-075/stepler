import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { samplePhoto } from '../stories/sample-photo';
import { FrameGrid } from './frame-grid';
import { UploadFrame, type UploadFrameLabels } from './upload-frame';
import { minTarget } from '../stories/target';

const labels: UploadFrameLabels = {
  queued: 'У черзі',
  processing: 'Обробка…',
  done: 'Додано',
  failed: 'Не вдалося',
  retry: 'Повторити',
  cancel: 'Скасувати',
  position: (index, total) => `${index} з ${total}`,
  percent: (value) => `${value}%`,
};

const meta = {
  title: 'Components/UploadFrame',
  component: UploadFrame,
  args: {
    state: 'uploading',
    progress: 40,
    preview: <img alt="" src={samplePhoto(150)} />,
    position: { index: 2, total: 6 },
    accessibleName: 'Кадр 2 з 6, завантажується',
    labels,
  },
  render: (args) => (
    <div className="w-36">
      <UploadFrame {...args} />
    </div>
  ),
} satisfies Meta<typeof UploadFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bytes moving: the veil lifts to 60% height, a pencil edge, the percent in pencil mono. */
export const Uploading: Story = {
  play: async ({ canvas, canvasElement }) => {
    const group = canvas.getByRole('group', { name: 'Кадр 2 з 6, завантажується' });
    await expect(group).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.getByText('40%')).toBeVisible();
    await expect(canvas.getByText('2 з 6')).toBeVisible();
    const veil = canvasElement.querySelector<HTMLElement>('[data-slot="upload-veil"]')!;
    await expect(veil.style.transform).toBe('scaleY(0.6)');
  },
};

/** Every state on one sheet, as the guest sees a batch of six. */
export const States: Story = {
  render: () => (
    <div className="max-w-[640px]">
      <FrameGrid ariaLabel="Ваші кадри">
        <UploadFrame
          state="done"
          frameNo={87}
          position={{ index: 1, total: 6 }}
          preview={<img alt="" src={samplePhoto(30)} />}
          accessibleName="Кадр 87, додано"
          labels={labels}
        />
        <UploadFrame
          state="uploading"
          progress={40}
          position={{ index: 2, total: 6 }}
          preview={<img alt="" src={samplePhoto(150)} />}
          accessibleName="Кадр 2 з 6, завантажується"
          labels={labels}
          onCancel={() => {}}
        />
        <UploadFrame
          state="processing"
          position={{ index: 3, total: 6 }}
          preview={<img alt="" src={samplePhoto(210)} />}
          accessibleName="Кадр 3 з 6, обробка"
          labels={labels}
        />
        <UploadFrame
          state="queued"
          position={{ index: 4, total: 6 }}
          preview={<img alt="" src={samplePhoto(90)} />}
          accessibleName="Кадр 4 з 6, у черзі"
          labels={labels}
          onCancel={() => {}}
        />
        <UploadFrame
          state="queued"
          position={{ index: 5, total: 6 }}
          accessibleName="Кадр 5 з 6, у черзі"
          labels={labels}
        />
        <UploadFrame
          state="failed"
          position={{ index: 6, total: 6 }}
          preview={<img alt="" src={samplePhoto(330)} />}
          accessibleName="Кадр 6 з 6, не вдалося"
          reason="зв’язок перервався"
          labels={labels}
          onRetry={() => {}}
        />
      </FrameGrid>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(6);
    // The real number only once the backend has the file.
    await expect(canvas.getByText('#087')).toBeVisible();
    await expect(canvas.queryByText('1 з 6')).toBeNull();
    await expect(canvas.getAllByText('У черзі')).toHaveLength(2);
    await expect(canvas.getByText('Обробка…')).toBeVisible();
    await expect(
      canvas.getByRole('group', { name: 'Кадр 6 з 6, не вдалося: зв’язок перервався' }),
    ).toBeVisible();
  },
};

/** Failed: the reason is in the name; «Повторити» is a 44px control reachable by keyboard. */
export const Failed: Story = {
  args: {
    state: 'failed',
    accessibleName: 'Кадр 2 з 6, не вдалося',
    reason: 'зв’язок перервався',
    onRetry: fn(),
  },
  play: async ({ canvas, args }) => {
    await expect(
      canvas.getByRole('group', { name: 'Кадр 2 з 6, не вдалося: зв’язок перервався' }),
    ).toBeVisible();
    await expect(canvas.getByText('Не вдалося')).toBeVisible();
    const retry = canvas.getByRole('button', { name: 'Повторити' });
    await expect(retry.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
    await userEvent.tab();
    await expect(retry).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};

/** Queued and uploading frames can be cancelled from a 44px corner target. */
export const Cancel: Story = {
  args: { state: 'queued', accessibleName: 'Кадр 2 з 6, у черзі', onCancel: fn() },
  play: async ({ canvas, args }) => {
    const cancel = canvas.getByRole('button', { name: 'Скасувати' });
    const box = cancel.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(minTarget());
    await expect(box.height).toBeGreaterThanOrEqual(minTarget());
    await userEvent.click(cancel);
    await expect(args.onCancel).toHaveBeenCalledOnce();
  },
};

/** A done frame offers no cancel even when the handler is passed. */
export const Done: Story = {
  args: { state: 'done', frameNo: 87, accessibleName: 'Кадр 87, додано', onCancel: fn() },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('#087')).toBeVisible();
    // «Додано» fades in (180ms).
    await waitFor(() => expect(canvas.getByText('Додано')).toBeVisible());
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

export const DarkStates: Story = {
  ...States,
  globals: { theme: 'dark' },
};
