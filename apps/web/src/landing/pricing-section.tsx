import type { OfferList } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { buttonVariants } from '@stepler/ui/components/button';
import { cn } from '@stepler/ui/lib/utils';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { offerButtonClass, PackCard, PlanCard } from '@/billing/offer-card';
import { extensionOffer, formatMoney, languageCurrency, packOffers } from '@/billing/offers';
import { PricingPlans } from '@/billing/pricing-plans';
import { GROUP_NOTE, GROUP_TITLE } from '@/billing/surfaces';
import { ROUTE, SECTION, SECTION_SCROLL } from './sections';
import { SectionHeading } from './section-heading';

const TRIAL_FACTS = ['days', 'collections', 'storage', 'card'] as const;
/** The trial's button: the offer cards' 52px, filled (it is the page's goal). */
const TRIAL_BUTTON =
  'landing-cta h-13 w-full rounded-[0.875rem] text-base md:pointer-fine:h-13 md:pointer-fine:text-base';
const bold = (chunks: ReactNode): ReactElement => <b className="font-semibold">{chunks}</b>;
/** Every offer card lifts a little under the pointer. */
const CARD_HOVER =
  'h-full transition-transform duration-300 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0';

/**
 * The prices, on the landing (`#pricing`) and as the /pricing page (`asPage`: the h1, no anchor).
 * They come from the API (`GET /billing/offers`, the operator's catalogue), never from the page.
 * Two groups a visitor tells apart at a glance:
 * - «Одне свято»: the free trial first (what a visitor starts with), the packs beside it (paid
 *   once), then what can be added later as quiet chips;
 * - the subscriptions for those who organise often, with their own monthly/yearly and currency
 *   controls (the same cards as «Тариф і оплата»).
 * The API down or nothing on sale is one Alert, never empty cards. Signed out, packs and plans
 * ask to sign in first and the trial goes to registration; signed in, they open «Тариф і оплата».
 */
export async function PricingSection({
  offers,
  locale,
  signedIn = false,
  asPage = false,
}: {
  offers: OfferList | null;
  locale: string;
  signedIn?: boolean;
  asPage?: boolean;
}) {
  const [t, tPricing, tPlans] = await Promise.all([
    getTranslations('home.pricing'),
    getTranslations('billing.pricing'),
    getTranslations('billing.plans'),
  ]);
  const currency = languageCurrency(locale);
  const packs = offers === null ? [] : packOffers(offers, currency);
  const extras =
    offers === null
      ? []
      : [
          extensionOffer(offers, 'WINDOW', currency),
          extensionOffer(offers, 'RETENTION', currency),
        ].filter((offer) => offer !== null);
  const money = (amountMinor: number, moneyCurrency: 'UAH' | 'EUR' | 'USD') =>
    formatMoney((value, options) => new Intl.NumberFormat(locale, options).format(value), {
      amountMinor,
      currency: moneyCurrency,
    });
  const Group = asPage ? 'h2' : 'h3';
  const packHref = (code: string) =>
    signedIn ? `/app/billing?pack=${encodeURIComponent(code)}` : ROUTE.login;

  return (
    <section
      id={asPage ? undefined : SECTION.pricing}
      aria-labelledby="pricing-title"
      className={cn(
        SECTION_SCROLL,
        'bg-[linear-gradient(180deg,var(--background),var(--card))] py-20 lg:py-28',
      )}
    >
      <div className="stepler-container grid gap-16">
        {asPage ? (
          <div data-reveal className="grid max-w-[44rem] gap-4">
            <h1
              id="pricing-title"
              className="text-[clamp(2.5rem,1.5rem+3.4vw,4.25rem)] leading-[1.02] font-[700] tracking-[-0.035em] text-balance"
            >
              {t('title')}
            </h1>
            <p className="max-w-[52ch] text-lg leading-relaxed text-pretty text-foreground-soft">
              {t('intro')}
            </p>
          </div>
        ) : (
          <SectionHeading id="pricing-title" title={t('title')} intro={t('intro')} />
        )}

        <div className="grid gap-6">
          <div data-reveal className="grid gap-1">
            <Group className={GROUP_TITLE}>{t('once.title')}</Group>
            <p className={GROUP_NOTE}>{t('once.text')}</p>
          </div>
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {signedIn ? null : (
              <li data-reveal className={CARD_HOVER}>
                <PlanCard
                  testId="trial"
                  title={t('trial.title')}
                  price={t('trial.price')}
                  unit={t('trial.unit')}
                  chargeNote={t('trial.note')}
                  facts={TRIAL_FACTS.map((key) => t.rich(`trial.facts.${key}`, { b: bold }))}
                  action={
                    <Link href={ROUTE.register} className={cn(buttonVariants(), TRIAL_BUTTON)}>
                      {t('trial.cta')}
                    </Link>
                  }
                />
              </li>
            )}
            {packs.map((pack, index) => (
              <li
                key={pack.offer.id}
                data-reveal
                style={{ '--reveal-i': index + 1 } as CSSProperties}
                className={CARD_HOVER}
              >
                <PackCard
                  pack={pack}
                  action={
                    <Link
                      href={packHref(pack.offer.code)}
                      className={cn(buttonVariants(), offerButtonClass(pack.offer.highlighted))}
                    >
                      {signedIn ? tPricing('choose') : tPricing('signIn')}
                    </Link>
                  }
                />
              </li>
            ))}
          </ul>
          {offers === null || packs.length === 0 ? (
            <Alert variant="info" role="status">
              {tPricing('unavailable')}
            </Alert>
          ) : (
            <div data-reveal className="flex flex-wrap items-center gap-2 pt-2">
              <p className="mr-2 font-medium">{t('extras')}</p>
              {extras.map((extra) => (
                <p
                  key={extra.offer.id}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm text-foreground-soft"
                >
                  <Plus aria-hidden="true" className="size-3.5 text-link" />
                  {tPricing('extraPrice', {
                    title: extra.offer.title,
                    price:
                      extra.display.currency === extra.price.currency
                        ? money(extra.price.amountMinor, extra.price.currency)
                        : tPlans('approxPrice', {
                            price: money(extra.display.amountMinor, extra.display.currency),
                          }),
                  })}
                </p>
              ))}
              <p className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm text-foreground-soft">
                <Plus aria-hidden="true" className="size-3.5 text-link" />
                {tPricing('storageExtra')}
              </p>
            </div>
          )}
        </div>

        {offers === null ? null : (
          <div data-reveal>
            <PricingPlans offers={offers} signedIn={signedIn} titleAs={Group} />
          </div>
        )}

        <div className="grid gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex sm:items-center sm:justify-between">
          <p>{tPricing('paymentNote')}</p>
          {asPage ? null : (
            <Link
              href={ROUTE.pricing}
              className="font-medium text-link underline-offset-4 hover:underline"
            >
              {t('more')}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
