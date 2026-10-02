import { formatFrameNumber } from '@stepler/ui/components/empty-state';
import { cn } from '@stepler/ui/lib/utils';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { LANDING_PHOTOS, type LandingPhoto } from './landing-photos';
import { PencilLoop } from './pencil';

type SheetFrame = {
  photo: Extract<LandingPhoto, 'p01' | 'p02' | 'p03' | 'p05' | 'p06' | 'p09' | 'p10'>;
  time: string;
  /** `object-position` when the subject is not in the centre of a square crop. */
  focus?: string;
};

// Frames #001–#007 of one evening (L2 board). #001 is the large frame from `sm`; on phones it is
// the first of four squares and #005–#007 are left out (display: none, so their lazy images are
// never fetched).
const FRAMES: readonly SheetFrame[] = [
  { photo: 'p05', time: '18:42' },
  { photo: 'p01', time: '19:05', focus: '50% 30%' },
  { photo: 'p10', time: '19:31' },
  { photo: 'p03', time: '19:48' },
  { photo: 'p09', time: '20:16' },
  { photo: 'p06', time: '21:10' },
  { photo: 'p02', time: '22:03', focus: '50% 35%' },
];

const CLOSING_TIME = '20:16';

/** The frame circled in wax pencil once on load (DESIGN-SYSTEM.md §6.9, §8). */
const MARKED = 3;
const PHONE_FRAMES = 4;

// Widths the frames are drawn at, for `srcset` selection: the sheet is 7/12 of a 1600px page
// from `lg`, one 640px column from `sm`, the full phone width below.
const HERO_SIZES =
  '(min-width: 1760px) 920px, (min-width: 1024px) 56vw, (min-width: 640px) 640px, 25vw';
const FRAME_SIZES =
  '(min-width: 1760px) 150px, (min-width: 1024px) 10vw, (min-width: 640px) 110px, 25vw';

/**
 * The landing's contact sheet (L2 «editorial split»): real photos as numbered frames with their
 * time, split by the 1px grid line, flat (no rotation, overlap or shadow). Phones: four squares.
 * From `sm`: frame #001 at 3:2 across the sheet, then a strip of six. Frame #003 carries the pencil
 * loop, the page's load motion.
 */
export async function LandingSheet({ className }: { className?: string }) {
  const t = await getTranslations('landing');
  return (
    <section
      aria-label={t('sheetLabel')}
      className={cn(
        'grid grid-cols-4 gap-px overflow-hidden rounded-sheet border bg-border sm:grid-cols-6',
        className,
      )}
    >
      {FRAMES.map((frame, index) => (
        <SheetFrameView key={frame.photo} frame={frame} number={index + 1} />
      ))}
    </section>
  );
}

async function SheetFrameView({ frame, number }: { frame: SheetFrame; number: number }) {
  const t = await getTranslations('landing');
  const hero = number === 1;
  return (
    <figure
      className={cn(
        'm-0 flex min-w-0 flex-col gap-1 bg-card p-1.5 pb-1 @container/frame',
        hero && 'sm:col-span-6 sm:gap-1.5 sm:p-2 sm:pb-1.5',
        number > PHONE_FRAMES && 'max-sm:hidden',
      )}
    >
      <div className="relative">
        <div
          className={cn(
            'relative aspect-square overflow-hidden rounded-frame bg-muted',
            hero &&
              'sm:aspect-[3/2] lg:aspect-square xl:aspect-[5/4] 2xl:aspect-[4/3] 3xl:aspect-[3/2]',
          )}
        >
          <Image
            src={LANDING_PHOTOS[frame.photo]}
            alt={t(`photos.${frame.photo}`)}
            fill
            sizes={hero ? HERO_SIZES : FRAME_SIZES}
            preload={hero}
            className="object-cover"
            style={frame.focus === undefined ? undefined : { objectPosition: frame.focus }}
          />
        </div>
        {number === MARKED && <PencilLoop />}
      </div>
      <figcaption
        translate="no"
        className="flex items-baseline justify-between gap-1 type-data text-muted-foreground"
      >
        <span className="text-foreground">{formatFrameNumber(number)}</span>
        <span>{frame.time}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Frame #005 once more under the sign-in panel on phones (L2 phone board): a 16:9 frame, so the
 * page does not end on the form. Hidden from `sm`, where #005 is in the strip.
 */
export async function LandingClosingFrame({ className }: { className?: string }) {
  const t = await getTranslations('landing');
  return (
    <figure
      className={cn(
        'm-0 flex flex-col gap-1.5 rounded-sheet border bg-card p-2 pb-1.5 sm:hidden',
        className,
      )}
    >
      <div className="relative aspect-video overflow-hidden rounded-frame bg-muted">
        <Image
          src={LANDING_PHOTOS.p09}
          alt={t('photos.p09')}
          fill
          sizes="(min-width: 640px) 1px, 100vw"
          className="object-cover"
        />
      </div>
      <figcaption
        translate="no"
        className="flex items-baseline justify-between gap-1 type-data text-muted-foreground"
      >
        <span className="text-foreground">{formatFrameNumber(5)}</span>
        <span>{CLOSING_TIME}</span>
      </figcaption>
    </figure>
  );
}
