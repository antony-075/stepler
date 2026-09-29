import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Components/Input',
  component: Input,
  args: { id: 'email', type: 'email', placeholder: 'name@example.com' },
  render: (args) => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="email">Email</Label>
      <Input {...args} />
    </div>
  ),
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Email');
    await userEvent.type(input, 'anton@example.com');
    await expect(input).toHaveValue('anton@example.com');
    // 44px minimum touch target (rule 05).
    await expect(input.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'not-an-email' },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Email')).toBeDisabled();
  },
};
