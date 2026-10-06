import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { UploadSummary, type UploadSummaryLabels } from './upload-summary';
import { minTarget } from '../stories/target';

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} МБ`;

const labels: UploadSummaryLabels = {
  added: (added, total) => `${added} з ${total} додано`,
  failed: (count) => `${count} не вдалося`,
  cancelled: (count) => `Скасовано ${count}`,
  bytes: (done, total) => `${mb(done)} з ${mb(total)}`,
  eta: (seconds) => `Залишилось ~${Math.ceil(seconds / 60)} хв`,
  progress: 'Завантаження кадрів',
  announce: (added, total, failed) =>
    failed > 0 ? `Додано ${added} з ${total}. ${failed} не вдалося` : `Додано ${added} з ${total}`,
  retryFailed: 'Повторити невдалі',
  cancelRest: 'Скасувати решту',
  offline: 'Немає з’єднання. Продовжимо, щойно воно з’явиться',
  retryNow: 'Повторити зараз',
  why: 'Чому?',
};

const meta = {
  title: 'Components/UploadSummary',
  component: UploadSummary,
  args: {
    added: 12,
    total: 30,
    failed: 0,
    cancelled: 0,
    bytesDone: 148_000_000,
    bytesTotal: 410_000_000,
    etaSeconds: 170,
    offline: false,
    labels,
    onRetryFailed: fn(),
    onCancelRest: fn(),
    onRetryNow: fn(),
  },
  render: (args) => (
    <div className="max-w-[560px]">
      <UploadSummary {...args} />
    </div>
  ),
} satisfies Meta<typeof UploadSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-batch: counts in words, bytes and the estimate in mono, one progress line. */
export const Uploading: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('12 з 30 додано')).toBeVisible();
    await expect(canvas.getByText('148 МБ з 410 МБ')).toBeVisible();
    await expect(canvas.getByText('Залишилось ~3 хв')).toBeVisible();
    await expect(canvas.getByRole('progressbar', { name: 'Завантаження кадрів' })).toHaveAttribute(
      'aria-valuenow',
      String((148 / 410) * 100),
    );
    await expect(canvas.queryByRole('button', { name: 'Повторити невдалі' })).toBeNull();
    // The live region speaks the quarter, not the percent.
    await expect(canvas.getByText('Додано 12 з 30')).toHaveAttribute('aria-live', 'polite');
  },
};

/** Partial success is normal: «27 з 30 додано», «3 не вдалося», then the two follow-ups. */
export const Partial: Story = {
  args: { added: 27, failed: 3, bytesDone: 410_000_000, etaSeconds: undefined },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText('27 з 30 додано')).toBeVisible();
    await expect(canvas.getByText('3 не вдалося')).toBeVisible();
    // Everything has settled: nothing left to cancel.
    await expect(canvas.queryByRole('button', { name: 'Скасувати решту' })).toBeNull();
    const retry = canvas.getByRole('button', { name: 'Повторити невдалі' });
    await expect(retry.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
    await userEvent.click(retry);
    await expect(args.onRetryFailed).toHaveBeenCalledOnce();
    await expect(canvas.getByText('Додано 27 з 30. 3 не вдалося')).toBeInTheDocument();
  },
};

/** Some failed while others still upload: both follow-ups. */
export const FailedWhileUploading: Story = {
  args: { added: 10, failed: 2, cancelled: 2 },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText('Скасовано 2')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Скасувати решту' }));
    await expect(args.onCancelRest).toHaveBeenCalledOnce();
  },
};

/** Offline: a warning, not failures; the frames stay queued. */
export const Offline: Story = {
  args: { offline: true },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText(labels.offline)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Повторити зараз' }));
    await expect(args.onRetryNow).toHaveBeenCalledOnce();
  },
};

/** Files refused before upload: one line and a «Чому?» disclosure. */
export const Rejected: Story = {
  args: {
    added: 0,
    total: 4,
    bytesDone: 0,
    etaSeconds: undefined,
    rejected: '2 файли не підходять: формат .exe; понад 50 МБ',
    rejectedHelp:
      'Можна додати фото, відео та документи PDF, DOCX, XLSX, PPTX, TXT; фото до 50 МБ.',
  },
  play: async ({ canvas }) => {
    const why = canvas.getByText('Чому?');
    await expect(canvas.getByText(/Можна додати фото/)).not.toBeVisible();
    await userEvent.click(why);
    await expect(canvas.getByText(/Можна додати фото/)).toBeVisible();
  },
};

/** 320px: the follow-ups stack at full width, nothing scrolls sideways. */
export const Narrow: Story = {
  globals: { viewport: { value: 'small' } },
  args: { added: 10, failed: 2, offline: true },
  play: async ({ canvas, canvasElement }) => {
    const retry = canvas.getByRole('button', { name: 'Повторити невдалі' }).getBoundingClientRect();
    const cancel = canvas.getByRole('button', { name: 'Скасувати решту' }).getBoundingClientRect();
    await expect(cancel.top).toBeGreaterThanOrEqual(retry.bottom);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const DarkPartial: Story = {
  ...Partial,
  globals: { theme: 'dark' },
};
