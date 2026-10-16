import { cn } from '@stepler/ui/lib/utils';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/i18n/language-switch';
import { LegalLinks } from '@/legal/legal-links';
import { AuthWelcome } from './auth-welcome';
import { SiteWordmark } from './site-header';

/** Which page the shell frames. */
export type AuthVariant = 'login' | 'register' | 'step';

/**
 * The form's card: white, a 28px radius, a hairline and a soft deep shadow, on the landing's
 * ground. Its headings are set larger than the forms' own `type-h2` (owner 2026-10-16: the title
 * and the line under it a little bigger), one rule for every account page.
 */
const CARD = cn(
  'landing-rise w-full min-w-0 rounded-[1.75rem] border border-border bg-card p-5 shadow-[0_40px_80px_-40px_rgb(24_24_27/0.35)] sm:p-10',
  '[&_h1]:text-[clamp(1.625rem,1.35rem+0.9vw,2rem)] [&_h1]:leading-tight [&_h1]:font-[700] [&_h1]:tracking-[-0.025em]',
  '[&_h1+p]:text-[1.0625rem] [&_h1+p]:leading-relaxed',
);

/**
 * Sign-in, registration and the other account steps in the landing's look (owner 2026-10-16).
 * - Registration: the form's half on the left, a welcome on the whole right half (its full
 *   height and width, `AuthWelcome`); sign-in the other way round. From 1024px the dark welcome
 *   is rounded on the corners that face the form; the light half runs edge to edge (owner
 *   2026-10-17). The form's half is the
 *   landing's light ground with the form in a card centred on it, the logo and the language at
 *   its top, the legal documents at its bottom. Phones and tablets: the form's half alone.
 * - Every other step (forgot / reset password, confirm the e-mail, accept the terms): nothing
 *   but the form, in the same card centred on the ground.
 * The header has no «Увійти» / «Зареєструватися»: each form links to the other itself.
 * Synchronous (next-intl's sync hooks), so every page renders it.
 */
export function AuthPage({
  children,
  variant = 'step',
}: {
  children: ReactNode;
  variant?: AuthVariant;
}) {
  const locale = useLocale();
  const form = (
    <div className="landing-hero-ground relative isolate flex min-h-dvh min-w-0 flex-col">
      <AuthHeader />
      <main className="grid flex-1 place-items-center px-4 py-8 sm:px-8 sm:py-12">
        <div
          data-slot="auth-card"
          className={cn(CARD, variant === 'step' ? 'max-w-[28rem]' : 'max-w-[28.5rem]')}
        >
          {children}
        </div>
      </main>
      <AuthFooter />
    </div>
  );
  if (variant === 'step') return <div className="landing">{form}</div>;
  return (
    <div className="landing grid min-h-dvh bg-card lg:grid-cols-2">
      <div className={cn('min-w-0', variant === 'login' && 'lg:order-2')}>{form}</div>
      <AuthWelcome
        page={variant}
        locale={locale}
        className={variant === 'login' ? 'lg:rounded-r-[1.25rem]' : 'lg:rounded-l-[1.25rem]'}
      />
    </div>
  );
}

function AuthHeader() {
  return (
    <header>
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
        <SiteWordmark />
        <LanguageSwitch variant="header" />
      </div>
    </header>
  );
}

function AuthFooter() {
  const tBrand = useTranslations('brand');
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-6 px-4 text-sm text-muted-foreground sm:px-8">
      <p className="py-3">{tBrand('copyright', { year: new Date().getFullYear() })}</p>
      <LegalLinks variant="footer" />
    </footer>
  );
}
