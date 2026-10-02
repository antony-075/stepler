import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, Pause, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Alert } from './alert';
import { Button } from './button';
import { CopyField } from './copy-field';
import { LinkPanel, RotatingQr } from './link-panel';

/** A 70-character guest link, as long as a real one (Review Focus 5). */
const URL_70 = `https://stepler.app/g/${'k7XaQ2pL9vR4mN8sT1wY6zB3cD5fG0hJ'.repeat(2)}`.slice(0, 70);

/**
 * A stand-in QR (the real one is drawn in apps/web from the link): a 21-module pattern with the
 * three finder squares, so stories look like the product without the encoder.
 */
function SampleQr({
  seed = 1,
  label = 'QR code for the guest link',
}: {
  seed?: number;
  label?: string;
}) {
  const cells: string[] = [];
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      const finder = (x < 7 || x > 13) && y < 7 ? true : x < 7 && y > 13;
      if (finder) continue;
      if ((x * 7 + y * 13 + seed * 5) % 3 === 0) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  const finders: [number, number][] = [
    [0, 0],
    [14, 0],
    [0, 14],
  ];
  return (
    <svg role="img" aria-label={label} viewBox="-4 -4 29 29" shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={29} height={29} fill="#FFFFFF" />
      <path
        fill="#141614"
        fillRule="evenodd"
        d={
          finders
            .map(
              ([x, y]) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`,
            )
            .join('') + cells.join('')
        }
      />
    </svg>
  );
}

function Actions() {
  return (
    <>
      <Button variant="outline">
        <Download aria-hidden="true" />
        Download QR
      </Button>
      <Button variant="outline">Change access</Button>
      <Button variant="outline">
        <Pause aria-hidden="true" />
        Pause
      </Button>
      <Button variant="outline">
        <RefreshCw aria-hidden="true" />
        Replace link
      </Button>
    </>
  );
}

const meta = {
  title: 'Components/LinkPanel',
  component: LinkPanel,
  args: {
    title: 'Guest link',
    status: 'active',
    statusLabel: 'Active',
    qr: <SampleQr />,
    copyField: (
      <CopyField
        label="Link"
        value={URL_70}
        copyLabel="Copy"
        copiedLabel="Copied"
        failedLabel="Could not copy. The link is selected: copy it with your keyboard."
      />
    ),
    permissionsSummary: 'Guests can add photos and videos, write wishes and see only their own.',
    actions: <Actions />,
  },
  decorators: [
    (Story) => (
      <div className="w-3xl max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinkPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function box(element: Element) {
  return element.getBoundingClientRect();
}

export const Active: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Guest link' })).toBeVisible();
    await expect(canvas.getByText('Active')).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'QR code for the guest link' })).toBeVisible();
  },
};

/** A paused link says so above the details, with its own action. */
export const Paused: Story = {
  args: {
    status: 'paused',
    statusLabel: 'Paused',
    notice: (
      <Alert variant="warning" action={<Button variant="outline">Resume</Button>}>
        The link is paused: guests can’t open it.
      </Alert>
    ),
  },
};

/** No URL to show (the token can no longer be decrypted): an empty frame and the way out. */
export const Hidden: Story = {
  args: {
    qr: null,
    copyField: null,
    notice: <Alert variant="info">The link is hidden. Replace it to see it again.</Alert>,
    actions: <Button variant="outline">Replace link</Button>,
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('img')).toBeNull();
    await expect(canvasElement.querySelector('[data-slot=qr-frame]')).toHaveClass('border-dashed');
  },
};

/** 320px: the QR stays ≥ 180px, buttons are full width, the long URL never widens the page. */
export const Phone: Story = {
  globals: { viewport: { value: 'small' } },
  play: async ({ canvas, canvasElement }) => {
    await expect(window.innerWidth).toBe(320);
    const frame = canvasElement.querySelector('[data-slot=qr-frame]');
    if (!frame) throw new Error('QR frame missing');
    await expect(box(frame).width).toBeGreaterThanOrEqual(180);
    const panel = canvasElement.querySelector('[data-slot=link-panel]');
    if (!panel) throw new Error('panel missing');
    // Centred in the panel.
    const left = box(frame).left - box(panel).left;
    const right = box(panel).right - box(frame).right;
    await expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    const pause = canvas.getByRole('button', { name: 'Pause' });
    const details = canvasElement.querySelector('[data-slot=link-panel-details]');
    if (!details) throw new Error('details missing');
    await expect(box(pause).width).toBe(box(details).width);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** 360px: still one column, 180px QR (200px starts at a 375px screen). */
export const Phone360: Story = {
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector('[data-slot=qr-frame]');
    if (!frame) throw new Error('QR frame missing');
    await expect(box(frame).width).toBe(180);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** A wide panel: a 160px QR on the left, the link and actions on its right. */
export const Laptop: Story = {
  globals: { viewport: { value: 'laptop' } },
  play: async ({ canvas, canvasElement }) => {
    const frame = canvasElement.querySelector('[data-slot=qr-frame]');
    if (!frame) throw new Error('QR frame missing');
    const input = canvas.getByRole('textbox', { name: 'Link' });
    await expect(box(frame).width).toBe(160);
    await expect(box(frame).left).toBeLessThan(box(input).left);
    // Same row: the URL starts beside the QR, not under it.
    await expect(box(input).top).toBeLessThan(box(frame).bottom);
    const pause = canvas.getByRole('button', { name: 'Pause' });
    await expect(box(pause).width).toBeLessThan(box(input).width);
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  args: {
    status: 'paused',
    statusLabel: 'Paused',
    notice: <Alert variant="warning">The link is paused: guests can’t open it.</Alert>,
  },
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    const frame = canvasElement.querySelector('[data-slot=qr-frame]');
    if (!frame) throw new Error('QR frame missing');
    // The QR stays a light island in dark mode.
    await expect(getComputedStyle(frame).backgroundColor).toBe('rgb(255, 255, 255)');
  },
};

function RotationDemo() {
  const [seed, setSeed] = useState(1);
  return (
    <div className="grid justify-items-start gap-4">
      <div className="size-[200px] rounded-frame border bg-[#FFFFFF] p-2">
        <RotatingQr rotationKey={String(seed)}>
          <SampleQr seed={seed} label={`QR code ${seed}`} />
        </RotatingQr>
      </div>
      <Button variant="outline" onClick={() => setSeed((value) => value + 1)}>
        Replace link
      </Button>
    </div>
  );
}

/** Replacing the link crosses the old code out, then crossfades to the new one. */
export const Rotation: StoryObj = {
  render: () => <RotationDemo />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Replace link' }));
    const root = canvasElement.querySelector('[data-slot=rotating-qr]');
    await expect(root).toHaveAttribute('data-phase', 'cross');
    await expect(canvasElement.querySelector('[data-slot=rotating-qr-leaving]')).not.toBeNull();
    await waitFor(() => expect(root).toHaveAttribute('data-phase', 'idle'), { timeout: 2000 });
    await expect(canvasElement.querySelector('[data-slot=rotating-qr-leaving]')).toBeNull();
    await expect(canvas.getByRole('img', { name: 'QR code 2' })).toBeVisible();
  },
};
