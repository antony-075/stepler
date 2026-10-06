import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { BrandMark } from './brand-mark';

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
  /** The page column; the landing passes its wider `landing-container`. */
  container?: string;
};

/**
 * The wordmark «stepler» (Golos Text 650), linking to `href`; 44px tall. With `mark`, the V1
 * indigo mark before it (the sign-in and legal pages, DESIGN-SYSTEM.md §0.7). Also the guest
 * page template's brand, without the mark (templates keep their look).
 */
export function SiteWordmark({ href = '/', mark = false }: { href?: string; mark?: boolean }) {
  const t = useTranslations('brand');
  return (
    <Link
      href={href}
      translate="no"
      className={cn(
        '-ml-1 inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-control px-1 text-xl text-foreground no-underline',
        focusRing,
      )}
    >
      {mark ? <BrandMark /> : null}
      <span className="font-wordmark lowercase">{t('name')}</span>
    </Link>
  );
}

/**
 * The wordmark plus an optional slot on the right; public pages show the wordmark only.
 * Synchronous so both server pages and the client app shell can render it.
 */
export function SiteHeader({
  variant = 'public',
  brandHref = '/',
  children,
  container = 'stepler-container',
}: SiteHeaderProps) {
  const app = variant === 'app';
  return (
    <header className={app ? 'border-b border-border bg-background' : undefined}>
      <div className={cn(container, 'flex h-14 items-center justify-between gap-3')}>
        <SiteWordmark href={brandHref} mark />
        {children}
      </div>
    </header>
  );
}
