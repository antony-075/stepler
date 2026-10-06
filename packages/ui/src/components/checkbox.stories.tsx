import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { Checkbox } from './checkbox';
import { Label } from './label';
import { minTarget } from '../stories/target';

/**
 * The box itself is 20px. Wrap it in a `Label` row of at least 44px (`min-h-11`) so the whole
 * row, not just the box, is the touch target (rule 05).
 */
const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  render: (args) => (
    <Label data-testid="row" className="min-h-11 gap-3 text-base">
      <Checkbox {...args} />
      Allow downloads
    </Label>
  ),
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Toggle: Story = {
  play: async ({ canvas }) => {
    const checkbox = canvas.getByRole('checkbox', { name: 'Allow downloads' });
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');

    checkbox.focus();
    await userEvent.keyboard(' ');
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(canvas.getByText('Allow downloads'));
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await expect(canvas.getByTestId('row').getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44,
    );
  },
};

export const CheckedDark: Story = {
  args: { defaultChecked: true },
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('checkbox', { name: 'Allow downloads' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(canvas.getByTestId('row').getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44,
    );
  },
};

/** A colour token as `getComputedStyle` reports it (`rgb(r, g, b)`). */
function tokenColor(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    const checkbox = canvas.getByRole('checkbox', { name: 'Allow downloads' });
    await expect(checkbox).toBeDisabled();
    await userEvent.click(canvas.getByText('Allow downloads'), { pointerEventsCheck: 0 });
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    const row = canvas.getByTestId('row');
    await expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
    // The label dims with its control.
    await expect(getComputedStyle(row).cursor).toBe('not-allowed');
    await expect(getComputedStyle(row).color).toBe(tokenColor('--muted-foreground'));
  },
};
