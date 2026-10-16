// Design pass (owner remarks 2026-10-16: «Страница прайсинг корявая»; frontend-design,
// ui-ux-pro-max, web-design-guidelines, responsive-design). `/pricing` is the landing's prices as
// a page of their own, in the landing's look: the same header (its anchors lead back to the
// landing's sections) and footer, the h1 and one line, the free trial and the packs for one event,
// what can be added later, the subscriptions with their period and currency controls, the
// questions about money, and the closing invitation for visitors who have no account yet.
// Signed in, the header offers «Відкрити Stepler», the trial card and the closing block are left
// out, and «Обрати пакет» / «Оформити» open «Тариф і оплата». Server-rendered from
// `GET /billing/offers`; the API down or nothing on sale is said in one Alert, no empty cards.
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { fetchOffersServer, getSessionUser } from '@/api/server';
import { getWebEnv } from '@/env';
import { Faq, PRICING_FAQ } from '@/landing/faq';
import { FinalCta } from '@/landing/final-cta';
import { LandingFooter } from '@/landing/landing-footer';
import { LandingHeader } from '@/landing/landing-header';
import { PricingSection } from '@/landing/pricing-section';
import { Reveal } from '@/landing/reveal';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing.pricing');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function PricingPage() {
  const locale = await getLocale();
  const [offers, user] = await Promise.all([fetchOffersServer(locale), getSessionUser()]);
  const signedIn = user !== null && user !== 'unavailable';
  return (
    <div className="landing flex min-h-dvh flex-col bg-card">
      <LandingHeader onLanding={false} signedIn={signedIn} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PricingSection offers={offers} locale={locale} signedIn={signedIn} asPage />
        <Faq keys={PRICING_FAQ} />
        {signedIn ? null : <FinalCta />}
      </main>
      <Reveal />
      <LandingFooter contactEmail={getWebEnv().LEGAL_CONTACT_EMAIL ?? null} onLanding={false} />
    </div>
  );
}
