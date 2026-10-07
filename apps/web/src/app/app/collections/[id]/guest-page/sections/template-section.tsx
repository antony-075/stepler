'use client';

import { TEMPLATES } from '@stepler/templates/react';
import { Check } from 'lucide-react';
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
      <ul
        aria-label={tSection('label')}
        // Tiles grow with the panel (remarks 104, 114): three columns until a tile reaches 10rem,
        // then more; never under 4.5rem. Each keeps its 3:4 picture.
        className="grid grid-cols-[repeat(auto-fill,minmax(clamp(4.5rem,28%,10rem),1fr))] gap-x-2.5 gap-y-3"
      >
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
                  'group/template grid w-full content-start gap-1.5 rounded-control p-1 text-center text-sm font-semibold',
                  focusRing,
                  { 'cursor-not-allowed text-muted-foreground': soon },
                )}
              >
                {/* Every picture is a 3:4 page; the chosen one has the accent ring and a check
                    (as the option cards), the others lift a little under the pointer. */}
                <span
                  className={cn(
                    'relative block rounded-[6px] transition-[transform,box-shadow] duration-(--duration-fast) ease-out motion-reduce:transition-none',
                    {
                      'shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--primary)]': selected,
                      'group-hover/template:-translate-y-0.5 group-hover/template:shadow-card-hover':
                        !selected && !soon,
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
                  {selected ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_2px_var(--card)]"
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
                <span className="text-balance leading-tight">{t(`${id}.name`)}</span>
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
