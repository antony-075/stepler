import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImagePlus } from 'lucide-react';
import { expect } from 'storybook/test';
import { samplePhoto } from '../stories/sample-photo';
import { Button } from './button';
import { UploadDock } from './upload-dock';

const mini = (
  <div className="flex items-center gap-2">
    {[30, 150, 210].map((hue) => (
      <img key={hue} alt="" src={samplePhoto(hue)} className="size-[34px] rounded-frame" />
    ))}
    <span className="ml-auto truncate type-data text-muted-foreground">Ваші кадри: 3 додано</span>
  </div>
);

const meta = {
  title: 'Components/UploadDock',
  component: UploadDock,
  args: {
    primary: (
      <Button variant="pencil" size="guest" className="w-full">
        <ImagePlus />
        Додати ще
      </Button>
    ),
    secondary: (
      <Button variant="ghost" size="lg" className="w-full">
        Написати побажання
      </Button>
    ),
    mini,
    note: 'Не закривайте сторінку, доки кадри завантажуються',
  },
  render: (args) => (
    <div className="min-h-[640px] bg-background">
      <p className="p-4 type-body">Ваші кадри…</p>
      <UploadDock {...args} />
    </div>
  ),
} satisfies Meta<typeof UploadDock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 320px phone: fixed to the bottom at full width, with the safe area and toast avoidance. */
export const Phone: Story = {
  globals: { viewport: { value: 'small' } },
  play: async ({ canvas, canvasElement }) => {
    const dock = canvasElement.querySelector<HTMLElement>('[data-slot="upload-dock"]')!;
    await expect(dock).toHaveAttribute('data-toast-avoid');
    const style = getComputedStyle(dock);
    await expect(style.position).toBe('fixed');
    await expect(Number.parseFloat(style.paddingBottom)).toBeGreaterThanOrEqual(12);
    const box = dock.getBoundingClientRect();
    await expect(box.width).toBe(window.innerWidth);
    await expect(Math.round(box.bottom)).toBe(window.innerHeight);
    const primary = canvas.getByRole('button', { name: 'Додати ще' });
    await expect(primary.getBoundingClientRect().height).toBe(56);
    await expect(canvas.getByText(/Не закривайте сторінку/)).toBeVisible();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** Before the first upload: no strip and no note, just the actions. */
export const Idle: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { mini: undefined, note: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Не закривайте/)).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Написати побажання' })).toBeVisible();
  },
};

/** Tablet: sticky at the bottom of the centred 560px column. */
export const Tablet: Story = {
  globals: { viewport: { value: 'tablet' } },
  play: async ({ canvasElement }) => {
    const dock = canvasElement.querySelector<HTMLElement>('[data-slot="upload-dock"]')!;
    await expect(getComputedStyle(dock).position).toBe('sticky');
    await expect(dock.getBoundingClientRect().width).toBeLessThanOrEqual(560);
  },
};

export const DarkPhone: Story = {
  ...Phone,
  globals: { viewport: { value: 'small' }, theme: 'dark' },
};
