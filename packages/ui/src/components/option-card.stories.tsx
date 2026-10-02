import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { OptionCard, OptionCardGroup } from './option-card';

function Preview({ tone }: { tone: string }) {
  return <span className={`block h-16 rounded-frame border ${tone}`} />;
}

function Themes() {
  return (
    <OptionCardGroup defaultValue="light" aria-label="Theme" className="w-[40rem] max-w-full">
      <OptionCard
        value="light"
        title="Light"
        description="Light and clean."
        preview={<Preview tone="bg-[#f0f1ee]" />}
      />
      <OptionCard
        value="dark"
        title="Dark"
        description="Easy on the eyes at night."
        preview={<Preview tone="bg-[#141615]" />}
      />
      <OptionCard
        value="system"
        title="System"
        description="Follows the device."
        preview={<Preview tone="bg-[linear-gradient(135deg,#f0f1ee_50%,#141615_50%)]" />}
      />
    </OptionCardGroup>
  );
}

const meta = {
  title: 'Components/OptionCard',
  component: Themes,
} satisfies Meta<typeof Themes>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One tab stop; arrows move the choice; the selected card has an edge and a check. */
export const Keyboard: Story = {
  play: async ({ canvas }) => {
    const light = canvas.getByRole('radio', { name: 'Light' });
    await expect(light).toHaveAttribute('aria-checked', 'true');
    await expect(light).toHaveAccessibleDescription('Light and clean.');
    await userEvent.tab();
    await expect(light).toHaveFocus();
    const dark = canvas.getByRole('radio', { name: 'Dark' });
    // Radix selects on focus while an arrow key is down and moves focus on the next tick, so
    // hold the key until focus lands (as a real key press does).
    await userEvent.keyboard('{ArrowRight>}');
    await waitFor(() => expect(dark).toHaveFocus());
    await userEvent.keyboard('{/ArrowRight}');
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await expect(dark.querySelector('[data-slot="option-card-check"]')).not.toBeNull();
    await expect(light.querySelector('[data-slot="option-card-check"]')).toBeNull();
  },
};

export const KeyboardDark: Story = {
  ...Keyboard,
  globals: { theme: 'dark' },
};

/** Phones: the cards stack, each the full width. */
export const Phone: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async ({ canvas }) => {
    const [first, second] = canvas.getAllByRole('radio');
    await expect(second!.getBoundingClientRect().top).toBeGreaterThan(
      first!.getBoundingClientRect().bottom - 1,
    );
  },
};
