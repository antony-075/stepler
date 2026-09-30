import { Card, CardContent } from '@stepler/ui/components/card';
import { StapledStack } from '@stepler/ui/components/stapled-stack';
import { getTranslations } from 'next-intl/server';
import { fetchAuthMethods } from '@/api/server';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { LoginForm } from './login-form';

const CALLBACK_ERRORS = ['OAUTH_FAILED', 'ACCOUNT_BLOCKED'] as const;
type CallbackError = (typeof CALLBACK_ERRORS)[number];

function callbackError(value: unknown): CallbackError | null {
  return CALLBACK_ERRORS.find((code) => code === value) ?? null;
}

/**
 * The main page (design v4): the promise and the stapled pile of moments on one side, the
 * sign-in card on the other. On phones the card comes right after the headline.
 */
export async function SignInLanding({ error }: { error?: unknown }) {
  const [methods, t, tl] = await Promise.all([
    fetchAuthMethods(),
    getTranslations('landing'),
    getTranslations('login'),
  ]);
  return (
    <div className="stepler-atmosphere flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="stepler-container flex-1">
        <div className="mx-auto grid max-w-[620px] grid-cols-1 gap-5 pt-2 pb-10 [grid-template-areas:'intro'_'auth'_'visual'] sm:gap-7 sm:pt-6 sm:pb-14 lg:max-w-none lg:min-h-[calc(100dvh-180px)] lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,440px)] lg:[grid-template-rows:auto_1fr] lg:gap-x-[clamp(40px,6vw,96px)] lg:gap-y-8 lg:pt-8 lg:pb-18 lg:[grid-template-areas:'intro_auth'_'visual_auth']">
          <section className="[grid-area:intro]">
            <h1 className="mb-3 max-w-[16ch] font-display text-[clamp(1.625rem,1.05rem+2.9vw,3.6rem)] leading-[1.1] font-medium tracking-[-0.02em] text-balance">
              {t('title')}
            </h1>
            <p className="max-w-[44ch] text-muted-foreground text-pretty sm:text-lg">{t('lede')}</p>
          </section>

          <section className="[grid-area:auth] lg:self-center">
            <Card className="animate-in duration-300 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
              <CardContent>
                {methods === null ? (
                  <p role="alert">{tl('unavailable')}</p>
                ) : (
                  <LoginForm
                    turnstileSiteKey={methods.turnstileSiteKey}
                    googleEnabled={methods.google}
                    initialError={callbackError(error)}
                  />
                )}
              </CardContent>
            </Card>
          </section>

          <StapledStack
            // Bleeds into the page gutter so the horizontal clip does not cut tile shadows: the
            // negative margin and padding use <main>'s container gutter, so they stay in step with
            // it. On desktop the column has room, so the fly-in is left unclipped there.
            className="-mx-(--stepler-gutter) px-(--stepler-gutter) [grid-area:visual] lg:mx-0 lg:justify-start lg:overflow-x-visible lg:px-0"
            label={t('stackLabel')}
            photoCaption={t('photoCaption')}
            videoCaption={t('videoCaption')}
            videoDuration={t('videoDuration')}
            documentKind={t('documentKind')}
            documentTitle={t('documentTitle')}
            note={t('note')}
            noteAuthor={t('noteAuthor')}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
