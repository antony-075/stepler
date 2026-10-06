import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoreHorizontal } from 'lucide-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

/** A collapsed toolbar: its controls in a popover behind «⋯». */
function Toolbar() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Параметри перегляду">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-64 gap-2">
        <Button variant="outline">Телефон</Button>
        <Button variant="outline">Планшет</Button>
      </PopoverContent>
    </Popover>
  );
}

const meta = { title: 'Components/Popover', component: Toolbar } satisfies Meta<typeof Toolbar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OpenAndEscape: Story = {
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('button', { name: 'Параметри перегляду' });
    await userEvent.click(trigger);
    const body = within(canvasElement.ownerDocument.body);
    // The surface fades in; wait for the end of the enter animation.
    const phone = await body.findByRole('button', { name: 'Телефон' });
    await waitFor(() => expect(phone).toBeVisible());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('button', { name: 'Телефон' })).toBeNull());
    await expect(trigger).toHaveFocus();
  },
};
