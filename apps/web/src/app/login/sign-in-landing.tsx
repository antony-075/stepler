import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { TintTile } from '@stepler/ui/components/tint-tile';
import type { FrameTint } from '@stepler/ui/lib/frame-tints';
import { CalendarHeart, Images, LockKeyhole, Smartphone, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { fetchAuthMethods } from '@/api/server';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { HowItWorks } from './how-it-works';
import { LoginForm } from './login-form';

const CALLBACK_ERRORS = ['OAUTH_FAILED', 'ACCOUNT_BLOCKED'] as const;
type CallbackError = (typeof CALLBACK_ERRORS)[number];

function callbackError(value: unknown): CallbackError | null {
  return CALLBACK_ERRORS.find((code) => code === value) ?? null;
}

const SPACE = ' ';
const TITLE_LINES = ['one', 'two', 'three'] as const;

const BENEFITS = [
  { key: 'onePlace', Icon: Images, tint: 'lavender' },
  { key: 'noSignUp', Icon: Smartphone, tint: 'sand' },
  { key: 'control', Icon: LockKeyhole, tint: 'sky' },
  { key: 'anyEvent', Icon: CalendarHeart, tint: 'sage' },
] as const satisfies readonly { key: string; Icon: LucideIcon; tint: FrameTint }[];

// Plain facts about the product, not statistics: nothing here is a measured or invented number.
const FACTS = ['apps', 'qr', 'original'] as const;

/**
 * The main page (`/`, `/login`) after the owner's reference (2026-10-02). From `xl` three
 * columns: the promise with four benefits, «Як це працює» as one composition (labels, pencil
 * arrows, a collection card, the QR card, the owner's picture of the guest page), and the
 * sign-in panel; the three facts under the first two. 768–1279: the promise and the panel side by side, the
 * composition and the facts under them. Phones: the promise, the panel (its email field in the
 * first screen), the benefits, the composition, the facts. The arrows drawing once on load are
 * the page's only motion.
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
      <main className="flex-1 pb-16 lg:pb-20">
        <div className="landing-container grid gap-x-10 gap-y-8 pt-2 [grid-template-areas:'intro'_'auth'_'benefits'_'how'_'facts'] sm:pt-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-y-10 md:[grid-template-areas:'intro_auth'_'benefits_auth'_'how_how'_'facts_facts'] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.95fr)] xl:gap-x-12 xl:pt-8 xl:[grid-template-areas:'intro_how_auth'_'benefits_how_auth'_'facts_facts_auth'] 2xl:gap-x-16">
          <section className="grid content-start gap-4 @container/intro [grid-area:intro] md:gap-5">
            {/* Three deliberate lines; the spaces keep the accessible name one sentence. The size
                follows the column from `md`, so the longest line fills it at any width. */}
            <h1 className="type-display md:text-[min(4.5rem,12.5cqi)]">
              {TITLE_LINES.map((line, index) => (
                <span key={line}>
                  {index > 0 ? SPACE : null}
                  <span className="block sm:whitespace-nowrap">{t(`titleLines.${line}`)}</span>
                </span>
              ))}
            </h1>
            <p className="max-w-[44ch] type-body-lg text-pretty text-muted-foreground">
              {t('lede')}
            </p>
          </section>

          <section className="[grid-area:auth]">
            <Panel className="w-full md:sticky md:top-6">
              <PanelContent className="sm:p-8 md:p-6 lg:p-8 xl:px-10 xl:py-12">
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

          <section aria-labelledby="benefits-title" className="[grid-area:benefits]">
            <h2 id="benefits-title" className="sr-only">
              {t('benefits.title')}
            </h2>
            <ul className="grid gap-5 sm:grid-cols-2 sm:gap-x-8 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-1">
              {BENEFITS.map(({ key, Icon, tint }) => (
                <li key={key} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4">
                  <TintTile tint={tint} size="sm" className="[&_svg]:size-5">
                    <Icon strokeWidth={1.75} />
                  </TintTile>
                  <div className="grid gap-0.5">
                    <h3 className="type-h3">{t(`benefits.items.${key}.title`)}</h3>
                    <p className="max-w-[40ch] text-sm leading-[1.45] text-pretty text-muted-foreground">
                      {t(`benefits.items.${key}.text`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <HowItWorks className="w-full max-w-[560px] justify-self-center [grid-area:how] xl:max-w-none xl:self-center" />

          <section aria-labelledby="facts-title" className="[grid-area:facts]">
            <h2 id="facts-title" className="sr-only">
              {t('facts.title')}
            </h2>
            <ul className="grid gap-4 border-t pt-6 sm:grid-cols-3 sm:gap-0 sm:divide-x">
              {FACTS.map((fact) => (
                <li key={fact} className="grid content-start gap-1 sm:px-6 sm:first:pl-0">
                  <span className="type-h2 tabular-nums">{t(`facts.items.${fact}.value`)}</span>
                  <span className="text-sm text-muted-foreground">
                    {t(`facts.items.${fact}.text`)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <SiteFooter container="landing-container" />
    </div>
  );
}
