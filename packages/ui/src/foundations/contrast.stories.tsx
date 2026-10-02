import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { useThemeAttribute } from './theme-attribute';

/**
 * The contrast pairs of docs/design/DESIGN-SYSTEM.md §2.2, computed from the live token values
 * in the current theme with the WCAG 2.x formula. A pair under its minimum fails the story, so
 * a token change that breaks contrast fails `pnpm test`.
 */
type Pair = { fg: string; bg: string; min: 3 | 4.5 };

const TEXT_COLOURS = [
  'foreground',
  'muted-foreground',
  'pencil',
  'link',
  'success',
  'warning',
  'destructive',
];
const SURFACES = ['background', 'card', 'popover', 'hover', 'hover-card', 'hover-popover'];

const PAIRS: Pair[] = [
  // Text on surfaces. Warning text never sits on --hover (warning rows are not interactive).
  ...TEXT_COLOURS.flatMap((fg) =>
    SURFACES.filter((bg) => !(fg === 'warning' && bg === 'hover')).map((bg) => ({
      fg,
      bg,
      min: 4.5 as const,
    })),
  ),
  { fg: 'link-hover', bg: 'background', min: 4.5 },
  { fg: 'link-hover', bg: 'card', min: 4.5 },
  // Text on fills.
  ...['primary', 'primary-hover', 'primary-active'].map((bg) => ({
    fg: 'primary-foreground',
    bg,
    min: 4.5 as const,
  })),
  ...['pencil', 'pencil-hover', 'pencil-active'].map((bg) => ({
    fg: 'pencil-foreground',
    bg,
    min: 4.5 as const,
  })),
  ...['destructive', 'destructive-hover', 'destructive-active'].map((bg) => ({
    fg: 'destructive-foreground',
    bg,
    min: 4.5 as const,
  })),
  ...['success-soft', 'warning-soft', 'destructive-soft', 'pencil-soft', 'info-soft'].map((bg) => ({
    fg: 'foreground',
    bg,
    min: 4.5 as const,
  })),
  { fg: 'success', bg: 'success-soft', min: 4.5 },
  { fg: 'warning', bg: 'warning-soft', min: 4.5 },
  { fg: 'destructive', bg: 'destructive-soft', min: 4.5 },
  { fg: 'pencil', bg: 'pencil-soft', min: 4.5 },
  { fg: 'muted-foreground', bg: 'pencil-soft', min: 4.5 },
  { fg: 'link', bg: 'info-soft', min: 4.5 },
  { fg: 'muted-foreground', bg: 'muted', min: 4.5 },
  { fg: 'viewer-foreground', bg: 'viewer', min: 4.5 },
  // Non-text: control edges, the focus ring, button shapes and status icons.
  ...['card', 'background', 'popover'].map((bg) => ({ fg: 'input', bg, min: 3 as const })),
  ...[
    'background',
    'card',
    'popover',
    'pencil-soft',
    'hover',
    'hover-card',
    'hover-popover',
    'muted',
  ].map((bg) => ({
    fg: 'ring',
    bg,
    min: 3 as const,
  })),
  // Status icons (destructive, success, muted on card) are covered by the text pairs above.
  { fg: 'primary', bg: 'background', min: 3 },
];

/** A token's resolved sRGB colour, read through a probe element. */
function resolve(token: string, probe: HTMLElement): [number, number, number] {
  probe.style.color = `var(--${token})`;
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color);
  if (!match) throw new Error(`--${token} did not resolve to a colour`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

type Row = Pair & { value: number; pass: boolean };

function measure(): Row[] {
  const probe = document.createElement('span');
  document.body.append(probe);
  try {
    return PAIRS.map((pair) => {
      const value = ratio(resolve(pair.fg, probe), resolve(pair.bg, probe));
      // Two decimals, as in the spec tables: 4.495 rounds to 4.50 and is not a pass.
      return { ...pair, value, pass: Math.floor(value * 100) / 100 >= pair.min };
    });
  } finally {
    probe.remove();
  }
}

function ContrastTable() {
  const theme = useThemeAttribute();
  const rows = measure();
  const failures = rows.filter((row) => !row.pass).length;
  return (
    <div className="grid gap-4 p-4 text-foreground">
      <p data-testid="contrast-summary">
        {`${rows.length} pairs in ${theme ?? 'system'} theme, ${failures} below the minimum`}
      </p>
      <table className="w-full max-w-3xl border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4 font-semibold">Foreground</th>
            <th className="py-2 pr-4 font-semibold">Background</th>
            <th className="py-2 pr-4 text-right font-semibold">Ratio</th>
            <th className="py-2 pr-4 text-right font-semibold">Minimum</th>
            <th className="py-2 font-semibold">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.fg}/${row.bg}`} className="border-b" data-pass={row.pass}>
              <td className="py-1.5 pr-4">
                <span className="inline-flex items-center gap-2">
                  {/* Text pairs show sample text; non-text pairs (edges, ring) a 2px stroke,
                      so axe does not read them as text. */}
                  <span
                    aria-hidden="true"
                    className="grid size-7 place-items-center rounded-frame border text-xs font-semibold"
                    style={{ color: `var(--${row.fg})`, background: `var(--${row.bg})` }}
                  >
                    {row.min === 4.5 ? (
                      'Aa'
                    ) : (
                      <span className="size-3.5 rounded-frame border-2 border-current" />
                    )}
                  </span>
                  <code className="font-mono">--{row.fg}</code>
                </span>
              </td>
              <td className="py-1.5 pr-4">
                <code className="font-mono">--{row.bg}</code>
              </td>
              <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                {row.value.toFixed(2)}
              </td>
              <td className="py-1.5 pr-4 text-right font-mono tabular-nums">{row.min}</td>
              <td className={row.pass ? 'py-1.5' : 'py-1.5 font-semibold text-destructive'}>
                {row.pass ? 'pass' : 'FAIL'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const meta = {
  title: 'Foundations/Contrast',
  component: ContrastTable,
} satisfies Meta<typeof ContrastTable>;

export default meta;
type Story = StoryObj<typeof meta>;

async function expectAllPass(canvasElement: HTMLElement, theme: 'light' | 'dark') {
  // The table re-measures after the decorator writes <html data-theme>.
  await waitFor(() =>
    expect(canvasElement.querySelector('[data-testid="contrast-summary"]')?.textContent).toContain(
      `${theme} theme`,
    ),
  );
  const failing = Array.from(canvasElement.querySelectorAll('tr[data-pass="false"]'), (row) =>
    row.textContent?.replace(/\s+/g, ' ').trim(),
  );
  await expect(failing).toEqual([]);
  await expect(canvasElement.querySelectorAll('tr[data-pass="true"]').length).toBe(PAIRS.length);
}

export const Light: Story = {
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.dataset.theme).toBe('light');
    await expectAllPass(canvasElement, 'light');
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expectAllPass(canvasElement, 'dark');
  },
};
