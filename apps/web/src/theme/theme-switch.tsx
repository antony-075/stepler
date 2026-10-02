'use client';

import { OptionCard, OptionCardGroup } from '@stepler/ui/components/option-card';
import { useTranslations } from 'next-intl';
import { parseTheme, type ThemePreference } from './theme';
import { useThemePreference } from './theme-provider';

const OPTIONS: readonly ThemePreference[] = ['light', 'dark', 'system'];

/**
 * Light / Dark / System as three cards with a small picture of the app in that theme (owner
 * reference 2026-10-02), a radio group: one tab stop, arrows choose. Applies at once, no reload.
 */
export function ThemeSwitch({
  labelledBy,
  describedBy,
}: {
  labelledBy: string;
  describedBy?: string;
}) {
  const t = useTranslations('theme');
  const { preference, setPreference } = useThemePreference();
  return (
    <OptionCardGroup
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      value={preference}
      onValueChange={(value) => setPreference(parseTheme(value))}
    >
      {OPTIONS.map((option) => (
        <OptionCard
          key={option}
          value={option}
          title={t(option)}
          description={t(`${option}Hint`)}
          preview={<ThemePreview theme={option} />}
        />
      ))}
    </OptionCardGroup>
  );
}

// The two themes' page, sheet, edge and ink (globals.css :root and dark), fixed here because a
// preview shows a theme other than the current one. System is both, split on the diagonal.
const PALETTE = {
  light: { page: '#f0f1ee', sheet: '#ffffff', edge: '#d6d8d2', ink: '#d6d8d2', dot: '#83877f' },
  dark: { page: '#141615', sheet: '#1c1f1d', edge: '#2d312e', ink: '#3a3f3b', dot: '#6c716b' },
} as const;

/** A tiny window: a sidebar of dots and a sheet with two lines. Decorative. */
function Window({ theme }: { theme: 'light' | 'dark' }) {
  const c = PALETTE[theme];
  return (
    <span
      className="absolute inset-0 grid grid-cols-[1.75rem_minmax(0,1fr)] grid-rows-[0.625rem_minmax(0,1fr)]"
      style={{ backgroundColor: c.page }}
    >
      <span
        className="col-span-2 flex items-center gap-1 px-1.5"
        style={{ borderBottom: `1px solid ${c.edge}` }}
      >
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-1 rounded-full" style={{ backgroundColor: c.dot }} />
        ))}
      </span>
      <span className="grid content-start justify-items-center gap-1.5 pt-2">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-2 rounded-full" style={{ backgroundColor: c.ink }} />
        ))}
      </span>
      <span
        className="m-2 ml-0 grid content-start gap-1.5 rounded-[3px] p-2"
        style={{ backgroundColor: c.sheet, border: `1px solid ${c.edge}` }}
      >
        <span className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: c.ink }} />
        <span className="h-1.5 w-1/2 rounded-full" style={{ backgroundColor: c.ink }} />
      </span>
    </span>
  );
}

function ThemePreview({ theme }: { theme: ThemePreference }) {
  return (
    <span className="relative block aspect-[16/9] overflow-hidden rounded-frame border">
      {theme === 'system' ? (
        <>
          <Window theme="light" />
          <span className="absolute inset-0 [clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]">
            <Window theme="dark" />
          </span>
        </>
      ) : (
        <Window theme={theme} />
      )}
    </span>
  );
}
