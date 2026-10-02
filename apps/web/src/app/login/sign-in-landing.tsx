import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { getTranslations } from 'next-intl/server';
import { fetchAuthMethods } from '@/api/server';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { LoginForm } from './login-form';
import { SignInSheet } from './sign-in-sheet';

const CALLBACK_ERRORS = ['OAUTH_FAILED', 'ACCOUNT_BLOCKED'] as const;
type CallbackError = (typeof CALLBACK_ERRORS)[number];

function callbackError(value: unknown): CallbackError | null {
  return CALLBACK_ERRORS.find((code) => code === value) ?? null;
}

/**
 * The main page in direction C (DESIGN-SYSTEM.md §6.9) on the flat light table. Phones: the
 * promise, the contact sheet, the sign-in panel. From `lg`: the promise and the sign-in panel on
 * the left, the sheet on the right. The pencil circling one frame is the page's only motion.
 */
export async function SignInLanding({ error }: { error?: unknown }) {
  const [methods, t, tl] = await Promise.all([
    fetchAuthMethods(),
    getTranslations('landing'),
    getTranslations('login'),
  ]);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="stepler-container flex-1">
        <div className="mx-auto grid max-w-[560px] grid-cols-1 gap-6 pt-4 pb-12 [grid-template-areas:'intro'_'visual'_'auth'] sm:gap-8 sm:pt-8 sm:pb-16 lg:max-w-none lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:[grid-template-rows:auto_1fr] lg:gap-x-[clamp(48px,6vw,112px)] lg:gap-y-10 lg:pt-14 lg:pb-20 lg:[grid-template-areas:'intro_visual'_'auth_visual']">
          <section className="grid gap-3 [grid-area:intro] md:gap-4">
            <h1 className="type-display max-w-[15ch]">{t('title')}</h1>
            <p className="max-w-[44ch] type-body-lg text-pretty text-muted-foreground">
              {t('lede')}
            </p>
          </section>

          <SignInSheet
            label={t('sheetLabel')}
            documentKind={t('documentKind')}
            className="[grid-area:visual] lg:self-start lg:pt-2"
          />

          <section className="[grid-area:auth]">
            <Panel className="w-full lg:max-w-md">
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
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
