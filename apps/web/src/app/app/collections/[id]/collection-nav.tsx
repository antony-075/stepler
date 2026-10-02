'use client';

import { focusRingInset } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

type Section = 'content' | 'links';

const SECTIONS: { section: Section; path: string }[] = [
  { section: 'content', path: '' },
  { section: 'links', path: '/links' },
];

/**
 * The collection's sections under its header (G9; DESIGN-SYSTEM.md §6.6 tab row without the tabs
 * that do not exist yet): «Вміст · Посилання» as links, because each is its own page. Settings
 * are not a section but a page of their own, opened from the header (owner review 2026-10-02).
 * They look like `Tabs` (48px, 15px/600, muted until current; the current one in foreground with
 * the pencil underline) but are a `nav` of links with `aria-current="page"`, not a tablist. The
 * row scrolls inside itself when it does not fit (320px, long translations).
 */
export function CollectionNav({
  id,
  current,
  className,
}: {
  id: string;
  current: Section;
  className?: string;
}) {
  const t = useTranslations('collection.nav');
  return (
    <nav aria-label={t('label')} className={cn('min-w-0', className)}>
      <ul className="flex w-full max-w-full gap-1 overflow-x-auto border-b text-muted-foreground [scrollbar-width:thin]">
        {SECTIONS.map(({ section, path }) => {
          const active = section === current;
          return (
            <li key={section} className="shrink-0">
              <Link
                href={`/app/collections/${id}${path}`}
                {...(active ? { 'aria-current': 'page' as const } : {})}
                className={cn(
                  'group/nav relative inline-flex h-12 items-center rounded-control px-3 text-[0.9375rem] font-semibold whitespace-nowrap no-underline transition-colors duration-(--duration-fast) hover:text-foreground motion-reduce:transition-none',
                  focusRingInset,
                  { 'text-foreground': active },
                )}
              >
                {t(section)}
                {active ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 100 10"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute inset-x-2 bottom-1.5 h-1.5 w-[calc(100%-1rem)] overflow-visible"
                  >
                    <path
                      d="M2 5 C24 2 50 3 72 5 C84 6 92 4 98 3"
                      fill="none"
                      stroke="var(--pencil)"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
