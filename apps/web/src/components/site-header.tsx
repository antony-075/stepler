import { BrandMark } from '@stepler/ui/components/brand-mark';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * Brand link on the left; optional tools (e.g. sign out) on the right. Synchronous so both
 * server pages and the client app shell can render it.
 */
export function SiteHeader({ children }: { children?: ReactNode }) {
  const t = useTranslations('brand');
  return (
    <header className="px-4 py-3 sm:px-6 lg:px-10 lg:py-5">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg text-foreground no-underline"
        >
          <BrandMark className="shrink-0" />
          <span className="font-display text-lg font-semibold tracking-tight lowercase">
            {t('name')}
          </span>
        </Link>
        {children}
      </div>
    </header>
  );
}
