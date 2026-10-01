import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { Separator } from './separator';

const meta = {
  title: 'Components/Card',
  component: Card,
  decorators: [
    (Story) => (
      <div className="w-md max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Anna and Taras, wedding</CardTitle>
        <CardDescription>Created on 12 September</CardDescription>
      </CardHeader>
      <CardContent>
        <p>128 photos, 6 videos and 14 notes from 37 guests.</p>
      </CardContent>
      <CardFooter>
        <Button>Open collection</Button>
      </CardFooter>
    </Card>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Anna and Taras, wedding' }),
    ).toBeVisible();
    await expect(canvasElement.querySelector('[data-slot="card"]')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Open collection' })).toBeVisible();
  },
};

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('heading', { level: 2 })).toBeVisible();
  },
};

/** `CardContent` alone is the single-step card used by sign-in and verify. */
export const ContentOnly: Story = {
  render: () => (
    <Card>
      <CardContent>
        <p>Check your inbox: we sent a sign-in link.</p>
      </CardContent>
    </Card>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Check your inbox: we sent a sign-in link.')).toBeVisible();
  },
};

export const TitleAsChild: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h3>Guest link</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p>Anyone with this link can upload.</p>
      </CardContent>
    </Card>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 3, name: 'Guest link' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { level: 2 })).toBeNull();
  },
};

/**
 * Only a following card section trims the bottom padding: content before a Separator keeps it,
 * and a footer after content still gets its top spacing.
 */
export const SeparatedContent: Story = {
  render: () => (
    <Card>
      <CardContent>
        <p>Guests can see earlier uploads.</p>
      </CardContent>
      <Separator />
      <CardContent>
        <p>Uploads are open until 20 September.</p>
      </CardContent>
      <CardFooter>
        <Button>Save</Button>
      </CardFooter>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const contents = Array.from(
      canvasElement.querySelectorAll<HTMLElement>('[data-slot="card-content"]'),
    );
    const footers = Array.from(
      canvasElement.querySelectorAll<HTMLElement>('[data-slot="card-footer"]'),
    );
    await expect(contents).toHaveLength(2);
    await expect(footers).toHaveLength(1);
    const [first, second] = contents as [HTMLElement, HTMLElement];
    await expect(getComputedStyle(first).paddingBottom).not.toBe('0px');
    await expect(getComputedStyle(second).paddingBottom).toBe('0px');
    await expect(getComputedStyle(footers[0]!).paddingTop).toBe('20px');
  },
};

const LONG_TITLE = 'a'.repeat(40) + '@' + 'example-collection.com';

/** Review Focus 5: a long unbroken title or email must not scroll the page at 360px. */
export const LongText: Story = {
  globals: { viewport: { value: 'phone' } },
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>{LONG_TITLE}</CardTitle>
        <CardDescription>{LONG_TITLE}</CardDescription>
      </CardHeader>
      <CardContent>
        <p>{LONG_TITLE}</p>
      </CardContent>
    </Card>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(window.innerWidth).toBe(360);
    await expect(LONG_TITLE.length).toBeGreaterThanOrEqual(60);
    await expect(canvas.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
