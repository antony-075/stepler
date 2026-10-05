import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { InfoTip } from './info-tip';

/** A label with its hint, as the guest page editor's «Текст привітання». */
function Label() {
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold">
      Текст привітання
      <InfoTip text="Гості побачать його під назвою колекції." />
    </p>
  );
}

const meta = {
  title: 'Components/InfoTip',
  component: Label,
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TapAndKeyboard: Story = {
  play: async ({ canvas, canvasElement }) => {
    const button = canvas.getByRole('button', { name: 'Гості побачать його під назвою колекції.' });
    await userEvent.click(button);
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole('tooltip')).toHaveTextContent('Гості побачать');
    await userEvent.keyboard('{Escape}');
    // It fades out first.
    await waitFor(() => expect(body.queryByRole('tooltip')).toBeNull());
  },
};
