import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type SiteHeaderProps = {
  /**
   * `public`: the wordmark on the page, no edge. `app`: the admin bar, 56px with a hairline
   * below, on the same container as the page so wordmark, `h1` and content share one left edge.
   */
  variant?: 'public' | 'app';
  /** Where the wordmark links: the landing page by default, the collections list in the app. */
  brandHref?: string;
  /** After the wordmark (the account menu). */
  children?: ReactNode;
};

/**
 * The text wordmark «stepler» (Geologica 600, SHRP 100; direction C has no graphic mark yet,
 * DESIGN-SYSTEM.md §5.18) plus an optional slot on the right; public pages show the wordmark
 * only. Synchronous so both server pages and the client app shell can render it.
 */
export function SiteHeader({ variant = 'public', brandHref = '/', children }: SiteHeaderProps) {
  const t = useTranslations('brand');
  const app = variant === 'app';
  return (
    <header className={app ? 'border-b border-border bg-background' : undefined}>
      <div className="stepler-container flex h-14 items-center justify-between gap-3">
        <Link
          href={brandHref}
          translate="no"
          className={cn(
            '-ml-1 inline-flex min-h-11 min-w-11 shrink-0 items-center rounded-control px-1 text-xl text-foreground no-underline',
            focusRing,
          )}
        >
          <span className="font-wordmark lowercase">{t('name')}</span>
        </Link>
        {children}
      </div>
    </header>
  );
}
