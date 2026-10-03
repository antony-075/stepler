import { FRAME_TINT_CLASSES, type FrameTint } from '@stepler/ui/lib/frame-tints';
import { cn } from '@stepler/ui/lib/utils';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import guestPhone from '@/assets/landing/guest-phone.webp';
import { caveat } from './hand-font';
import { PencilArrow } from './pencil';

const STEPS = ['create', 'share', 'collect'] as const;

// The same tints as the steps of the empty dashboard: the numbers pass 4.5:1 on them.
const STEP_TINTS: Record<(typeof STEPS)[number], FrameTint> = {
  create: 'lavender',
  share: 'sky',
  collect: 'sage',
};

/**
 * «Як це працює» as three short numbered lines (owner review 2026-10-03: the illustrated
 * composition was too busy). A real sequence, so an ordered list with its numbers.
 */
export async function HowItWorks({ className }: { className?: string }) {
  const t = await getTranslations('landing.how');
  return (
    <section aria-labelledby="how-title" className={cn('grid content-start gap-4', className)}>
      <h2 id="how-title" className="type-h3">
        {t('title')}
      </h2>
      <ol className="grid gap-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full border font-mono text-sm font-medium tabular-nums',
                FRAME_TINT_CLASSES[STEP_TINTS[step]],
              )}
            >
              {index + 1}
            </span>
            <span className="text-pretty">{t(`steps.${step}`)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The owner's picture of the guest page on a phone, with the page's one handwritten note and
 * its one pencil arrow («Так це бачать гості»), drawn once on load.
 */
export async function GuestPhone({ className }: { className?: string }) {
  const t = await getTranslations('landing.how');
  return (
    <figure className={cn(caveat.variable, 'mx-auto grid w-full max-w-[300px]', className)}>
      <Image
        src={guestPhone}
        alt={t('phoneAlt')}
        sizes="(min-width: 768px) 300px, 75vw"
        className="h-auto w-full"
      />
      {/* Under the phone, never over it: the note, and the arrow from it up to the screen. */}
      <figcaption className="-mt-2 flex items-start gap-1 pl-[8%]">
        <span className="pt-6 font-[family-name:var(--font-hand)] text-[1.375rem] leading-none whitespace-nowrap text-foreground">
          {t('note')}
        </span>
        <PencilArrow delay={500} className="w-9 shrink-0" />
      </figcaption>
    </figure>
  );
}
