import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Panel } from './panel';

type SettingsSectionProps = {
  /** The heading's id; the section is labelled by it. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /**
   * `danger` is for irreversible actions (deletion): the panel takes the soft destructive fill
   * and a solid destructive edge, and the rows' hints read in the foreground colour. The rows
   * still carry the icon and the word: colour is never the only signal.
   */
  tone?: 'default' | 'danger';
  className?: string;
  /** Usually `SettingRow`s; rows are split by hairlines. */
  children: ReactNode;
};

/**
 * One group of settings (DESIGN-SYSTEM.md §6.8): an `h2`, an optional muted description and one
 * panel whose rows are split by hairlines. Pages stack several of these across the full admin
 * column (owner review 2026-10-02: a 640px column "looked odd" next to the full-width tabs). From
 * `lg` the heading and description sit in a 17rem column on the left and the panel takes the
 * rest, so the page uses its width without stretching a form field across 1200px; below `lg`
 * the heading is above the panel.
 */
function SettingsSection({
  id,
  title,
  description,
  tone = 'default',
  className,
  children,
}: SettingsSectionProps) {
  return (
    <section
      data-slot="settings-section"
      aria-labelledby={id}
      className={cn(
        'grid min-w-0 gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-10',
        className,
      )}
    >
      <div className="grid content-start gap-1 lg:pt-4">
        <h2 id={id} className="type-h2">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Panel
        data-slot="settings-section-panel"
        data-tone={tone}
        className={cn('min-w-0 divide-y', {
          'divide-destructive/25 border-destructive bg-destructive-soft [&_[data-slot=setting-row-hint]]:text-foreground':
            tone === 'danger',
        })}
      >
        {children}
      </Panel>
    </section>
  );
}

type SettingRowProps = {
  /** Id of the label; the hint is `${id}-hint`. Name the control with `aria-labelledby={id}`. */
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /**
   * `compact`: a button or select at its own width, on the right from 600px. `wide`: a text
   * input or textarea that takes the rest of the row from 600px. Both stack on phones, where
   * the control fills the row.
   */
  control?: 'compact' | 'wide';
  className?: string;
  children: ReactNode;
};

const ROW_LAYOUT = {
  compact: 'min-[600px]:grid-cols-[minmax(0,1fr)_auto] min-[600px]:items-center',
  wide: 'min-[600px]:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] min-[600px]:items-start',
} as const;

/**
 * One setting: its name (15px/600) and a one-line hint (14px muted), then the control. The hint
 * describes the control (pass `aria-describedby={`${id}-hint`}` to it). Long unbroken text wraps
 * instead of widening the panel.
 */
function SettingRow({
  id,
  label,
  hint,
  control = 'compact',
  className,
  children,
}: SettingRowProps) {
  return (
    <div
      data-slot="setting-row"
      data-control={control}
      className={cn(
        'grid gap-3 p-4 min-[600px]:gap-6 min-[600px]:px-6 min-[600px]:py-5',
        ROW_LAYOUT[control],
        className,
      )}
    >
      <div
        data-slot="setting-row-text"
        className={cn('min-w-0', { 'min-[600px]:pt-3': control === 'wide' })}
      >
        <div id={id} className="text-[0.9375rem] font-semibold [overflow-wrap:anywhere]">
          {label}
        </div>
        {hint ? (
          <p
            id={`${id}-hint`}
            data-slot="setting-row-hint"
            className="mt-0.5 max-w-[60ch] text-sm leading-[1.45] text-muted-foreground [overflow-wrap:anywhere]"
          >
            {hint}
          </p>
        ) : null}
      </div>
      <div data-slot="setting-row-control" className="min-w-0">
        {children}
      </div>
    </div>
  );
}

export { SettingRow, type SettingRowProps, SettingsSection, type SettingsSectionProps };
