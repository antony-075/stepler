'use client';

// The guest page's two views on phones and tablets (owner remarks 2026-10-16: the actions, the
// frames and the uploads crowded one screen there; a computer was fine): «Додати» (the page's
// intro and its actions) and «Кадри» (the guest's own frames and, when the link shows it,
// everyone's). The template places this switch under its bar and, below 1024px, shows the chosen
// region (`viewRegionProps`); from 1024px the switch is hidden and both show. Uploads run in
// their own sheet.
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - Drawn by the template (owner remark 2026-10-16: «у тому ж стилі, що й шаблон»): this module
//   gives the structure (two equal halves, 44px, an icon, the word, the count in mono) and hooks
//   (`data-slot="guest-view-tabs"`, `guest-view-tab`, `guest-view-tab-count`, `aria-selected`);
//   the look comes from `@stepler/templates/styles.css` (a default in the template's tokens) and
//   each template's own sheet. No setting of its own: it follows the template, its accent, font
//   and corners.
// - Tabs semantics (WAI-ARIA tabs, automatic activation): arrows and Home/End move between the
//   two, each tab controls its region (`aria-controls`; no `tabpanel` role: a region is often the
//   page's `<main>`, and from 1024px both show).

import { VIEW_REGION_ID, VIEW_TAB_ID, type GuestView } from '@stepler/templates/react';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ImagePlus, LayoutGrid, type LucideIcon } from 'lucide-react';
import { type KeyboardEvent, useRef } from 'react';

const VIEWS: readonly GuestView[] = ['add', 'frames'];
const ICONS: Record<GuestView, LucideIcon> = { add: ImagePlus, frames: LayoutGrid };

export function GuestViewTabs({
  view,
  onChange,
  labels,
}: {
  view: GuestView;
  onChange: (view: GuestView) => void;
  labels: {
    /** The tab list's name («Сторінка колекції»). */
    list: string;
    add: string;
    frames: string;
    /** «86» beside «Кадри», or `null` when there is no count to show. */
    framesCount: string | null;
  };
}) {
  const tabs = useRef<Partial<Record<GuestView, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = VIEWS.indexOf(view);
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? VIEWS[(index + 1) % VIEWS.length]
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? VIEWS[(index - 1 + VIEWS.length) % VIEWS.length]
          : event.key === 'Home'
            ? VIEWS[0]
            : event.key === 'End'
              ? VIEWS[VIEWS.length - 1]
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onChange(next);
    tabs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={labels.list}
      data-slot="guest-view-tabs"
      className="grid grid-cols-2"
    >
      {VIEWS.map((id) => {
        const selected = view === id;
        const Icon = ICONS[id];
        return (
          <button
            key={id}
            ref={(element) => {
              tabs.current[id] = element;
            }}
            type="button"
            role="tab"
            data-slot="guest-view-tab"
            id={VIEW_TAB_ID[id]}
            aria-selected={selected}
            aria-controls={VIEW_REGION_ID[id]}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={onKeyDown}
            className={cn(
              'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 px-3 text-sm font-medium touch-manipulation',
              focusRing,
            )}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{id === 'add' ? labels.add : labels.frames}</span>
            {id === 'frames' && labels.framesCount !== null ? (
              <span data-slot="guest-view-tab-count" className="font-mono text-xs tabular-nums">
                {labels.framesCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
