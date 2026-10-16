import { buttonVariants } from '@stepler/ui/components/button';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SiteWordmark } from '@/components/site-header';
import { LanguageSwitch } from '@/i18n/language-switch';
import { MobileMenu } from './mobile-menu';
import { SectionNav } from './section-nav';
import { ROUTE } from './sections';

const NAV_LINK = cn(
  'inline-flex min-h-10 items-center rounded-control px-2.5 text-sm font-medium text-foreground-soft no-underline transition-colors duration-(--duration-fast) hover:text-foreground motion-reduce:transition-none',
  focusRing,
);

/**
 * The landing's header: sticky (56px, a hairline under it), so the anchors and the trial stay a
 * tap away; sections keep `scroll-mt-20`, so a jump never hides a heading under it.
 * Slightly translucent with a blur, so the page shows through as it scrolls under it.
 * - From 1024px: the logo, the five anchors (the one being read marked), then «Мова», «Увійти» and
 *   the trial button; signed in (on /pricing), one «Відкрити Stepler» instead.
 * - Below: the logo, the trial button from 640px, and «Меню» (the anchors, sign-in, the trial and
 *   the language in a sheet).
 * `onLanding: false` (/pricing): the anchors lead back to the landing's sections.
 */
export function LandingHeader({
  onLanding = true,
  signedIn = false,
}: {
  onLanding?: boolean;
  signedIn?: boolean;
}) {
  const t = useTranslations('home');
  return (
    <header className="sticky top-0 z-(--z-sticky) border-b border-border/70 bg-card/80 backdrop-blur-xl backdrop-saturate-150">
      <a
        href="#main"
        className={cn(
          'sr-only rounded-control bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-(--z-skip)',
          focusRing,
        )}
      >
        {t('skip')}
      </a>
      <div className="stepler-container flex h-14 items-center gap-3">
        <SiteWordmark />
        <SectionNav onLanding={onLanding} />
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden lg:block">
            <LanguageSwitch variant="header" />
          </div>
          {signedIn ? (
            <Link href={ROUTE.app} className={cn(buttonVariants(), 'hidden sm:inline-flex')}>
              {t('nav.openApp')}
            </Link>
          ) : (
            <>
              <Link href={ROUTE.login} className={cn(NAV_LINK, 'hidden lg:inline-flex')}>
                {t('nav.login')}
              </Link>
              <Link
                href={ROUTE.register}
                className={cn(buttonVariants(), 'landing-cta hidden sm:inline-flex')}
              >
                {t('nav.trial')}
              </Link>
            </>
          )}
          <MobileMenu onLanding={onLanding} signedIn={signedIn} />
        </div>
      </div>
    </header>
  );
}
