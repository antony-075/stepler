import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { Field } from './field';
import { Input } from './input';
import { minTarget } from '../stories/target';

const meta = {
  title: 'Components/Field',
  component: Field,
  args: {
    id: 'collection-name',
    label: 'Collection name',
    children: (control) => <Input {...control} defaultValue="Olena & Andrii" />,
  },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Collection name');
    await userEvent.type(input, ' wedding');
    await expect(input).toHaveValue('Olena & Andrii wedding');
    await expect(input).not.toHaveAttribute('aria-describedby');
    await expect(input).not.toHaveAttribute('aria-invalid');
    // 44px minimum touch target (rule 05).
    await expect(input.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
  },
};

export const WithHint: Story = {
  args: { hint: 'Guests see this name when they open the link.' },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Collection name');
    // The hint is a description of the control, and the tip's button is not part of its name.
    await expect(input).toHaveAccessibleDescription(
      'Guests see this name when they open the link.',
    );
    await expect(
      canvas.getByRole('button', { name: 'Guests see this name when they open the link.' }),
    ).toBeVisible();
  },
};

export const WithDescription: Story = {
  args: { description: 'Guests see this name when they open the link.' },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Collection name');
    await expect(input).toHaveAttribute('aria-describedby', 'collection-name-description');
    await expect(input).toHaveAccessibleDescription(
      'Guests see this name when they open the link.',
    );
  },
};

export const WithError: Story = {
  args: {
    description: 'Guests see this name when they open the link.',
    error: 'Enter a name of 80 characters or fewer.',
  },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Collection name');
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    await expect(describedBy).toContain('collection-name-description');
    await expect(describedBy).toContain('collection-name-error');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Enter a name of 80 characters or fewer.',
    );
    await expect(canvas.getByRole('alert')).toHaveAttribute('id', 'collection-name-error');
    await expect(input.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
  },
};

export const WithErrorDark: Story = {
  ...WithError,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('alert')).toBeVisible();
    await expect(canvas.getByLabelText('Collection name')).toHaveAttribute('aria-invalid', 'true');
  },
};
