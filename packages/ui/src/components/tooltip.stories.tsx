import type { Meta, StoryObj } from '@storybook/react-vite';
import { Layers } from 'lucide-react';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

function RailItem() {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Collections">
            <Layers aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Collections</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const meta = {
  title: 'Components/Tooltip',
  component: RailItem,
} satisfies Meta<typeof RailItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The collapsed sidebar's names: shown on keyboard focus too, never the only label. */
export const OnFocus: Story = {
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Collections' });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Collections'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  },
};

export const OnFocusDark: Story = {
  ...OnFocus,
  globals: { theme: 'dark' },
};
