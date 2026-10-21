import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { Label } from './label';
import { PasswordInput } from './password-input';
import { minTarget } from '../stories/target';

const meta = {
  title: 'Components/PasswordInput',
  component: PasswordInput,
  args: {
    id: 'password',
    autoComplete: 'current-password',
    showLabel: 'Показати пароль',
    hideLabel: 'Сховати пароль',
  },
  render: (args) => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="password">Пароль</Label>
      <PasswordInput {...args} />
    </div>
  ),
} satisfies Meta<typeof PasswordInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Пароль');
    await userEvent.type(input, 'E2e-Pa55word!');
    await expect(input).toHaveAttribute('type', 'password');
    await expect(input.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
  },
};

/** The toggle shows the password, says what it does next and comes after the field in Tab order. */
export const Shown: Story = {
  args: { defaultValue: 'E2e-Pa55word!' },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Пароль');
    const toggle = canvas.getByRole('button', { name: 'Показати пароль' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    await expect(input).toHaveAttribute('type', 'text');
    const hide = canvas.getByRole('button', { name: 'Сховати пароль' });
    await expect(hide).toHaveAttribute('aria-pressed', 'true');
    await expect(hide.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
    input.focus();
    await userEvent.tab();
    await expect(hide).toHaveFocus();
  },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'short' },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Пароль')).toHaveAttribute('aria-invalid', 'true');
  },
};

/** A disabled field disables its toggle too. */
export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'E2e-Pa55word!' },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Пароль')).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Показати пароль' })).toBeDisabled();
  },
};
