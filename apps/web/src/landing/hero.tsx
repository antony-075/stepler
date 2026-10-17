import { buttonVariants } from '@stepler/ui/components/button';
import { formatFrameNumber } from '@stepler/ui/lib/frame-number';
import { cn } from '@stepler/ui/lib/utils';
import { Check, Quote } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { PhoneFrame } from './phone-frame';
import { HERO_FRAMES, PHOTO_QUALITY } from './photos';
import { phoneScreen, type ScreenLocale } from './screens';
import { ROUTE, SECTION } from './sections';

/** Where the wish sits among the nine tiles (the middle of the second row). */
const WISH_AT = 4;
/** The tiles' pictures are decorative: the figure's label says what the picture shows. */
const DECORATIVE = '';

/**
 * The first screen (design pass: frontend-design, ui-ux-pro-max, web-design-guidelines,
 * responsive-design; owner remarks 2026-10-16: one style of picture, not a dull flat page).
 * - One story in one light style: a guest's phone with the real guest page of the demo family
 *   celebration («Класика») and, beside it, the organizer's collection of the same evening, where
 *   the guests' frames gather into one numbered grid.
 * - The page's one orchestrated moment: on load the nine tiles travel in from the phone's side
 *   and settle into the grid, then the phone rises a little (transform and opacity, about a
 *   second in all, CSS only). Under reduced motion everything is simply there.
 * - The ground is the brand's: a faint grid of dots fading out from the picture, with a soft blue
 *   and a soft warm light behind the collection (`.landing-hero-ground`).
 * - Phones: the text, both buttons and the reassurance first, the picture under them. From
 *   1024px: text left, picture right.
 * - The tiles copy the product's frame (square, an 8px radius, the mono number in a dark pill)
 *   but are not buttons: nothing here pretends to be clickable.
 */
export async function Hero({ locale }: { locale: ScreenLocale }) {
  const t = await getTranslations('home.hero');
  const frames = Array.from({ length: HERO_FRAMES.length + 1 }, (_, i) => i);
  return (
    <section
      aria-labelledby="hero-title"
      className="landing-hero-ground relative isolate overflow-x-clip"
    >
      <div className="stepler-container grid items-center gap-x-14 gap-y-14 pt-12 pb-24 sm:pt-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pt-24 lg:pb-32">
        <div className="landing-rise grid max-w-[36rem] gap-6">
          <h1
            id="hero-title"
            className="text-[clamp(2.5rem,1.5rem+3.6vw,4.5rem)] leading-[1.02] font-[700] tracking-[-0.035em] text-balance"
          >
            {t('title')}
          </h1>
          <p className="max-w-[42ch] text-[1.0625rem] leading-relaxed text-pretty text-foreground-soft sm:text-lg">
            {t('subline')}
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
            <Link
              href={ROUTE.register}
              className={cn(buttonVariants({ size: 'lg' }), 'landing-cta h-13 px-6')}
            >
              {t('cta')}
            </Link>
            <a
              href={`#${SECTION.how}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-13 px-6')}
            >
              {t('secondary')}
            </a>
          </div>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            {t('reassurance')}
          </p>
        </div>

        <figure aria-label={t('stageLabel')} className="relative mx-auto w-full max-w-[40rem]">
          {/* The collection: offset right so the phone can overlap its lower-left corner. */}
          <div className="ml-[30%] rounded-[1.5rem] border border-border bg-card/90 p-3 shadow-[0_30px_60px_-30px_rgb(24_24_27/0.35)] backdrop-blur-sm sm:p-4">
            <div className="flex items-baseline justify-between gap-3 px-1 pb-3">
              <p className="truncate text-sm font-semibold sm:text-base">{t('demoTitle')}</p>
              <p className="shrink-0 type-data text-muted-foreground">
                {t('framesCount', { count: frames.length })}
              </p>
            </div>
            <ul className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-hidden="true">
              {frames.map((i) => (
                <li
                  key={i}
                  className="landing-gather relative aspect-square overflow-hidden rounded-lg bg-muted"
                  style={{ '--i': i } as CSSProperties}
                >
                  {i === WISH_AT ? (
                    <div className="flex size-full flex-col gap-1 bg-tint-sand p-2 pb-6 text-tint-sand-ink sm:p-3 sm:pb-8">
                      <Quote className="size-3.5 shrink-0 opacity-60 sm:size-4" />
                      <p className="line-clamp-3 text-[0.6875rem] leading-snug font-medium sm:text-[0.8125rem] xl:line-clamp-4">
                        {t('demoWish')}
                      </p>
                    </div>
                  ) : (
                    <Image
                      src={HERO_FRAMES[i > WISH_AT ? i - 1 : i]!}
                      alt={DECORATIVE}
                      fill
                      loading="eager"
                      quality={PHOTO_QUALITY}
                      sizes="(min-width: 1024px) 190px, 30vw"
                      className="object-cover"
                    />
                  )}
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-px font-mono text-[0.625rem] text-white tabular-nums sm:bottom-1.5 sm:left-1.5 sm:text-[0.6875rem]">
                    {formatFrameNumber(i + 1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <PhoneFrame
            screen={phoneScreen(locale, 'guest-classic')}
            alt={t('phoneAlt')}
            eager
            className="landing-phone-rise absolute bottom-[-8%] left-0 w-[34%] max-w-[15rem]"
          />
        </figure>
      </div>
    </section>
  );
}
