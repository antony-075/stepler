import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, type screen, userEvent, waitFor } from 'storybook/test';
import { Badge } from './badge';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { CopyField } from './copy-field';
import { Label } from './label';
import { LinkCard, LinkCardDangerAction, LinkCardSection } from './link-card';
import { RotatingQr } from './qr-frame';
import { Switch } from './switch';

/** A 70-character guest link, as long as a real one (Review Focus 5). */
const URL_70 = `https://stepler.app/g/${'k7XaQ2pL9vR4mN8sT1wY6zB3cD5fG0hJ'.repeat(2)}`.slice(0, 70);

/** A stand-in QR (the real one is drawn in apps/web): three finder squares and a fixed fill. */
function SampleQr({
  seed = 1,
  label = 'QR code for the main link',
}: {
  seed?: number;
  label?: string;
}) {
  const cells: string[] = [];
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      const finder = ((x < 7 || x > 13) && y < 7) || (x < 7 && y > 13);
      if (!finder && (x * 7 + y * 13 + seed * 5) % 3 === 0) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  const finders: [number, number][] = [
    [0, 0],
    [14, 0],
    [0, 14],
  ];
  const d = finders
    .map(([x, y]) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`)
    .join('');
  return (
    <svg role="img" aria-label={label} viewBox="-4 -4 29 29" shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={29} height={29} fill="#FFFFFF" />
      <path fill="#141614" fillRule="evenodd" d={d + cells.join('')} />
    </svg>
  );
}

function Card({
  paused = false,
  qr = true,
  unsaved = false,
  defaultOpen = false,
}: {
  paused?: boolean;
  qr?: boolean;
  unsaved?: boolean;
  defaultOpen?: boolean;
}) {
  return (
    <LinkCard
      title="Main link"
      status={paused ? 'paused' : 'active'}
      statusLabel={paused ? 'Paused' : 'Active'}
      notice={unsaved ? <Badge variant="warning">Not saved</Badge> : undefined}
      meta="Every guest gets this one: on invitations, tables and in messages."
      summary="Guests can add photos, videos, documents and wishes and see only their own"
      qr={qr ? <SampleQr /> : null}
      share={
        <CopyField
          label="Link"
          hideLabel
          value={URL_70}
          copyLabel="Copy"
          copiedLabel="Copied"
          failedLabel="Could not copy. The link is selected: copy it with your keyboard."
        />
      }
      actions={
        <Button variant="outline" size="lg">
          Download QR
        </Button>
      }
      toggleLabel="Manage"
      toggleName="Manage «Main link»"
      defaultOpen={defaultOpen}
    >
      <LinkCardSection title="What guests can do" description="Changes apply after you save.">
        <div className="grid gap-1">
          {['Photos', 'Videos', 'Documents', 'Wishes'].map((name) => (
            <Label key={name} className="min-h-11 gap-3 text-base font-normal">
              <Checkbox defaultChecked />
              {name}
            </Label>
          ))}
        </div>
      </LinkCardSection>
      <LinkCardSection title="Status" description="Pause the link to stop guests opening it.">
        <Label className="min-h-11 gap-3 text-base font-normal">
          <Switch defaultChecked={!paused} />
          The link works
        </Label>
      </LinkCardSection>
      <LinkCardSection tone="danger" title="Danger zone" description="These can’t be undone.">
        <LinkCardDangerAction
          id="replace"
          title="Replace link"
          description="The old link and every printed QR stop working at once."
        >
          <Button variant="destructive" aria-describedby="replace-hint">
            Replace link
          </Button>
        </LinkCardDangerAction>
        <LinkCardDangerAction
          id="delete"
          title="Delete link"
          description="Stops working for good and disappears from the list."
        >
          <Button variant="destructive" aria-describedby="delete-hint">
            Delete link
          </Button>
        </LinkCardDangerAction>
      </LinkCardSection>
    </LinkCard>
  );
}

const meta = {
  title: 'Components/LinkCard',
  component: Card,
  decorators: [
    (Story) => (
      <div className="w-6xl max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

const box = (element: Element) => element.getBoundingClientRect();
const toggle = (canvas: { getByRole: typeof screen.getByRole }) =>
  canvas.getByRole('button', { name: 'Manage «Main link»' });

/** Closed by default: the header shares the link; the parts are hidden until «Manage». */
export const Closed: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Main link' })).toBeVisible();
    await expect(canvas.getByRole('region', { name: 'Main link' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Link' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Copy' })).toBeVisible();
    await expect(toggle(canvas)).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('heading', { name: 'What guests can do' })).toBeNull();
  },
};

/** A real button: Enter opens it, its `aria-controls` names the parts, and it closes again. */
export const OpenWithKeyboard: Story = {
  play: async ({ canvas, canvasElement }) => {
    const button = toggle(canvas);
    button.focus();
    await userEvent.keyboard('{Enter}');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const content = canvasElement.querySelector(
      `#${CSS.escape(button.getAttribute('aria-controls') ?? '')}`,
    );
    // The parts fade in (base duration).
    await waitFor(() => expect(content).toBeVisible());
    for (const part of ['What guests can do', 'Status', 'Danger zone']) {
      await expect(canvas.getByRole('heading', { level: 3, name: part })).toBeVisible();
    }
    await userEvent.keyboard(' ');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(content).not.toBeVisible();
  },
};

/** Closing keeps the parts mounted, so what was ticked survives a close and reopen. */
export const KeepsStateWhenClosed: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(toggle(canvas));
    const photos = canvas.getByRole('checkbox', { name: 'Photos' });
    await userEvent.click(photos);
    await expect(photos).not.toBeChecked();
    await userEvent.click(toggle(canvas));
    await userEvent.click(toggle(canvas));
    await expect(canvas.getByRole('checkbox', { name: 'Photos' })).not.toBeChecked();
  },
};

export const Open: Story = { args: { defaultOpen: true, unsaved: true } };

export const Paused: Story = { args: { paused: true } };

/** No URL to show: an empty frame instead of a QR. */
export const Hidden: Story = {
  args: { qr: false },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('img')).toBeNull();
    await expect(canvasElement.querySelector('[data-slot=qr-frame]')).toHaveClass('border-dashed');
  },
};

/** 320px: a 64px QR beside the name, the link and buttons under it, nothing wider than the screen. */
export const Phone: Story = {
  args: { defaultOpen: true },
  globals: { viewport: { value: 'small' } },
  play: async ({ canvas, canvasElement }) => {
    const frame = canvasElement.querySelector('[data-slot=qr-frame]');
    if (!frame) throw new Error('QR frame missing');
    await expect(box(frame).width).toBe(64);
    const input = canvas.getByRole('textbox', { name: 'Link' });
    await expect(box(input).top).toBeGreaterThan(box(frame).bottom);
    // Stacked parts: a part's heading is above its controls.
    const heading = canvas.getByRole('heading', { name: 'Status' });
    const control = canvas.getByRole('switch');
    await expect(box(heading).bottom).toBeLessThanOrEqual(box(control).top);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** Wide: a 112px QR, the link beside it, Manage on the right; parts with headings on the left. */
export const Laptop: Story = {
  args: { defaultOpen: true },
  globals: { viewport: { value: 'laptop' } },
  play: async ({ canvas, canvasElement }) => {
    const frame = canvasElement.querySelector('[data-slot=qr-frame]');
    if (!frame) throw new Error('QR frame missing');
    const input = canvas.getByRole('textbox', { name: 'Link' });
    await expect(box(frame).width).toBe(112);
    await expect(box(frame).right).toBeLessThan(box(input).left);
    await expect(box(toggle(canvas)).left).toBeGreaterThan(box(input).right);
    const heading = canvas.getByRole('heading', { name: 'Status' });
    await expect(box(heading).right).toBeLessThan(box(canvas.getByRole('switch')).left);
    // A danger row: its text on the left, its button on the right.
    const text = canvasElement.querySelector('#delete');
    if (!text) throw new Error('danger row missing');
    const button = canvas.getByRole('button', { name: 'Delete link' });
    await expect(box(button).left).toBeGreaterThan(box(text).right);
    await expect(button).toHaveAccessibleDescription(
      'Stops working for good and disappears from the list.',
    );
  },
};

export const Dark: Story = {
  args: { paused: true, defaultOpen: true, unsaved: true },
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    const frame = canvasElement.querySelector('[data-slot=qr-frame]');
    if (!frame) throw new Error('QR frame missing');
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

/** Replacing the link crosses the old code out, then crossfades to the new one (§8). */
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
