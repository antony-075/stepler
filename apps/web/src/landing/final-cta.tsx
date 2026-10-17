import { buttonVariants } from '@stepler/ui/components/button';
import { cn } from '@stepler/ui/lib/utils';
import { Check } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CLOSING_FRAMES, PHOTO_QUALITY } from './photos';
import { ROUTE } from './sections';

/** The photos are decorative: the heading says what the block is about. */
const DECORATIVE = '';
/** The middle column sits a little lower, so the six read as a loose collection, not a table. */
const OFFSET = 'translate-y-6';

/**
 * The closing invitation on a soft tinted panel (owner 2026-10-16: the full blue was too loud):
 * the headline in ink, one line, the page's primary button to registration and the trial terms
 * under it; from 1024px a small collection on the right (six events the page has told about, in
 * one grid), echoing the hero's.
 */
export async function FinalCta() {
  const t = await getTranslations('home.final');
  return (
    <section aria-labelledby="final-title" className="bg-card pb-20 lg:pb-28">
      <div className="stepler-container">
        <div
          data-reveal
          className="grid items-center gap-12 overflow-hidden rounded-[1.75rem] border border-border bg-[linear-gradient(135deg,var(--pencil-soft),var(--card)_70%)] px-6 py-14 text-foreground sm:px-10 sm:py-16 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:px-16 lg:py-20"
        >
          <div className="grid justify-items-start gap-6">
            <h2
              id="final-title"
              className="max-w-[16ch] text-[clamp(2rem,1.3rem+2.8vw,3.5rem)] leading-[1.04] font-[680] tracking-[-0.03em] text-balance"
            >
              {t('title')}
            </h2>
            <p className="max-w-[44ch] text-lg leading-relaxed text-pretty text-foreground-soft">
              {t('text')}
            </p>
            <Link
              href={ROUTE.register}
              className={cn(buttonVariants({ size: 'lg' }), 'landing-cta mt-2 h-14 px-7 text-base')}
            >
              {t('cta')}
            </Link>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check aria-hidden="true" className="size-4 text-success" />
              {t('note')}
            </p>
          </div>
          <ul aria-hidden="true" className="hidden grid-cols-3 gap-2 pb-6 lg:grid">
            {CLOSING_FRAMES.map((photo, i) => (
              <li
                key={photo.src}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-xl bg-muted shadow-card',
                  i % 3 === 1 && OFFSET,
                )}
              >
                <Image
                  src={photo}
                  alt={DECORATIVE}
                  fill
                  quality={PHOTO_QUALITY}
                  sizes="180px"
                  className="object-cover"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
