import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { Label } from './label';
import { Textarea } from './textarea';

const meta = {
  title: 'Components/Textarea',
  component: Textarea,
  args: { id: 'note', placeholder: 'Write a few words for the hosts' },
  render: (args) => (
    <div className="grid w-80 max-w-full gap-2">
      <Label htmlFor="note">Note</Label>
      <Textarea {...args} />
    </div>
  ),
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const textarea = canvas.getByLabelText('Note');
    // 44px minimum touch target (rule 05).
    await expect(textarea.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    const initialHeight = textarea.clientHeight;
    await userEvent.type(
      textarea,
      'Thank you{Enter}for a wonderful{Enter}evening{Enter}and{Enter}night',
    );
    await expect(textarea).toHaveValue('Thank you\nfor a wonderful\nevening\nand\nnight');
    // field-sizing: content grows the field with its text.
    await expect(textarea.clientHeight).toBeGreaterThan(initialHeight);
  },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'x' },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'true');
  },
};

export const InvalidDark: Story = {
  ...Invalid,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'true');
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Note')).toBeDisabled();
  },
};
