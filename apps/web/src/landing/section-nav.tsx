'use client';

import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { NAV_SECTIONS, type NavSection, SECTION, sectionHref } from './sections';

/**
 * Where the reading line sits: a third of the way down the window, under the sticky header. The
 * section that crosses it is the one being read.
 */
const READING_LINE = 0.33;

/** `aria-current` of the anchor whose section is being read. */
export const CURRENT_SECTION = 'location';

/**
 * The section being read: the nav section whose box crosses the reading line, or `null` between
 * them (the demo, the benefits and the use cases have no anchor of their own) and above the first.
 * Measured on scroll and resize, at most once a frame; a handful of boxes, so no observer needed.
 */
export function useCurrentSection(): NavSection | null {
  const [current, setCurrent] = useState<NavSection | null>(null);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * READING_LINE;
      const found = NAV_SECTIONS.find((key) => {
        const box = document.getElementById(SECTION[key])?.getBoundingClientRect();
        return box !== undefined && box.top <= line && box.bottom > line;
      });
      setCurrent(found ?? null);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);
  return current;
}

/**
 * The header's anchors from 1024px. The section being read is marked `aria-current="location"`
 * and drawn as the current place: ink text on the soft accent with a short accent bar under it,
 * so it never relies on colour alone. Without JavaScript the anchors still work, unmarked.
 */
export function SectionNav({ onLanding = true }: { onLanding?: boolean }) {
  const t = useTranslations('home.nav');
  const current = useCurrentSection();
  return (
    <nav aria-label={t('label')} className="ml-4 hidden lg:block">
      <ul className="flex items-center gap-0.5">
        {NAV_SECTIONS.map((key) => {
          const active = key === current;
          return (
            <li key={key}>
              <a
                href={sectionHref(key, onLanding)}
                aria-current={active ? CURRENT_SECTION : undefined}
                className={cn(
                  'relative inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-foreground-soft no-underline transition-colors duration-(--duration-base) hover:text-foreground motion-reduce:transition-none',
                  'after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity after:duration-(--duration-base)',
                  'aria-[current=location]:bg-pencil-soft aria-[current=location]:text-foreground aria-[current=location]:after:opacity-100',
                  focusRing,
                )}
              >
                {t(key)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
