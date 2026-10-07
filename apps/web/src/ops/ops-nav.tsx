'use client';

// Design pass (slice 9b, Task 7; frontend-design, web-design-guidelines, responsive-design): the
// console's two queues, guest reports and admin appeals (Q-A6), as a segmented pair under the
// dark header: full width on phones (one 44px row each; three equal thirds from `sm`), their own
// width from `md`. Billing (ADR 0018) is the third section. Links,
// not tabs (each queue is its own page and URL); the current one carries `aria-current="page"`
// and the segment's raised surface, so it never relies on colour alone.
import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINK =
  'flex min-h-11 items-center justify-center rounded-[calc(var(--radius-control)-2px)] px-4 text-center text-[0.9375rem] font-medium text-foreground-soft outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring md:min-h-9';
const CURRENT = 'bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]';
const OTHER = 'hover:text-foreground';
const PAGE = 'page';

const SECTIONS = [
  { key: 'reports', href: '/ops/reports' },
  { key: 'appeals', href: '/ops/appeals' },
  { key: 'billing', href: '/ops/billing' },
] as const;

export function OpsNav() {
  const t = useTranslations('ops.nav');
  const pathname = usePathname();
  return (
    <nav aria-label={t('label')} className="mb-5 md:mb-6">
      <ul className="grid grid-cols-1 gap-1 rounded-control bg-muted p-1 sm:grid-cols-3 md:inline-grid md:w-auto">
        {SECTIONS.map((section) => {
          const current = pathname.startsWith(section.href);
          return (
            <li key={section.key}>
              <Link
                href={section.href}
                aria-current={current ? PAGE : undefined}
                className={cn(LINK, current ? CURRENT : OTHER)}
              >
                {t(section.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
