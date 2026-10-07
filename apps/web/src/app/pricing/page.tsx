// Design pass (billing M2, Task 14; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). `/pricing`, public and server-rendered from `GET /billing/offers`:
// - owners decide on phones, so the page is one column there: the h1, one sentence on what a pack
//   is («один пакет — одна подія», paid once), the trial line, then the two pack cards and their
//   buttons within the first two screens; from `md` the cards sit side by side at a reading
//   width (≤ 880px), left-aligned with the header's wordmark like every other public page;
// - «Якщо потрібно більше» lists the extensions as plain lines with prices (they are bought
//   from the collection page, so no buttons here), then one muted line that subscriptions come
//   later (M3) and one about LiqPay and card data — the trust note sits where the money is;
// - signed out, the button says «Увійти, щоб купити» and goes to /login (magic links carry no
//   return path, slice 9 [P8]); signed in, «Обрати пакет» opens «Тариф і оплата» with the pack;
// - the API down or nothing on sale is said in one Alert, no empty cards (rule 18: no pay
//   buttons that cannot work). Amounts are Intl currency from minor units.
import { Alert } from '@stepler/ui/components/alert';
import { buttonVariants } from '@stepler/ui/components/button';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { fetchOffersServer, getSessionUser } from '@/api/server';
import { PackCard } from '@/billing/offer-card';
import { extensionOffer, formatMoney, packOffers } from '@/billing/offers';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { LanguageSwitch } from '@/i18n/language-switch';

const SIGN_IN_PATH = '/login';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing.pricing');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function PricingPage() {
  const locale = await getLocale();
  const [offers, user, t] = await Promise.all([
    fetchOffersServer(locale),
    getSessionUser(),
    getTranslations('billing.pricing'),
  ]);
  const signedIn = user !== null && user !== 'unavailable';
  // Signed out: sign in first (magic links carry no return path, slice 9 [P8]).
  const ctaHref = (code: string) =>
    signedIn ? `/app/billing?pack=${encodeURIComponent(code)}` : SIGN_IN_PATH;
  const packs = offers === null ? [] : packOffers(offers);
  const extras =
    offers === null
      ? []
      : [extensionOffer(offers, 'WINDOW'), extensionOffer(offers, 'RETENTION')].filter(
          (offer) => offer !== null,
        );
  const money = (amountMinor: number, currency: 'UAH' | 'EUR' | 'USD') =>
    formatMoney((value, options) => new Intl.NumberFormat(locale, options).format(value), {
      amountMinor,
      currency,
    });

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader>
        <LanguageSwitch variant="header" />
      </SiteHeader>
      <main className="stepler-container flex-1 pt-6 pb-16 sm:pt-10 lg:pt-14">
        <div className="grid max-w-[880px] gap-8 md:gap-10">
          <header className="grid gap-3">
            <h1 className="type-display text-balance">{t('title')}</h1>
            <p className="max-w-[56ch] type-body-lg text-pretty text-foreground-soft">
              {t('intro')}
            </p>
            <p className="max-w-[60ch] text-pretty text-muted-foreground">{t('trial')}</p>
          </header>

          <section aria-labelledby="packs-title" className="grid gap-4">
            <h2 id="packs-title" className="type-h2">
              {t('packsTitle')}
            </h2>
            {packs.length === 0 ? (
              <Alert variant="info" role="status">
                {t('unavailable')}
              </Alert>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {packs.map((pack) => (
                  <li key={pack.offer.id}>
                    <PackCard
                      pack={pack}
                      action={
                        <Link
                          href={ctaHref(pack.offer.code)}
                          className={buttonVariants({ className: 'w-full' })}
                        >
                          {signedIn ? t('choose') : t('signIn')}
                        </Link>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {packs.length === 0 ? null : (
            <section aria-labelledby="extras-title" className="grid gap-3">
              <h2 id="extras-title" className="type-h2">
                {t('extrasTitle')}
              </h2>
              <p className="text-muted-foreground">{t('extrasText')}</p>
              <ul className="grid gap-1.5 text-foreground-soft">
                {extras.map((extra) => (
                  <li key={extra.offer.id}>
                    {t('extraPrice', {
                      title: extra.offer.title,
                      price: money(extra.price.amountMinor, extra.price.currency),
                    })}
                  </li>
                ))}
                <li>{t('storageExtra')}</li>
              </ul>
            </section>
          )}

          <div className="grid gap-2 border-t pt-6 text-sm text-muted-foreground">
            <p>{t('subscriptionsSoon')}</p>
            <p>{t('paymentNote')}</p>
          </div>
        </div>
      </main>
      <SiteFooter onPricing />
    </div>
  );
}
