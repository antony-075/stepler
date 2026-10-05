import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './resizable';

/** A settings panel beside a preview, as in the guest page editor: the split is draggable. */
function Split() {
  return (
    <div className="h-80 w-full max-w-4xl overflow-hidden rounded-sheet border bg-card">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel id="settings" defaultSize="320px" minSize="240px" maxSize="480px">
          <div className="grid h-full place-items-center p-4 text-sm font-semibold">
            Налаштування
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle aria-label="Ширина панелі налаштувань" />
        <ResizablePanel id="preview" minSize="240px">
          <div className="grid h-full place-items-center bg-muted p-4 text-sm font-semibold">
            Попередній перегляд
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/** Two cards with the page between them; the gap is the handle. */
function Gap() {
  return (
    <div className="h-80 w-full max-w-4xl bg-background p-2">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel id="settings" defaultSize="320px" minSize="240px" maxSize="480px">
          <div className="grid h-full place-items-center rounded-sheet border bg-card p-4 text-sm font-semibold">
            Налаштування
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle gap aria-label="Ширина панелі налаштувань" />
        <ResizablePanel id="preview" minSize="240px">
          <div className="grid h-full place-items-center rounded-sheet border bg-muted p-4 text-sm font-semibold">
            Попередній перегляд
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

const meta = {
  title: 'Components/Resizable',
  component: Split,
} satisfies Meta<typeof Split>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithGap: Story = {
  render: () => <Gap />,
  play: async ({ canvas }) => {
    const handle = canvas.getByRole('separator', { name: 'Ширина панелі налаштувань' });
    await expect(getComputedStyle(handle).cursor).toBe('col-resize');
    await expect(handle.getBoundingClientRect().width).toBe(14);
  },
};

export const Keyboard: Story = {
  play: async ({ canvas }) => {
    const handle = canvas.getByRole('separator', { name: 'Ширина панелі налаштувань' });
    const before = Number(handle.getAttribute('aria-valuenow'));
    handle.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  },
};
