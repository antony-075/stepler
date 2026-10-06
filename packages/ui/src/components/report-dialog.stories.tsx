import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import { ReportDialog, type ReportDialogProps } from './report-dialog';

const REASONS = [
  { value: 'ILLEGAL', label: 'Незаконний вміст' },
  { value: 'INAPPROPRIATE', label: 'Непристойний або образливий' },
  { value: 'PRIVACY', label: 'Порушує приватність' },
  { value: 'SPAM', label: 'Спам або реклама' },
  { value: 'OTHER', label: 'Інше' },
];

const COPY = {
  title: 'Поскаржитися',
  reasonsLegend: 'Що не так?',
  reasons: REASONS,
  reasonRequiredLabel: 'Оберіть, що не так',
  descriptionLabel: 'Опишіть, що не так',
  descriptionHint: 'Необов’язково',
  descriptionTooLongLabel: 'Не більше 1000 символів',
  emailLabel: 'Ваш e-mail',
  emailHint: 'Необов’язково — щоб повідомити вам рішення',
  emailInvalidLabel: 'Перевірте адресу',
  submitLabel: 'Надіслати скаргу',
  submittingLabel: 'Надсилаємо…',
  cancelLabel: 'Скасувати',
  sentTitle: 'Скаргу надіслано',
  sentText: 'Модерація Stepler розгляне її. Кадр поки залишається у галереї.',
  closeLabel: 'Закрити',
  counterLabel: (count: number, max: number) => `${count}/${max}`,
  maxDescription: 1000,
} satisfies Partial<ReportDialogProps>;

type DemoProps = Pick<ReportDialogProps, 'state' | 'error' | 'onSubmit'>;

function Demo({ state, error, onSubmit }: DemoProps) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Відкрити
      </Button>
      <ReportDialog
        {...COPY}
        open={open}
        onOpenChange={setOpen}
        state={state}
        error={error}
        onSubmit={onSubmit}
      />
    </>
  );
}

const meta = {
  title: 'Components/ReportDialog',
  component: Demo,
  args: { state: 'idle', error: null, onSubmit: fn() },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

const dialog = () => screen.findByRole('dialog', { name: 'Поскаржитися' });

/** A reason, a description and an address are sent as typed. */
export const Default: Story = {
  play: async ({ args }) => {
    const d = await dialog();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Незаконний вміст' })).toHaveFocus(),
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Порушує приватність' }));
    await userEvent.type(screen.getByLabelText(/Опишіть, що не так/), 'Це я на фото');
    await userEvent.type(screen.getByLabelText('Ваш e-mail'), 'olena@example.com');
    await expect(d).toHaveTextContent('12/1000');
    await userEvent.click(screen.getByRole('button', { name: 'Надіслати скаргу' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      reason: 'PRIVACY',
      description: 'Це я на фото',
      email: 'olena@example.com',
    });
  },
};

/** Sent without a reason: the message shows, focus goes to the reasons, nothing is sent. */
export const ValidationError: Story = {
  play: async ({ args }) => {
    await dialog();
    await userEvent.click(screen.getByRole('button', { name: 'Надіслати скаргу' }));
    await expect(await screen.findByRole('alert')).toHaveTextContent('Оберіть, що не так');
    await expect(screen.getByRole('radio', { name: 'Незаконний вміст' })).toHaveFocus();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** Over 1000 code points: the counter turns destructive and the form is not sent. */
export const DescriptionTooLong: Story = {
  play: async ({ args }) => {
    await dialog();
    await userEvent.click(screen.getByRole('radio', { name: 'Інше' }));
    const field = screen.getByLabelText(/Опишіть, що не так/);
    await userEvent.click(field);
    await userEvent.paste('я'.repeat(1001));
    const counter = document.querySelector('[data-slot="report-counter"]');
    await expect(counter).toHaveTextContent('1001/1000');
    await expect(counter).toHaveClass('text-destructive');
    await userEvent.click(screen.getByRole('button', { name: 'Надіслати скаргу' }));
    await expect(screen.getByText('Не більше 1000 символів')).toBeVisible();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const Submitting: Story = {
  args: { state: 'submitting' },
  play: async () => {
    await dialog();
    await expect(screen.getByRole('button', { name: 'Надсилаємо…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  },
};

export const Failed: Story = {
  args: { error: 'Не вдалося надіслати скаргу. Спробуйте ще.' },
  play: async () => {
    const d = await dialog();
    await expect(d).toHaveTextContent('Не вдалося надіслати скаргу. Спробуйте ще.');
  },
};

/** The confirmation replaces the form and takes focus. */
export const Sent: Story = {
  args: { state: 'sent' },
  play: async () => {
    const heading = await screen.findByRole('heading', { name: 'Скаргу надіслано' });
    await waitFor(() => expect(heading).toHaveFocus());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Закрити' })).toBeVisible());
    await expect(screen.queryByRole('radio')).toBeNull();
  },
};

/** A 360px phone: it fits with no sideways scroll, the submit is reachable. */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async () => {
    const d = await dialog();
    await expect(d.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await expect(screen.getByRole('button', { name: 'Надіслати скаргу' })).toBeInTheDocument();
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async () => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await dialog();
  },
};

export const SentDark: Story = {
  args: { state: 'sent' },
  globals: { theme: 'dark' },
  play: async () => {
    await screen.findByRole('heading', { name: 'Скаргу надіслано' });
  },
};
