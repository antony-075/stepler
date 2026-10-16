import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { fetchAuthMethods } from '@/api/server';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { LanguageSwitch } from '@/i18n/language-switch';
import { GuestPhone, HowItWorks } from './how-it-works';
import { getWebEnv } from '@/env';
import { type CallbackError, LoginForm } from './login-form';

const CALLBACK_ERRORS: readonly CallbackError[] = [
  'OAUTH_FAILED',
  'ACCOUNT_BLOCKED',
  'LEGAL_ACCEPTANCE_REQUIRED',
  'LEGAL_VERSION_OUTDATED',
];

function callbackError(value: unknown): CallbackError | null {
  return CALLBACK_ERRORS.find((code) => code === value) ?? null;
}

/**
 * The sign-in page (`/login`; it was also `/` until the marketing landing, src/landing). Owner review 2026-10-03: calm and focused, less text. One
 * headline with a one-line subline, the sign-in panel, «Як це працює» as three short lines, and
 * the owner's picture of the guest page with the one handwritten note and pencil arrow. No
 * benefit list, no facts row.
 * - Phones: headline, subline, panel (the email field in the first screen), the steps, the phone.
 * - 768–1279: headline + subline beside the panel; the phone and the steps under them, side by side.
 * - ≥ 1280: three columns: headline, subline and steps; the phone; the panel. Wide screens grow
 *   the margins (content at most 1240px, 1320px from 1600px), not the line length; tall screens
 *   centre the block vertically, with the footer kept at the bottom.
 */
export async function SignInLanding({ error }: { error?: unknown }) {
  const [methods, t, tl] = await Promise.all([
    fetchAuthMethods(),
    getTranslations('landing'),
    getTranslations('login'),
  ]);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader>
        <div className="flex items-center gap-3">
          {/* From `sm`: at 320–639px the header holds the wordmark and the language only; the
              footer carries «Тарифи» there. */}
          <Link
            href="/pricing"
            className={cn(
              'hidden min-h-11 items-center rounded-control px-2 text-sm font-medium text-foreground-soft no-underline hover:text-foreground sm:inline-flex',
              focusRing,
            )}
          >
            {t('pricingLink')}
          </Link>
          <LanguageSwitch variant="header" />
        </div>
      </SiteHeader>
      {/* The block sits in the middle of the window's height on big and tall screens (owner
          2026-10-06: not stuck to the top over an empty half), the footer at the bottom. */}
      <main className="flex flex-1 flex-col justify-center pt-4 pb-16 sm:pt-10 lg:py-16 xl:py-20">
        <div className="stepler-container grid gap-x-10 gap-y-10 [grid-template-areas:'intro'_'auth'_'how'_'phone'] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-y-16 md:[grid-template-areas:'intro_auth'_'phone_how'] xl:grid-cols-[minmax(0,1fr)_300px_400px] xl:grid-rows-[auto_1fr] xl:gap-x-16 xl:gap-y-12 xl:[grid-template-areas:'intro_phone_auth'_'how_phone_auth']">
          <section className="grid content-start gap-4 [grid-area:intro] md:gap-5">
            <h1 className="type-display text-balance">{t('title')}</h1>
            <p className="max-w-[46ch] type-body-lg text-pretty text-muted-foreground">
              {t('subline')}
            </p>
          </section>

          <section className="[grid-area:auth]">
            <Panel className="w-full md:sticky md:top-6">
              <PanelContent className="sm:p-8 xl:px-9 xl:py-10">
                {methods === null ? (
                  <p role="alert">{tl('unavailable')}</p>
                ) : (
                  <LoginForm
                    turnstileSiteKey={methods.turnstileSiteKey}
                    googleEnabled={methods.google}
                    initialError={callbackError(error)}
                    contactEmail={getWebEnv().LEGAL_CONTACT_EMAIL ?? null}
                  />
                )}
              </PanelContent>
            </Panel>
          </section>

          <HowItWorks className="[grid-area:how] md:self-center xl:self-start" />
          <GuestPhone className="[grid-area:phone] xl:self-start" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
