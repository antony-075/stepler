import { focusRingInset } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SECTION, SECTION_SCROLL } from './sections';
import { SectionHeading } from './section-heading';

export const FAQ_KEYS = [
  'noAccount',
  'access',
  'files',
  'compression',
  'visibility',
  'revoke',
  'manage',
  'retention',
  'expired',
  'trial',
  'packOrPlan',
  'payment',
  'events',
] as const;

/**
 * The questions as native disclosures (`<details>`/`<summary>`): a button to assistive tech with
 * its expanded state, Enter and Space toggle it, it works without JavaScript, and the browser's
 * find-in-page opens a closed answer. Several can be open at once. The «+» turns into «×» when open
 * (not under reduced motion it just switches). From 1024px the heading stays beside the list.
 */
export type FaqKey = (typeof FAQ_KEYS)[number];

/** The questions about money, for /pricing. */
export const PRICING_FAQ: readonly FaqKey[] = [
  'trial',
  'packOrPlan',
  'retention',
  'expired',
  'payment',
];

export async function Faq({ keys = FAQ_KEYS }: { keys?: readonly FaqKey[] }) {
  const t = await getTranslations('home.faq');
  return (
    <section
      id={SECTION.faq}
      aria-labelledby="faq-title"
      className={cn(SECTION_SCROLL, 'bg-card py-20 lg:py-28')}
    >
      <div className="stepler-container grid gap-x-20 gap-y-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <SectionHeading
          id="faq-title"
          title={t('title')}
          intro={t('intro')}
          className="content-start lg:sticky lg:top-24 lg:self-start"
        />
        <div data-reveal className="divide-y divide-border border-y border-border">
          {keys.map((key) => (
            <details key={key} className="landing-faq group">
              <summary
                className={cn(
                  'flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 rounded-control py-4 text-left text-lg font-semibold transition-colors duration-(--duration-base) hover:text-link group-open:text-link [&::-webkit-details-marker]:hidden',
                  focusRingInset,
                )}
              >
                {t(`items.${key}.q`)}
                <Plus
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 ease-out group-open:rotate-[135deg] group-open:text-link motion-reduce:transition-none"
                />
              </summary>
              <p className="max-w-[64ch] pb-6 text-pretty text-foreground-soft">
                {t(`items.${key}.a`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
