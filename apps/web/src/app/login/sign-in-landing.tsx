import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { getTranslations } from 'next-intl/server';
import { fetchAuthMethods } from '@/api/server';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { HowItWorks } from './how-it-works';
import { LandingClosingFrame, LandingSheet } from './landing-sheet';
import { LoginForm } from './login-form';

const CALLBACK_ERRORS = ['OAUTH_FAILED', 'ACCOUNT_BLOCKED'] as const;
type CallbackError = (typeof CALLBACK_ERRORS)[number];

function callbackError(value: unknown): CallbackError | null {
  return CALLBACK_ERRORS.find((code) => code === value) ?? null;
}

const SPACE = ' ';
const TITLE_LINES = ['one', 'two', 'three'] as const;
const BENEFITS = ['noApp', 'onePlace', 'original', 'control'] as const;

/** Space between the landing's sections. */
const SECTION = 'landing-container mt-16 lg:mt-24';

/**
 * The main page (`/`, `/login`), L2 «editorial split» (DESIGN-SYSTEM.md §6.9). Phones: the
 * promise, four frames, the sign-in panel (reachable in the first screen), one closing frame.
 * 640–1023: one 640px column with the large frame and the strip. From `lg`, a 12-column grid:
 * the promise and the sign-in panel in the left five, the contact sheet in the right seven. Then
 * why it is easy and how it works. The pencil loop on frame #003 is the page's load motion.
 */
export async function SignInLanding({ error }: { error?: unknown }) {
  const [methods, t, tl] = await Promise.all([
    fetchAuthMethods(),
    getTranslations('landing'),
    getTranslations('login'),
  ]);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader container="landing-container" />
      <main className="flex-1 pb-16 lg:pb-24">
        <div className="landing-container">
          <div className="grid gap-5 pt-2 [grid-template-areas:'intro'_'sheet'_'auth'_'closing'] sm:gap-6 sm:pt-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-10 lg:pt-6 lg:[grid-template-areas:'intro_intro_intro_intro_intro_sheet_sheet_sheet_sheet_sheet_sheet_sheet'_'auth_auth_auth_auth_auth_sheet_sheet_sheet_sheet_sheet_sheet_sheet']">
            <section className="grid gap-3 @container/intro [grid-area:intro] md:gap-5">
              {/* Three deliberate lines; the spaces keep the accessible name one sentence. From
                  `lg` the size follows the column, so the longest line fills it at any width. */}
              <h1 className="type-display lg:text-[min(5rem,11cqi)]">
                {TITLE_LINES.map((line, index) => (
                  <span key={line}>
                    {index > 0 ? SPACE : null}
                    <span className="block sm:whitespace-nowrap">{t(`titleLines.${line}`)}</span>
                  </span>
                ))}
              </h1>
              <p className="max-w-[46ch] type-body-lg text-pretty text-muted-foreground">
                {t('lede')}
              </p>
            </section>

            <LandingSheet className="[grid-area:sheet] lg:self-start" />

            <section className="[grid-area:auth] lg:self-end">
              <Panel className="w-full sm:max-w-[560px] lg:max-w-none">
                <PanelContent>
                  {methods === null ? (
                    <p role="alert">{tl('unavailable')}</p>
                  ) : (
                    <LoginForm
                      turnstileSiteKey={methods.turnstileSiteKey}
                      googleEnabled={methods.google}
                      initialError={callbackError(error)}
                    />
                  )}
                </PanelContent>
              </Panel>
            </section>

            <LandingClosingFrame className="[grid-area:closing]" />
          </div>
        </div>

        <section aria-labelledby="benefits-title" className={SECTION}>
          <h2 id="benefits-title" className="type-h2">
            {t('benefits.title')}
          </h2>
          <ul className="mt-6 grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:mt-8 xl:grid-cols-4">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="grid content-start gap-1.5 border-t pt-4">
                <h3 className="type-h3">{t(`benefits.items.${benefit}.title`)}</h3>
                <p className="max-w-[40ch] text-pretty text-muted-foreground">
                  {t(`benefits.items.${benefit}.text`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <HowItWorks className={SECTION} />
      </main>
      <SiteFooter container="landing-container" />
    </div>
  );
}
