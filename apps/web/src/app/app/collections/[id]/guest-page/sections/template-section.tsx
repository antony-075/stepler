'use client';

import { TEMPLATES } from '@stepler/templates/react';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { SectionProps } from './section-props';

/** The six templates in the editor's order; only registered ones can be chosen. */
const ORDER = ['classic', 'fullscreen', 'journal', 'postcard', 'party', 'minimal'] as const;

/**
 * «Шаблон»: a 3-column grid of thumbnails with their names, the current one pressed. A template
 * that is not ready yet stays in its place, focusable and `aria-disabled`, with «Скоро» on the
 * tile and the reason as a visible line under the grid.
 */
export function TemplateSection({ editor, readOnly }: SectionProps) {
  const t = useTranslations('templates');
  const tSection = useTranslations('guestPage.template');
  const hintId = useId();
  const anySoon = ORDER.some((id) => TEMPLATES[id] === undefined);
  return (
    <div className="grid gap-3">
      <ul aria-label={tSection('label')} className="grid grid-cols-3 gap-3">
        {ORDER.map((id) => {
          const template = TEMPLATES[id];
          const selected = editor.working.templateId === id;
          const soon = template === undefined;
          const Thumbnail = template?.Thumbnail;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                {...(soon || readOnly ? { 'aria-disabled': true } : {})}
                {...(soon ? { 'aria-describedby': hintId } : {})}
                data-template-option={id}
                onClick={() => {
                  if (!soon && !readOnly) editor.dispatch({ type: 'template', id });
                }}
                className={cn(
                  'grid w-full gap-1.5 rounded-control p-1 text-center text-sm font-semibold',
                  focusRing,
                  {
                    'ring-2 ring-foreground': selected,
                    'cursor-not-allowed text-muted-foreground': soon,
                  },
                )}
              >
                {Thumbnail === undefined ? (
                  <span
                    aria-hidden="true"
                    className="grid aspect-[3/4] w-full place-items-center rounded-frame border border-dashed border-input bg-muted type-caption"
                  />
                ) : (
                  <Thumbnail />
                )}
                <span className="text-balance">{t(`${id}.name`)}</span>
                {soon ? (
                  <span className="type-caption font-normal text-muted-foreground">
                    {tSection('soon')}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {anySoon ? (
        <p id={hintId} className="text-sm text-pretty text-muted-foreground">
          {tSection('soonHint')}
        </p>
      ) : null}
    </div>
  );
}
