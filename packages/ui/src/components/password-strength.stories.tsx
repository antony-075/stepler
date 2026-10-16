import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect } from 'storybook/test';
import { PasswordInput } from './password-input';
import { PasswordMatch, PasswordStrength, type StrengthRule } from './password-strength';

/** The app's rules (packages/contracts `passwordChecks`), mirrored for the stories. */
function rulesFor(password: string): StrengthRule[] {
  return [
    { id: 'length', label: 'Щонайменше 8 символів', met: Array.from(password).length >= 8 },
    { id: 'upper', label: 'Велика літера', met: /\p{Lu}/u.test(password) },
    { id: 'lower', label: 'Мала літера', met: /\p{Ll}/u.test(password) },
    { id: 'digit', label: 'Цифра', met: /\p{Nd}/u.test(password) },
    { id: 'special', label: 'Спецсимвол (!, ?, # …)', met: /[^\p{L}\p{N}\s]/u.test(password) },
  ];
}

const LEVELS = ['Надто простий', 'Слабкий', 'Слабкий', 'Середній', 'Майже', 'Надійний'];

function Demo({ initial = '', confirm = '' }: { initial?: string; confirm?: string }) {
  const [password, setPassword] = useState(initial);
  const [again, setAgain] = useState(confirm);
  const rules = rulesFor(password);
  const missing = rules.filter((rule) => !rule.met).map((rule) => rule.label.toLowerCase());
  const met = rules.length - missing.length;
  return (
    <div className="grid w-96 max-w-full gap-3">
      <label htmlFor="pw" className="text-sm font-medium">
        Пароль
      </label>
      <PasswordInput
        id="pw"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        showLabel="Показати пароль"
        hideLabel="Сховати пароль"
        aria-describedby="pw-strength"
      />
      <PasswordStrength
        id="pw-strength"
        rules={rules}
        label="Надійність пароля"
        levelText={password === '' ? 'Порожньо' : (LEVELS[met] ?? '')}
        summary={missing.length === 0 ? 'Пароль надійний' : `Ще потрібно: ${missing.join(', ')}`}
        metText="виконано"
        missingText="ще потрібно"
        pristine={password === ''}
      />
      <label htmlFor="pw2" className="text-sm font-medium">
        Підтвердіть пароль
      </label>
      <PasswordInput
        id="pw2"
        value={again}
        onChange={(event) => setAgain(event.target.value)}
        showLabel="Показати пароль"
        hideLabel="Сховати пароль"
      />
      <PasswordMatch
        matches={again === '' ? null : again === password}
        matchText="Паролі збігаються"
        mismatchText="Паролі не збігаються"
      />
    </div>
  );
}

const meta = { title: 'Components/PasswordStrength', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvas }) => {
    const meterEl = canvas.getByRole('meter', { name: 'Надійність пароля' });
    await expect(meterEl).toHaveAttribute('aria-valuenow', '0');
    // Before typing nothing is marked missing in red.
    await expect(canvas.queryByText('Паролі не збігаються')).toBeNull();
  },
};

export const Typing: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText('Пароль'), 'abc1');
    await expect(canvas.getByRole('meter')).toHaveAttribute('aria-valuenow', '2');
    await expect(
      canvas.getByText(/Ще потрібно: щонайменше 8 символів, велика літера/),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole('button', { name: 'Показати пароль' })[0]!);
    await expect(canvas.getByLabelText('Пароль')).toHaveAttribute('type', 'text');
  },
};

export const Strong: Story = {
  args: { initial: 'Pa55word!', confirm: 'Pa55word!' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('meter')).toHaveAttribute('aria-valuenow', '5');
    await expect(canvas.getByText('Паролі збігаються')).toBeInTheDocument();
  },
};

export const Mismatch: Story = {
  args: { initial: 'Pa55word!', confirm: 'Pa55word' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Паролі не збігаються')).toBeInTheDocument();
  },
};

export const StrongDark: Story = {
  ...Strong,
  globals: { theme: 'dark' },
};
