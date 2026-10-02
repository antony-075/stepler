import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
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

/** Focus turns the edge violet and adds the 2px violet ring: never the pencil (reads as an error). */
export const Focused: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Email');
    await userEvent.click(input);
    const style = getComputedStyle(input);
    await expect(style.outlineStyle).toBe('solid');
    await expect(style.outlineColor).toBe('rgb(90, 74, 140)'); // --link
    // The edge colour transitions (120ms).
    await waitFor(() => expect(getComputedStyle(input).borderColor).toBe('rgb(90, 74, 140)'));
  },
};

export const FocusedDark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Email');
    await userEvent.click(input);
    await expect(getComputedStyle(input).outlineColor).toBe('rgb(182, 168, 232)'); // --link dark
  },
};

/** An invalid field keeps the destructive edge and ring when focused. */
export const InvalidFocused: Story = {
  args: { 'aria-invalid': true, defaultValue: 'not-an-email' },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Email');
    await userEvent.click(input);
    await expect(getComputedStyle(input).outlineColor).toBe('rgb(163, 32, 58)'); // --destructive
    await waitFor(() => expect(getComputedStyle(input).borderColor).toBe('rgb(163, 32, 58)'));
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  args: { defaultValue: 'anton@example.com' },
};

export const DisabledDark: Story = {
  globals: { theme: 'dark' },
  args: { disabled: true, defaultValue: 'anton@example.com' },
};
