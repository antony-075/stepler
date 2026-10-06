'use client';

import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePageCrumbs } from './topbar-crumbs';

export type Crumb = { label: string; href?: string };

/**
 * Where a page sits (owner review 2026-10-02: "very easy to get lost"): «Колекції › Весілля ›
 * Посилання», on the left of the desktop top bar (owner 2026-10-06) and above the h1 on phones
 * and tablets. Every step but the last is a link;
 * the last is the current page (`aria-current="page"`). 13px/500 muted like the back link it
 * replaces, 44px tall targets (32px with a mouse from `md`). A long collection title is cut to one line (full text in
 * `title`); on phones the row wraps rather than scrolls.
 */
export function Breadcrumbs({ items, nowrap = false }: { items: Crumb[]; nowrap?: boolean }) {
  const t = useTranslations('app');
  return (
    <nav aria-label={t('breadcrumbs')} data-slot="breadcrumbs" className="-ml-1.5 min-w-0">
      <ol
        className={cn(
          'flex min-w-0 items-center text-[0.875rem] font-medium text-muted-foreground',
          nowrap ? 'flex-nowrap [&>li:first-child]:shrink-0' : 'flex-wrap',
        )}
      >
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className="flex min-w-0 items-center">
              {index === 0 ? null : (
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
              )}
              {last || item.href === undefined ? (
                <span
                  {...(last ? { 'aria-current': 'page' as const } : {})}
                  title={item.label}
                  className="inline-flex min-h-11 max-w-[24ch] min-w-0 items-center px-1.5 text-foreground md:pointer-fine:min-h-8"
                >
                  <span className="truncate">{item.label}</span>
                </span>
              ) : (
                <Link
                  href={item.href}
                  title={item.label}
                  className={cn(
                    'inline-flex min-h-11 max-w-[24ch] min-w-0 items-center rounded-control px-1.5 no-underline transition-colors duration-(--duration-fast) hover:text-foreground motion-reduce:transition-none md:pointer-fine:min-h-8',
                    focusRing,
                  )}
                >
                  <span className="truncate">{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The trail of a collection's pages: the collections, the collection, then `section` if any.
 * From `lg` it is shown in the top bar (handed over with `usePageCrumbs`); below, here.
 */
export function CollectionBreadcrumbs({
  collection,
  section,
}: {
  collection: { id: string; title: string };
  section?: 'settings';
}) {
  const t = useTranslations('app.nav');
  const items: Crumb[] = [
    { label: t('collections'), href: '/app' },
    { label: collection.title, href: `/app/collections/${collection.id}` },
  ];
  if (section !== undefined) items.push({ label: t(`section.${section}`) });
  usePageCrumbs(items);
  return (
    <div className="lg:hidden">
      <Breadcrumbs items={items} />
    </div>
  );
}
