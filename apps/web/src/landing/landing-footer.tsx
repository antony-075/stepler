import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteWordmark } from '@/components/site-header';
import { LanguageSwitch } from '@/i18n/language-switch';
import { LegalLinks } from '@/legal/legal-links';
import { NAV_SECTIONS, ROUTE, sectionHref } from './sections';

const LINK = cn(
  'inline-flex min-h-11 items-center rounded-control text-foreground-soft no-underline underline-offset-4 hover:text-foreground hover:underline',
  focusRing,
);

/**
 * The landing's footer: the logo and the one-line description, the anchors, the product routes,
 * the legal documents (each page says itself whether it is still a draft), the contact address
 * when one is configured, the language, and the copyright with the current year.
 */
export async function LandingFooter({
  contactEmail,
  onLanding = true,
}: {
  contactEmail: string | null;
  /** /pricing: the anchors lead back to the landing (`/#how`). */
  onLanding?: boolean;
}) {
  const [t, tNav, tBrand] = await Promise.all([
    getTranslations('home.footer'),
    getTranslations('home.nav'),
    getTranslations('brand'),
  ]);
  return (
    <footer className="border-t border-border bg-background">
      <div className="stepler-container grid gap-10 py-14 md:grid-cols-[minmax(0,5fr)_repeat(2,minmax(0,2fr))] lg:gap-16">
        <div className="grid content-start gap-3">
          <SiteWordmark />
          <p className="max-w-[36ch] text-pretty text-foreground-soft">{t('description')}</p>
          {contactEmail === null ? null : (
            <div className="grid pt-2 text-sm">
              <p className="text-muted-foreground">{t('contact')}</p>
              <a href={`mailto:${contactEmail}`} className={cn(LINK, 'text-link')}>
                {contactEmail}
              </a>
            </div>
          )}
        </div>
        <nav aria-label={t('sections')}>
          <p className="pb-2 text-sm font-semibold">{t('sections')}</p>
          <ul>
            {NAV_SECTIONS.map((key) => (
              <li key={key}>
                <a href={sectionHref(key, onLanding)} className={LINK}>
                  {tNav(key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t('product')}>
          <p className="pb-2 text-sm font-semibold">{t('product')}</p>
          <ul>
            <li>
              <Link href={ROUTE.register} className={LINK}>
                {tNav('register')}
              </Link>
            </li>
            <li>
              <Link href={ROUTE.login} className={LINK}>
                {tNav('login')}
              </Link>
            </li>
            <li>
              <Link href={ROUTE.pricing} className={LINK}>
                {tNav('pricing')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="stepler-container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 text-sm text-muted-foreground">
          <p className="py-2.5">{tBrand('copyright', { year: new Date().getFullYear() })}</p>
          <div className="flex flex-wrap items-center gap-x-6">
            <LegalLinks variant="footer" />
            <LanguageSwitch variant="header" />
          </div>
        </div>
      </div>
    </footer>
  );
}
