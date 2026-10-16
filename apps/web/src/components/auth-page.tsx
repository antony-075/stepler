import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Check } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/i18n/language-switch';
import { CLOSING_FRAMES, PHOTO_QUALITY } from '@/landing/photos';
import { SiteWordmark } from './site-header';
import { LegalLinks } from '@/legal/legal-links';

/** Which page the shell frames: its own words beside the form, and the link in the header. */
export type AuthVariant = 'login' | 'register' | 'step';

const POINTS = ['noApp', 'quality', 'control'] as const;
/** The photos are decorative: the panel's heading says what it is about. */
const DECORATIVE = '';
/** The middle column sits a little lower, so the six read as a loose collection. */
const OFFSET = 'translate-y-5';

/**
 * Sign-in, registration and the other account steps (/login, /register, /forgot-password,
 * /reset-password, /auth/verify, /accept-terms) in the landing's look (owner 2026-10-16): the
 * landing's ground (a faint grid of dots and two soft lights), one white card with the form and,
 * from 1024px, the Stepler-blue panel of the landing's closing block beside it (a small
 * collection of event photos, one line in the page's own words, three short promises). Phones
 * and tablets: the card alone, full width, the panel left out (the form is the task).
 * - Header: the logo (to the landing), the language and, from 640px, the way to the other card
 *   («Увійти» on registration, «Зареєструватися» on sign-in; on phones the card's own link does
 *   it); the steps carry the language only.
 * - Footer: the legal documents and the copyright, quiet.
 * The card is top-aligned, not centred: a centred card jumps when its content changes height.
 * Synchronous (next-intl's sync hooks), so every page renders it.
 */
export function AuthPage({
  children,
  variant = 'step',
}: {
  children: ReactNode;
  variant?: AuthVariant;
}) {
  const t = useTranslations('authPage');
  const tBrand = useTranslations('brand');
  const other =
    variant === 'login'
      ? { href: '/register', label: t('toRegister') }
      : variant === 'register'
        ? { href: '/login', label: t('toLogin') }
        : null;
  return (
    <div className="landing flex min-h-dvh flex-col">
      <div className="landing-hero-ground relative isolate flex flex-1 flex-col">
        <header>
          <div className="stepler-container flex h-14 items-center justify-between gap-3">
            <SiteWordmark mark />
            <div className="flex items-center gap-2">
              {other === null ? null : (
                <Link
                  href={other.href}
                  className={cn(
                    'hidden min-h-10 items-center rounded-control px-2.5 text-sm font-medium text-foreground-soft no-underline hover:text-foreground sm:inline-flex',
                    focusRing,
                  )}
                >
                  {other.label}
                </Link>
              )}
              <LanguageSwitch variant="header" />
            </div>
          </div>
        </header>
        <main className="stepler-container flex-1 pt-4 pb-16 sm:pt-8 lg:pt-12 lg:pb-24">
          <div className="mx-auto grid max-w-[30rem] grid-cols-1 items-start gap-8 lg:max-w-none lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:gap-10 xl:gap-16">
            <div
              data-slot="auth-card"
              className="landing-rise min-w-0 rounded-[1.75rem] border border-border bg-card p-5 shadow-[0_30px_60px_-30px_rgb(24_24_27/0.3)] sm:p-9"
            >
              {children}
            </div>
            <aside
              aria-label={t(`${variant}.title`)}
              className="landing-phone-rise relative hidden overflow-hidden rounded-[1.75rem] bg-(--brand-blue) p-10 text-white lg:grid lg:min-h-[36rem] lg:content-between xl:p-14"
            >
              <ul aria-hidden="true" className="grid grid-cols-3 gap-2.5 pb-5">
                {CLOSING_FRAMES.map((photo, i) => (
                  <li
                    key={photo.src}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-xl bg-white/10',
                      i % 3 === 1 && OFFSET,
                    )}
                  >
                    <Image
                      src={photo}
                      alt={DECORATIVE}
                      fill
                      quality={PHOTO_QUALITY}
                      sizes="200px"
                      className="object-cover"
                    />
                  </li>
                ))}
              </ul>
              <div className="grid gap-5 pt-10">
                <p className="max-w-[18ch] text-[clamp(1.75rem,1.2rem+1.6vw,2.5rem)] leading-[1.08] font-[680] tracking-[-0.03em] text-balance">
                  {t(`${variant}.title`)}
                </p>
                <p className="max-w-[40ch] text-lg leading-relaxed text-pretty text-white/85">
                  {t(`${variant}.text`)}
                </p>
                <ul className="grid gap-2.5 pt-1">
                  {POINTS.map((key) => (
                    <li key={key} className="flex items-center gap-2.5 text-white/90">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/15">
                        <Check aria-hidden="true" className="size-3.5" />
                      </span>
                      {t(`points.${key}`)}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </main>
      </div>
      <footer className="border-t border-border bg-background">
        <div className="stepler-container flex flex-wrap items-center justify-between gap-x-6 text-sm text-muted-foreground">
          <p className="py-3">{tBrand('copyright', { year: new Date().getFullYear() })}</p>
          <LegalLinks variant="footer" />
        </div>
      </footer>
    </div>
  );
}
