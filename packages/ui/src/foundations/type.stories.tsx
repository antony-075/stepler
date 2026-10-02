import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';

/** The type scale of docs/design/DESIGN-SYSTEM.md §3.2, one row per `type-*` utility. */
const SCALE = [
  { utility: 'type-display', use: 'h1 of guest pages and the sign-in landing (SHRP 80)' },
  { utility: 'type-h1', use: 'h1 of admin pages (SHRP 80)' },
  { utility: 'type-h2', use: 'section headings (SHRP 60)' },
  { utility: 'type-h3', use: 'panel headings (no SHRP below 19px)' },
  { utility: 'type-body-lg', use: 'guest texts, guest main button' },
  { utility: 'type-body', use: 'admin body (fields stay 16px)' },
  { utility: 'type-small', use: 'hints, meta, small buttons' },
  { utility: 'type-caption', use: 'captions under a frame, terms line' },
] as const;

const SAMPLE = 'Весілля Олі та Тараса';
// Ukrainian letters and punctuation that a font without full Cyrillic would miss.
const UKRAINIAN = 'Ґанок, їжак, єнот: «Ми з’їли все» — № 12, ґудзик ЇЄІҐ';

function TypeSpecimen() {
  return (
    <div className="grid gap-10 p-4 text-foreground" lang="uk">
      <section aria-labelledby="type-scale" className="grid gap-4">
        <h2 id="type-scale" className="type-h3">
          Scale
        </h2>
        <ul className="grid gap-5">
          {SCALE.map(({ utility, use }) => (
            <li key={utility} className="grid gap-1 border-b pb-4">
              <code className="type-data text-muted-foreground">
                {utility} · {use}
              </code>
              <p className={utility}>{SAMPLE}</p>
            </li>
          ))}
          <li className="grid gap-1 border-b pb-4">
            <code className="type-data text-muted-foreground">type-data / type-data-lg</code>
            <p className="flex items-baseline gap-4">
              <span className="type-data">#087 21:10 1:30 8,6 МБ</span>
              <span className="type-data-lg">#087–#116</span>
            </p>
          </li>
        </ul>
      </section>

      <section aria-labelledby="type-sharpness" className="grid gap-4">
        <h2 id="type-sharpness" className="type-h3">
          Sharpness (SHRP axis)
        </h2>
        <div className="grid gap-2">
          {[0, 60, 80, 100].map((shrp) => (
            <p
              key={shrp}
              data-shrp={shrp}
              className="text-[2.75rem] leading-tight font-semibold"
              style={{ fontVariationSettings: `'SHRP' ${shrp}` }}
            >
              <span className="type-data align-middle text-muted-foreground">SHRP {shrp}</span>{' '}
              Колекції
            </p>
          ))}
        </div>
        <p className="font-wordmark text-xl" translate="no">
          stepler
        </p>
      </section>

      <section aria-labelledby="type-ukrainian" className="grid gap-4">
        <h2 id="type-ukrainian" className="type-h3">
          Ukrainian
        </h2>
        <p data-testid="ukrainian" className="type-body-lg">
          {UKRAINIAN}
        </p>
        <p className="type-h2">{UKRAINIAN}</p>
        <p className="type-data">{UKRAINIAN}</p>
      </section>
    </div>
  );
}

/** Width of `text` in `family` at 32px, laid out by the browser. */
function textWidth(text: string, family: string): number {
  const probe = document.createElement('span');
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:600 32px ${family}`;
  probe.textContent = text;
  document.body.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

const meta = {
  title: 'Foundations/Type',
  component: TypeSpecimen,
} satisfies Meta<typeof TypeSpecimen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {
  play: async ({ canvas }) => {
    // The committed woff2 files load (no network fonts) and cover the Ukrainian sample.
    await document.fonts.load('600 32px Geologica', UKRAINIAN);
    await document.fonts.load('400 12px "Geist Mono"', UKRAINIAN);
    await waitFor(() => expect(document.fonts.check('600 32px Geologica', UKRAINIAN)).toBe(true));
    await expect(document.fonts.check('400 12px "Geist Mono"', UKRAINIAN)).toBe(true);
    // Laid out in Geologica, not a fallback: the width differs from the system font's.
    await expect(textWidth(UKRAINIAN, 'Geologica, monospace')).not.toBe(
      textWidth(UKRAINIAN, 'monospace'),
    );
    await expect(getComputedStyle(canvas.getByTestId('ukrainian')).fontFamily).toMatch(
      /^(Geologica|var)/,
    );
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
};

export const Phone: Story = {
  globals: { viewport: { value: 'phone' } },
};
