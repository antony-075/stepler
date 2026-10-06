import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { useThemeAttribute } from './theme-attribute';

type Token = { name: string; role: string };

/** The colour tokens of the tables in docs/ux/design-system.md ("Tokens"), by group. */
const GROUPS: { title: string; tokens: Token[] }[] = [
  {
    title: 'Surfaces and text',
    tokens: [
      { name: '--background', role: 'graphite chrome: page, sidebar' },
      { name: '--card', role: 'panel: the main panel, cards, fields' },
      { name: '--popover', role: 'raised: menus, select, toast, dialog' },
      { name: '--foreground', role: 'text, ink' },
      { name: '--muted-foreground', role: 'secondary text, time, hints' },
      { name: '--muted', role: 'fill: skeleton, disabled, frame placeholder' },
      { name: '--border', role: 'grid lines, hairlines (decorative)' },
      { name: '--input', role: 'field, checkbox and radio edges (3:1)' },
      { name: '--border-strong', role: 'outline-button and chip edges' },
      { name: '--foreground-soft', role: 'secondary body text' },
      { name: '--track', role: 'segmented-control track' },
    ],
  },
  {
    title: 'Actions',
    tokens: [
      { name: '--primary', role: 'indigo accent: primary button, current place' },
      { name: '--primary-hover', role: 'accent on hover' },
      { name: '--primary-active', role: 'accent pressed' },
      { name: '--primary-foreground', role: 'text on the accent' },
      { name: '--pencil', role: 'the accent (alias): guest primary, selection, new' },
      { name: '--pencil-hover', role: 'pencil on hover' },
      { name: '--pencil-active', role: 'pencil pressed' },
      { name: '--pencil-foreground', role: 'text on pencil' },
      { name: '--pencil-soft', role: 'selected row or chip' },
      { name: '--link', role: 'links, information, focus' },
      { name: '--link-hover', role: 'link on hover' },
      { name: '--info-soft', role: 'info Alert' },
      { name: '--destructive', role: 'errors, deletion' },
      { name: '--destructive-hover', role: 'destructive on hover' },
      { name: '--destructive-active', role: 'destructive pressed' },
      { name: '--destructive-foreground', role: 'text on destructive' },
      { name: '--destructive-soft', role: 'error Alert' },
    ],
  },
  {
    title: 'Status and states',
    tokens: [
      { name: '--success', role: 'added, active link' },
      { name: '--success-soft', role: 'success Alert' },
      { name: '--warning', role: 'large file, paused link' },
      { name: '--warning-soft', role: 'warning Alert' },
      { name: '--hover', role: 'hover on the page' },
      { name: '--hover-card', role: 'hover inside a sheet' },
      { name: '--hover-popover', role: 'hover inside a popover' },
      { name: '--ring', role: 'focus ring (the accent)' },
      { name: '--hover-ghost', role: 'ghost control hover, any surface' },
      { name: '--inverse', role: 'tooltip, selection bar' },
    ],
  },
  {
    title: 'Frame tints',
    tokens: ['sage', 'lavender', 'sand', 'sky'].flatMap((tint) => [
      { name: `--tint-${tint}`, role: 'empty frame fill' },
      { name: `--tint-${tint}-edge`, role: 'empty frame edge' },
      { name: `--tint-${tint}-ink`, role: 'frame number on the fill' },
    ]),
  },
  {
    title: 'Overlays and media',
    tokens: [
      { name: '--overlay', role: 'under a dialog or sheet' },
      { name: '--veil', role: 'not uploaded yet, over a frame' },
      { name: '--viewer', role: 'full-screen frame viewer (both themes)' },
      { name: '--viewer-foreground', role: 'text in the viewer' },
    ],
  },
];

const ALL_TOKENS = GROUPS.flatMap((group) => group.tokens);

/** Swatches with the live computed values, so both themes can be compared from the toolbar. */
function TokenTable() {
  // Subscribing re-reads the values below after every theme change.
  useThemeAttribute();
  const style = getComputedStyle(document.documentElement);

  return (
    <div className="grid gap-8 p-4 text-foreground">
      {GROUPS.map(({ title, tokens }) => (
        <section key={title} aria-labelledby={`tokens-${title}`} className="grid gap-3">
          <h2 id={`tokens-${title}`} className="text-base font-semibold">
            {title}
          </h2>
          <ul className="grid gap-px overflow-hidden rounded-sheet bg-border sm:grid-cols-2 lg:grid-cols-3">
            {tokens.map(({ name, role }) => (
              <li key={name} className="flex min-w-0 items-center gap-3 bg-card p-3">
                <span
                  aria-hidden="true"
                  className="size-11 shrink-0 rounded-frame border border-border"
                  style={{ background: `var(${name})` }}
                />
                <span className="min-w-0">
                  <code className="block font-mono text-sm break-all">{name}</code>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {style.getPropertyValue(name).trim()}
                  </span>
                  <span className="block text-sm text-muted-foreground">{role}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function tokenRow(canvasElement: HTMLElement, name: string) {
  const row = within(canvasElement).getByText(name, { selector: 'code' }).closest('li');
  if (!row) throw new Error(`${name} row not found`);
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
    for (const { name } of ALL_TOKENS) {
      await expect(canvas.getByText(name, { selector: 'code' })).toBeVisible();
    }
    await expect(await tokenRow(canvasElement, '--background').findByText('#0c0c0e')).toBeVisible();
    await expect(await tokenRow(canvasElement, '--pencil').findByText('#8fa0ff')).toBeVisible();
  },
};

export const Light: Story = {
  play: async ({ canvas, canvasElement }) => {
    // The decorator writes the global for every story, so Dark's theme is replaced here.
    await expect(document.documentElement.dataset.theme).toBe('light');
    for (const { name } of ALL_TOKENS) {
      await expect(canvas.getByText(name, { selector: 'code' })).toBeVisible();
    }
    // The values are read live from the page, not copied into the story.
    await expect(await tokenRow(canvasElement, '--background').findByText('#f4f4f5')).toBeVisible();
    await expect(await tokenRow(canvasElement, '--pencil').findByText('#2a47e0')).toBeVisible();
  },
};
