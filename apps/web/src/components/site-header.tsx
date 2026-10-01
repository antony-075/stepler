import { BrandMark } from '@stepler/ui/components/brand-mark';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type SiteHeaderProps = {
  /**
   * `public`: the brand floating on the page atmosphere. `app`: the admin bar, 64px with a
   * hairline below, on the same container as the page so brand, `h1` and content share one left
   * edge.
   */
  variant?: 'public' | 'app';
  /** Before the brand (the admin menu button on phones). */
  leading?: ReactNode;
  /** After the brand (the admin nav and account menu). */
  children?: ReactNode;
};

/**
 * Brand link plus optional slots on either side; public pages show the brand only. Synchronous
 * so both server pages and the client app shell can render it.
 */
export function SiteHeader({ variant = 'public', leading, children }: SiteHeaderProps) {
  const t = useTranslations('brand');
  const app = variant === 'app';
  return (
    <header className={app ? 'border-b border-border bg-background' : 'py-3 lg:py-5'}>
      <div
        className={
          app
            ? 'stepler-container flex h-16 items-center gap-2'
            : 'stepler-container flex items-center justify-between gap-3'
        }
      >
        {leading}
        <Link
          href="/"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2.5 rounded-lg text-foreground no-underline"
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
