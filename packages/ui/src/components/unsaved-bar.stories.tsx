import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Label } from './label';
import { UnsavedBar } from './unsaved-bar';

function Demo() {
  const [photos, setPhotos] = useState(true);
  const dirty = !photos;
  return (
    <form className="grid w-xl max-w-full gap-5" onSubmit={(event) => event.preventDefault()}>
      <Label className="min-h-11 gap-3 text-base font-normal">
        <Checkbox checked={photos} onCheckedChange={(checked) => setPhotos(checked === true)} />
        Photos
      </Label>
      <UnsavedBar open={dirty} message="You have unsaved changes. Guests don’t see them yet.">
        <Button type="button" variant="ghost" onClick={() => setPhotos(true)}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </UnsavedBar>
    </form>
  );
}

const meta = {
  title: 'Components/UnsavedBar',
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing changed: no bar and no buttons, but the live region is already there. */
export const Clean: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement();
    await expect(canvas.queryByRole('button', { name: 'Save' })).toBeNull();
  },
};

/** A change brings the bar in and is announced; Cancel takes it away. */
export const Dirty: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Photos' }));
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'You have unsaved changes. Guests don’t see them yet.',
    );
    // It fades in (base duration).
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Save' })).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement();
  },
};

export const DirtyDark: Story = { ...Dirty, globals: { theme: 'dark' } };

/** 320px: the message above, Save above Cancel, each the full width. */
export const Phone: Story = {
  ...Dirty,
  globals: { viewport: { value: 'small' } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Photos' }));
    const save = canvas.getByRole('button', { name: 'Save' }).getBoundingClientRect();
    const cancel = canvas.getByRole('button', { name: 'Cancel' }).getBoundingClientRect();
    await expect(save.bottom).toBeLessThanOrEqual(cancel.top);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
