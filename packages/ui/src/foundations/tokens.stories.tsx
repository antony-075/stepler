import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSyncExternalStore } from 'react';
import { expect, within } from 'storybook/test';

/** The v4 token table in docs/ux/README.md ("Visual direction v4"). */
const TOKENS = [
  { name: '--background', role: 'page' },
  { name: '--card', role: 'cards, tiles' },
  { name: '--foreground', role: 'text' },
  { name: '--muted', role: 'fills' },
  { name: '--muted-foreground', role: 'secondary text' },
  { name: '--border', role: 'hairlines' },
  { name: '--input', role: 'field edges' },
  { name: '--primary', role: 'actions, links, focus' },
  { name: '--primary-hover', role: 'primary on hover' },
  { name: '--primary-foreground', role: 'text on primary' },
  { name: '--accent-warm', role: 'decoration only (note, mark, QR dot, light)' },
  { name: '--success', role: 'success' },
  { name: '--destructive', role: 'destructive' },
] as const;

/** Re-renders whenever <html data-theme> changes (the toolbar toggle or a story's globals). */
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function useThemeAttribute() {
  return useSyncExternalStore(subscribeToTheme, () => document.documentElement.dataset.theme);
}

/** Swatches with the live computed values, so both themes can be compared from the toolbar. */
function TokenTable() {
  // Subscribing re-reads the values below after every theme change.
  useThemeAttribute();
  const style = getComputedStyle(document.documentElement);

  return (
    <ul className="grid gap-3 p-4 text-foreground sm:grid-cols-2 lg:grid-cols-3">
      {TOKENS.map(({ name, role }) => (
        <li key={name} className="flex min-w-0 items-center gap-3 rounded-lg bg-card p-3">
          <span
            aria-hidden="true"
            className="size-11 shrink-0 rounded-md border border-border"
            style={{ background: `var(${name})` }}
          />
          <span className="min-w-0">
            <code className="block font-mono text-sm break-all">{name}</code>
            <span className="block font-mono text-xs text-muted-foreground">
              {style.getPropertyValue(name).trim()}
            </span>
            <span className="block text-xs text-muted-foreground">{role}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function backgroundRow(canvasElement: HTMLElement) {
  const row = within(canvasElement).getByText('--background', { selector: 'code' }).closest('li');
  if (!row) throw new Error('--background row not found');
  return within(row);
}

const meta = {
  title: 'Foundations/Tokens',
  component: TokenTable,
} satisfies Meta<typeof TokenTable>;

export default meta;
type Story = StoryObj<typeof meta>;

// Dark comes first: Light then checks that the default global replaces an earlier story's theme.
export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas, canvasElement }) => {
    for (const { name } of TOKENS) {
      await expect(canvas.getByText(name, { selector: 'code' })).toBeVisible();
    }
    await expect(await backgroundRow(canvasElement).findByText('#13141b')).toBeVisible();
  },
};

export const Light: Story = {
  play: async ({ canvas, canvasElement }) => {
    // The decorator writes the global for every story, so Dark's theme is replaced here.
    await expect(document.documentElement.dataset.theme).toBe('light');
    for (const { name } of TOKENS) {
      await expect(canvas.getByText(name, { selector: 'code' })).toBeVisible();
    }
    // The values are read live from the page, not copied into the story.
    await expect(await backgroundRow(canvasElement).findByText('#f4f4f7')).toBeVisible();
  },
};
