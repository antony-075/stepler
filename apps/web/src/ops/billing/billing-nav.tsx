'use client';

// Design pass (billing M4, Tasks 20–21; frontend-design, web-design-guidelines,
// responsive-design): the billing section grew from one screen to four, so it gets the same
// segmented link row as the console's top sections, one level down and lighter (no fill):
// underline + weight mark the current page, `aria-current="page"` names it; on phones the row
// wraps into two lines of 44px links instead of scrolling sideways.
import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
  { key: 'payments', href: '/ops/billing/payments' },
  { key: 'subscriptions', href: '/ops/billing/subscriptions' },
  { key: 'offers', href: '/ops/billing/offers' },
  { key: 'grants', href: '/ops/billing/grants' },
] as const;

const LINK =
  'inline-flex min-h-11 items-center border-b-2 px-1 text-[0.9375rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring md:min-h-9';
const CURRENT = 'border-foreground font-semibold text-foreground';
const OTHER = 'border-transparent text-foreground-soft hover:text-foreground';
const PAGE = 'page';

export function BillingNav() {
  const t = useTranslations('ops.billingNav');
  const pathname = usePathname();
  return (
    <nav aria-label={t('label')} className="mb-5">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 border-b">
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
