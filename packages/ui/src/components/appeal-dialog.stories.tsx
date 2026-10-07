import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';
import { AppealDialog, type AppealDialogProps } from './appeal-dialog';
import { Button } from './button';

const COPY = {
  title: 'Подати апеляцію',
  description:
    'Поясніть, чому рішення модерації Stepler помилкове. Відповідь з’явиться тут, у застосунку.',
  textLabel: 'Ваше пояснення',
  textHint: 'Модерація прочитає його разом із кадром.',
  textRequiredLabel: 'Напишіть пояснення',
  textTooLongLabel: 'Не більше 1000 символів',
  counterLabel: (count: number, max: number) => `${count}/${max}`,
  submitLabel: 'Надіслати апеляцію',
  submittingLabel: 'Надсилаємо…',
  cancelLabel: 'Скасувати',
  sentTitle: 'Апеляцію надіслано',
  sentText: 'Модерація Stepler розгляне її. Статус видно на цьому кадрі.',
  closeLabel: 'Закрити',
  maxText: 1000,
} satisfies Partial<AppealDialogProps>;

type DemoProps = Pick<AppealDialogProps, 'state' | 'error' | 'onSubmit'>;

function Demo({ state, error, onSubmit }: DemoProps) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Відкрити
      </Button>
      <AppealDialog
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
  title: 'Components/AppealDialog',
  component: Demo,
  args: { state: 'idle', error: null, onSubmit: fn() },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

const dialog = () => screen.findByRole('dialog', { name: 'Подати апеляцію' });
const field = () => screen.getByLabelText('Ваше пояснення');

/** The field takes focus; the text is sent trimmed. */
export const Default: Story = {
  play: async ({ args }) => {
    const d = await dialog();
    await waitFor(() => expect(field()).toHaveFocus());
    await userEvent.type(field(), '  Це моє фото з весілля  ');
    await expect(d).toHaveTextContent('21/1000');
    await userEvent.click(screen.getByRole('button', { name: 'Надіслати апеляцію' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ text: 'Це моє фото з весілля' });
  },
};

/** Sent empty: the message shows, focus stays on the field, nothing is sent. */
export const Required: Story = {
  play: async ({ args }) => {
    await dialog();
    await userEvent.click(screen.getByRole('button', { name: 'Надіслати апеляцію' }));
    await expect(await screen.findByRole('alert')).toHaveTextContent('Напишіть пояснення');
    await expect(field()).toHaveFocus();
    await expect(field()).toHaveAttribute('aria-invalid', 'true');
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** Over 1000 code points: the counter turns destructive and the form is not sent. */
export const TooLong: Story = {
  play: async ({ args }) => {
    await dialog();
    await userEvent.click(field());
    await userEvent.paste('я'.repeat(1001));
    const counter = document.querySelector('[data-slot="appeal-counter"]');
    await expect(counter).toHaveTextContent('1001/1000');
    await expect(counter).toHaveClass('text-destructive');
    await userEvent.click(screen.getByRole('button', { name: 'Надіслати апеляцію' }));
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
  args: { error: 'Не вдалося надіслати апеляцію. Спробуйте ще.' },
  play: async () => {
    const d = await dialog();
    await expect(d).toHaveTextContent('Не вдалося надіслати апеляцію. Спробуйте ще.');
  },
};

/** The confirmation replaces the form and takes focus. */
export const Sent: Story = {
  args: { state: 'sent' },
  play: async () => {
    const heading = await screen.findByRole('heading', { name: 'Апеляцію надіслано' });
    await waitFor(() => expect(heading).toHaveFocus());
    await expect(screen.queryByLabelText('Ваше пояснення')).toBeNull();
  },
};

/** A 360px phone: it fits with no sideways scroll, the submit is reachable. */
export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async () => {
    const d = await dialog();
    await expect(d.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await expect(screen.getByRole('button', { name: 'Надіслати апеляцію' })).toBeInTheDocument();
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
    await screen.findByRole('heading', { name: 'Апеляцію надіслано' });
  },
};
