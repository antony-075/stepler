import { getLocale } from 'next-intl/server';
import { fetchOffersServer } from '@/api/server';
import { getWebEnv } from '@/env';
import { Benefits } from './benefits';
import { Faq } from './faq';
import { FinalCta } from './final-cta';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { LandingFooter } from './landing-footer';
import { LandingHeader } from './landing-header';
import { Privacy } from './privacy';
import { PricingSection } from './pricing-section';
import { ProductDemo } from './product-demo';
import { screenLocale } from './screens';
import { TemplatesSection } from './templates-section';
import { Reveal } from './reveal';
import { UseCases } from './use-cases';

/**
 * The marketing landing at `/` for signed-out visitors (signed in, `/` opens the app). One goal:
 * start the free trial (`/register`). The order follows how a visitor comes to trust it: what it
 * is (hero), how it works for both sides, the real product (video and steps), the guest page
 * templates, why it is better than chats, the occasions, privacy, prices, questions, and the
 * invitation again at the end. Sections alternate white and the page grey so each reads as one.
 * Server-rendered; only the menu, the steps, the template tabs and the video player hydrate.
 */
export async function LandingPage() {
  const locale = await getLocale();
  const offers = await fetchOffersServer(locale);
  const screens = screenLocale(locale);
  return (
    <div className="landing flex min-h-dvh flex-col bg-card">
      <LandingHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Hero locale={screens} />
        <HowItWorks />
        <ProductDemo locale={screens} />
        <TemplatesSection locale={screens} />
        <Benefits locale={screens} />
        <UseCases />
        <Privacy />
        <PricingSection offers={offers} locale={locale} />
        <Faq />
        <FinalCta />
      </main>
      <Reveal />
      <LandingFooter contactEmail={getWebEnv().LEGAL_CONTACT_EMAIL ?? null} />
    </div>
  );
}
