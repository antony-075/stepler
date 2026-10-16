'use client';

// The console's sections (owner remark 2026-10-16): guest reports, admin appeals and billing,
// in the chrome. From `lg` a vertical list in the sidebar (40px rows, an icon and the word, the
// current one on `--ops-chrome-current` with a 2px white bar at its edge); below `lg` one row of
// three equal cells under the top bar (48px, the icon over the word, the current one underlined
// in white). Links, not tabs: each section is its own page and URL; the current one carries
// `aria-current="page"` and never relies on colour alone (the bar, the weight).
import { cn } from '@stepler/ui/lib/utils';
import { CreditCard, Flag, type LucideIcon, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PAGE = 'page';

const SECTIONS: readonly {
  key: 'reports' | 'appeals' | 'billing';
  href: string;
  icon: LucideIcon;
}[] = [
  { key: 'reports', href: '/ops/reports', icon: Flag },
  { key: 'appeals', href: '/ops/appeals', icon: Scale },
  { key: 'billing', href: '/ops/billing', icon: CreditCard },
];

const LINK = cn(
  'relative flex outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ops-chrome-ring)]',
  // Phones and tablets: a cell of the row, the icon over the word.
  'min-h-12 flex-col items-center justify-center gap-1 px-1 py-1.5 text-center text-[0.75rem] leading-tight',
  // From `lg`: a row of the sidebar's list.
  'lg:min-h-10 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-control lg:px-3 lg:py-2 lg:text-left lg:text-[0.9375rem]',
);
const CURRENT = cn(
  'font-semibold text-[var(--ops-chrome-foreground)]',
  'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--ops-chrome-foreground)]',
  'lg:bg-[var(--ops-chrome-current)] lg:after:inset-x-auto lg:after:inset-y-2 lg:after:left-0 lg:after:h-auto lg:after:w-0.5',
);
const OTHER =
  'text-[var(--ops-chrome-muted)] hover:bg-[var(--ops-chrome-hover)] hover:text-[var(--ops-chrome-foreground)]';

export function OpsNav() {
  const t = useTranslations('ops.nav');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('label')}
      className="border-t border-[var(--ops-chrome-border)] lg:border-t-0 lg:px-3"
    >
      <ul className="grid grid-cols-3 lg:grid-cols-1 lg:gap-0.5">
        {SECTIONS.map(({ key, href, icon: Icon }) => {
          const current = pathname.startsWith(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? PAGE : undefined}
                className={cn(LINK, current ? CURRENT : OTHER)}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
