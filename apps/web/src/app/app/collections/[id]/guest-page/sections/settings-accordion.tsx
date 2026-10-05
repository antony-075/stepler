'use client';

import { ACCENT_PRESETS, codePointLength, WELCOME_MESSAGE_MAX_CHARS } from '@stepler/contracts';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useRef, useState } from 'react';
import { currentVersion } from '../editor-state';
import { SECTION_IDS, SectionBody, type SectionId } from './section-list';
import type { SectionProps } from './section-props';

/** The rows' side padding: the phone sheet's 20px, the desktop panel's 24px. */
const INSET = { single: 'px-5', multiple: 'px-6' } as const;

/**
 * The settings as an accordion, on the phone sheet and in the desktop panel alike (owner remark
 * 78). Each row is `h3 > button` with `aria-expanded`, 56px tall: the section's name, its current
 * value as a summary and a chevron, so the closed accordion still reads as the whole page.
 * - `single` (the phone sheet): one section at a time, the one just opened scrolled to the top.
 * - `multiple` (desktop): any number open, «Шаблон» first. On a computer the panel has the room,
 *   and the owner often tunes two things together (the accent against the background); closing
 *   one never hides the other.
 */
export function SettingsAccordion({
  mode,
  ...props
}: SectionProps & { mode: 'single' | 'multiple' }) {
  const [open, setOpen] = useState<ReadonlySet<SectionId>>(() => new Set(['template']));
  const summaries = useSummaries(props);
  return (
    <>
      {SECTION_IDS.map((id) => (
        <AccordionRow
          key={id}
          id={id}
          summary={summaries[id]}
          expanded={open.has(id)}
          scrollOnOpen={mode === 'single'}
          inset={INSET[mode]}
          onToggle={() =>
            setOpen((current) => {
              if (current.has(id)) {
                const next = new Set(current);
                next.delete(id);
                return next;
              }
              return mode === 'single' ? new Set([id]) : new Set([...current, id]);
            })
          }
        >
          <SectionBody id={id} {...props} />
        </AccordionRow>
      ))}
    </>
  );
}

function AccordionRow({
  id,
  summary,
  expanded,
  scrollOnOpen,
  inset,
  onToggle,
  children,
}: {
  id: SectionId;
  summary: ReactNode;
  expanded: boolean;
  scrollOnOpen: boolean;
  inset: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('guestPage.sections');
  const panelId = useId();
  const row = useRef<HTMLElement>(null);
  return (
    <section
      ref={row}
      id={`guest-page-section-${id}`}
      className="border-b last:border-b-0"
      data-slot="accordion-row"
      data-section={id}
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => {
            onToggle();
            // The row just opened starts at the top of the sheet, its settings in view.
            if (!expanded && scrollOnOpen)
              requestAnimationFrame(() => row.current?.scrollIntoView({ block: 'start' }));
          }}
          className={cn(
            'flex min-h-14 w-full items-center gap-3 text-left hover:bg-hover-card',
            inset,
            focusRing,
            'focus-visible:-outline-offset-2',
          )}
        >
          <span className="text-base font-semibold">{t(id)}</span>
          <span className="ml-auto flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-muted-foreground">
            {summary}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-5 shrink-0 transition-transform motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </h3>
      <div id={panelId} hidden={!expanded} className={cn(inset, 'pt-1 pb-6')}>
        {children}
      </div>
    </section>
  );
}

/** Each row's current value (Appendix B), so the closed accordion still reads as the page. */
function useSummaries({ editor, def }: SectionProps) {
  const t = useTranslations('guestPage');
  const tTemplates = useTranslations('templates');
  const { settings, welcomeMessage } = editor.working;
  const version = currentVersion(editor.editor);
  const imageLabel = (status: 'READY' | 'PENDING' | 'FAILED' | undefined) =>
    status === undefined
      ? t('image.none')
      : status === 'READY'
        ? t('image.ready')
        : status === 'PENDING'
          ? t('image.processing')
          : t('image.failedShort');
  const background = settings.background;
  const backgroundSummary =
    background.kind === 'image'
      ? t('phone.imageSummary', { dim: background.dim })
      : t(`background.${background.kind}`);
  const preset = ACCENT_PRESETS.find((p) => p.hex === settings.accent);
  const fontName = t(`font.names.${settings.headingFont}`);
  const welcomeLength = welcomeMessage === null ? 0 : codePointLength(welcomeMessage);
  const summaries: Record<SectionId, ReactNode> = {
    template: tTemplates.has(`${def.id}.name`) ? tTemplates(`${def.id}.name`) : def.id,
    cover: <span className="truncate">{imageLabel(version.cover?.status)}</span>,
    welcome: (
      <span className="type-data tabular-nums">
        {t('welcome.counter', { count: welcomeLength, max: WELCOME_MESSAGE_MAX_CHARS })}
      </span>
    ),
    background: backgroundSummary,
    accent: (
      <>
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
          style={{ backgroundColor: settings.accent }}
        />
        <span className="type-data">{settings.accent}</span>
        {preset === undefined ? null : (
          <span className="sr-only">{t(`accent.names.${preset.id}`)}</span>
        )}
      </>
    ),
    font: <span className="truncate">{fontName}</span>,
    layout: (
      <span className="truncate">
        {t('phone.layoutSummary', {
          placement: t(`layout.placements.${settings.coverPlacement}`),
          align: settings.align,
        })}
      </span>
    ),
  };
  return summaries;
}
