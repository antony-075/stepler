import type { Meta, StoryObj } from '@storybook/react-vite';
import { Ellipsis } from 'lucide-react';
import { expect } from 'storybook/test';
import { Button } from './button';
import { LinkRow } from './link-row';

/** A stand-in 48px QR: three finder squares (the real code is drawn in apps/web). */
function TinyQr({ label }: { label: string }) {
  return (
    <svg role="img" aria-label={label} viewBox="-1 -1 23 23" shapeRendering="crispEdges">
      <rect x={-1} y={-1} width={23} height={23} fill="#FFFFFF" />
      <path
        fill="#141614"
        fillRule="evenodd"
        d="M0 0h7v7h-7zM1 1v5h5v-5zM2 2h3v3h-3zM14 0h7v7h-7zM15 1v5h5v-5zM16 2h3v3h-3zM0 14h7v7h-7zM1 15v5h5v-5zM2 16h3v3h-3zM9 9h3v3h-3zM14 14h3v3h-3z"
      />
    </svg>
  );
}

function Menu({ label }: { label: string }) {
  return (
    <Button variant="ghost" size="icon" aria-label={`Actions for ${label}`}>
      <Ellipsis aria-hidden="true" />
    </Button>
  );
}

const meta = {
  title: 'Components/LinkRow',
  component: LinkRow,
  args: {
    label: 'Photographer',
    permissionsSummary: 'Adds photos, videos and documents',
    status: 'active',
    statusLabel: 'Active',
    date: '01.10',
    qr: <TinyQr label="QR code for “Photographer”" />,
    menu: <Menu label="Photographer" />,
  },
  decorators: [
    (Story) => (
      <div className="w-3xl max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinkRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const Paused: Story = {
  args: {
    label: 'After the event',
    permissionsSummary: 'View only',
    status: 'paused',
    statusLabel: 'Paused',
    menu: <Menu label="After the event" />,
  },
};

/** A revoked link stays as a record: struck through, no QR, no actions. */
export const Revoked: Story = {
  args: { label: 'Old link', status: 'revoked', statusLabel: 'Revoked 2 Oct' },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('button')).toBeNull();
    await expect(canvas.queryByRole('img')).toBeNull();
    const label = canvas.getByText('Old link');
    await expect(getComputedStyle(label).textDecorationLine).toBe('line-through');
    await expect(canvasElement).toHaveTextContent('Revoked 2 Oct');
  },
};

/** 60 unspaced characters at 360px wrap inside the row (Review Focus 5). */
export const LongLabel: Story = {
  globals: { viewport: { value: 'phone' } },
  args: { label: 'Ф'.repeat(60), menu: <Menu label="long" /> },
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(360);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** From a 36rem list: one row, the status and date in their own columns. */
export const Wide: Story = {
  globals: { viewport: { value: 'laptop' } },
  play: async ({ canvas }) => {
    const label = canvas.getByText('Photographer').getBoundingClientRect();
    const date = canvas.getByText('01.10').getBoundingClientRect();
    await expect(
      Math.abs(label.top + label.height / 2 - (date.top + date.height / 2)),
    ).toBeLessThan(4);
  },
};

/** Several rows as the Access page lists them. */
export const List: Story = {
  render: (args) => (
    <ul className="divide-y rounded-sheet border bg-card px-4">
      <li>
        <LinkRow {...args} />
      </li>
      <li>
        <LinkRow
          {...args}
          label="After the event"
          permissionsSummary="View only"
          status="paused"
          statusLabel="Paused"
          date="02.10"
          qr={<TinyQr label="QR code for “After the event”" />}
          menu={<Menu label="After the event" />}
        />
      </li>
      <li>
        <LinkRow {...args} label="Old link" status="revoked" statusLabel="Revoked 28 Sep" />
      </li>
    </ul>
  ),
};

export const Dark: Story = {
  ...List,
  globals: { theme: 'dark' },
  play: async () => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
  },
};
