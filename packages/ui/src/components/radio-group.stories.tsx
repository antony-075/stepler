import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { minTarget } from '../stories/target';

// Gallery visibility mode (PRODUCT §7). Each item is a full-row label at least 44px tall.
const meta = {
  title: 'Components/RadioGroup',
  component: RadioGroup,
  args: { defaultValue: 'shared', 'aria-label': 'What guests see' },
  render: (args) => (
    <RadioGroup {...args} className="w-80 max-w-full">
      <RadioGroupItem value="shared">Shared gallery: guests see earlier uploads</RadioGroupItem>
      <RadioGroupItem value="contribution">
        Contribution only: guests see just the upload form
      </RadioGroupItem>
    </RadioGroup>
  ),
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const SHARED = /^Shared gallery/;
const CONTRIBUTION = /^Contribution only/;

function checkedCount(radios: HTMLElement[]) {
  return radios.filter((radio) => radio.getAttribute('aria-checked') === 'true').length;
}

async function expectRowsAreTouchTargets(radios: HTMLElement[]) {
  for (const radio of radios) {
    const row = radio.closest('label');
    await expect(row).not.toBeNull();
    // 44px minimum touch target (rule 05).
    await expect(row?.getBoundingClientRect().height).toBeGreaterThanOrEqual(minTarget());
  }
}

export const Keyboard: Story = {
  play: async ({ canvas }) => {
    const radios = canvas.getAllByRole('radio');
    const shared = canvas.getByRole('radio', { name: SHARED });
    const contribution = canvas.getByRole('radio', { name: CONTRIBUTION });
    await expect(shared).toHaveAttribute('aria-checked', 'true');

    shared.focus();
    // Radix selects on focus while an arrow key is down, and moves focus on the next tick, so
    // hold the key until focus lands (as a real key press does).
    await userEvent.keyboard('{ArrowDown>}');
    await waitFor(() => expect(contribution).toHaveFocus());
    await userEvent.keyboard('{/ArrowDown}');
    await expect(contribution).toHaveAttribute('aria-checked', 'true');
    await expect(checkedCount(radios)).toBe(1);

    // The whole row is the target: clicking the text selects the item.
    await userEvent.click(canvas.getByText(SHARED));
    await expect(shared).toHaveAttribute('aria-checked', 'true');
    await expect(checkedCount(radios)).toBe(1);

    await expectRowsAreTouchTargets(radios);
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('radio', { name: SHARED })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expectRowsAreTouchTargets(canvas.getAllByRole('radio'));
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    const contribution = canvas.getByRole('radio', { name: CONTRIBUTION });
    await expect(contribution).toBeDisabled();
    await userEvent.click(canvas.getByText(CONTRIBUTION), { pointerEventsCheck: 0 });
    await expect(contribution).toHaveAttribute('aria-checked', 'false');
    await expectRowsAreTouchTargets(canvas.getAllByRole('radio'));
  },
};
