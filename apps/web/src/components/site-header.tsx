import { BrandMark } from '@stepler/ui/components/brand-mark';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/i18n/language-switch';
import { ThemeSwitch } from '@/theme/theme-switch';

/**
 * Brand link on the left; tools on the right: `children` (e.g. sign out in the app shell), or
 * the language and theme switches on public pages. Synchronous so both server pages and the
 * client app shell can render it.
 */
export function SiteHeader({ children }: { children?: ReactNode }) {
  const t = useTranslations('brand');
  return (
    <header className="py-3 lg:py-5">
      <div className="stepler-container flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg text-foreground no-underline"
        >
          <BrandMark className="shrink-0" />
          {/* Below 400px the language and theme switches need the room: the mark alone shows,
              and the name stays in the link's accessible name. Task 11's one-button theme switch
              on phones can bring the wordmark back. */}
          <span className="font-display text-lg font-semibold tracking-tight lowercase max-[399px]:sr-only">
            {t('name')}
          </span>
        </Link>
        {children ?? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSwitch />
            <ThemeSwitch />
          </div>
        )}
      </div>
    </header>
  );
}
