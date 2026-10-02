import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { formatFrameNumber } from '@stepler/ui/components/empty-state';
import { FrameSlots } from '@stepler/ui/components/frame-slots';
import { fieldClassName } from '@stepler/ui/components/input';
import { FRAME_TINT_CLASSES, type FrameTint } from '@stepler/ui/lib/frame-tints';
import { cn } from '@stepler/ui/lib/utils';
import { Copy, Play } from 'lucide-react';
import Image from 'next/image';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LANDING_PHOTOS } from './landing-photos';
import { PencilUnderline } from './pencil';
import { QR_MODULES, qrIllustrationPath } from './qr-pattern';
import { Reveal } from './reveal';

const STEPS = ['create', 'share', 'collect'] as const;
type Step = (typeof STEPS)[number];

// The same tints as the steps of the empty dashboard: the numbers pass 4.5:1 on them.
const STEP_TINTS: Record<Step, FrameTint> = { create: 'lavender', share: 'sky', collect: 'sage' };

/** The example collection's date in step 1 (a fixed date, so the page is static). */
const SAMPLE_DATE = new Date('2026-09-14T12:00:00Z');
const QR_PATH = qrIllustrationPath();

// The once-only reveal (see `Reveal`): the list rises in, then the newest guest frame arrives and
// its pencil underline draws. Only `opacity` and `transform` move.
const RISE =
  'group-data-[reveal=armed]/reveal:opacity-0 group-data-[reveal=shown]/reveal:animate-[landing-rise_300ms_var(--ease-out)_both]';
const ARRIVE =
  'group-data-[reveal=armed]/reveal:opacity-0 group-data-[reveal=shown]/reveal:animate-[landing-arrive_240ms_var(--ease-out)_280ms_both]';

/**
 * «Як це працює» (DESIGN-SYSTEM.md §6.9): three numbered steps, each shown with a small real
 * fragment of the product built from its own components (a collection row with its tinted frames,
 * the guest link with a QR code, guest frames arriving). Phones: a vertical sequence joined by a
 * rail. From `lg`: three columns whose fragments share one row (subgrid), so they line up.
 *
 * Each fragment is one image for assistive technology (`role="img"` + label) and `inert` inside,
 * so its buttons and field are never focusable: they illustrate, they do not work.
 */
export async function HowItWorks({ className }: { className?: string }) {
  const t = await getTranslations('landing.how');
  return (
    <section aria-labelledby="how-title" className={className}>
      <h2 id="how-title" className="type-h2">
        {t('title')}
      </h2>
      <Reveal className="mt-6 lg:mt-8">
        <ol
          className={cn(
            'grid gap-10 lg:grid-cols-3 lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-0',
            RISE,
          )}
        >
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="relative grid content-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-x-8 lg:row-span-2 lg:grid-cols-1 lg:grid-rows-subgrid lg:gap-5 lg:border-t lg:border-foreground lg:pt-5"
            >
              {/* The rail joining the numbers on phones and tablets. */}
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-10 -bottom-8 left-3.5 w-px bg-border lg:hidden"
                />
              )}
              <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] content-start gap-x-4">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-7 place-items-center rounded-sheet border font-mono text-sm font-medium tabular-nums',
                    FRAME_TINT_CLASSES[STEP_TINTS[step]],
                  )}
                >
                  {index + 1}
                </span>
                <div className="grid gap-1 pt-0.5">
                  <h3 className="type-h3">{t(`steps.${step}.title`)}</h3>
                  <p className="max-w-[44ch] text-pretty text-muted-foreground">
                    {t(`steps.${step}.text`)}
                  </p>
                </div>
              </div>
              <Fragment label={t(`steps.${step}.label`)}>
                {step === 'create' && <CollectionFragment />}
                {step === 'share' && <LinkFragment />}
                {step === 'collect' && <FramesFragment />}
              </Fragment>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}

/** The stage of one fragment: a sheet on the light table, the fragment centred in it. */
function Fragment({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="ml-11 grid min-w-0 items-center rounded-sheet border bg-card p-4 sm:p-5 md:ml-0"
    >
      <div inert className="min-w-0">
        {children}
      </div>
    </div>
  );
}

async function CollectionFragment() {
  const [t, tc, format] = await Promise.all([
    getTranslations('landing.how'),
    getTranslations('collections'),
    getFormatter(),
  ]);
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="type-h3">{t('sampleTitle')}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge variant="success">{tc('status.ACTIVE')}</Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            {tc('createdOn', { date: format.dateTime(SAMPLE_DATE, 'short') })}
          </span>
        </p>
      </div>
      <FrameSlots count={5} tint="sand" className="w-full" />
    </div>
  );
}

async function LinkFragment() {
  const t = await getTranslations('landing.how');
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3">
      {/* QR codes stay a light island in both themes (DESIGN-SYSTEM.md §5.15). */}
      <div className="rounded-frame border bg-white p-1.5">
        <svg
          viewBox={`-1 -1 ${QR_MODULES + 2} ${QR_MODULES + 2}`}
          className="block size-20 sm:size-24"
          shapeRendering="crispEdges"
        >
          <path d={QR_PATH} fill="#141614" />
        </svg>
      </div>
      <div className="contents min-w-0 gap-2 sm:grid lg:contents xl:grid">
        <p className="text-sm font-semibold">{t('linkTitle')}</p>
        <div
          className={cn(
            fieldClassName,
            'col-span-2 flex h-11 items-center px-3 text-[0.9375rem] sm:col-span-1 lg:col-span-2 xl:col-span-1',
          )}
        >
          <span className="truncate">{t('linkValue')}</span>
        </div>
        <Button
          variant="outline"
          className="col-span-2 justify-self-start sm:col-span-1 lg:col-span-2 xl:col-span-1"
        >
          <Copy aria-hidden="true" />
          {t('copy')}
        </Button>
      </div>
    </div>
  );
}

// Guest frames #008–#011 arriving in step 3: a photo, a video, a wish (text) and the newest photo.
// The photos are decorative here (the fragment is one labelled image), hence the empty `alt`.
const DECORATIVE = '';
const ARRIVING = [
  { number: 8, kind: 'photo', photo: LANDING_PHOTOS.p04, meta: '21:04' },
  { number: 9, kind: 'video', photo: LANDING_PHOTOS.p12, meta: '0:24' },
  { number: 10, kind: 'text', meta: '21:09' },
  { number: 11, kind: 'photo', photo: LANDING_PHOTOS.p11, meta: '21:12', isNew: true },
] as const;

type ArrivingFrame = (typeof ARRIVING)[number];

const FRAME = 'relative m-0 flex min-w-0 flex-col gap-1 bg-card p-1.5 pb-1';
const MEDIA = 'relative aspect-square overflow-hidden rounded-frame bg-muted';
const CAPTION = 'flex items-baseline justify-between gap-1 type-data text-muted-foreground';
const ARRIVING_SIZES =
  '(min-width: 1280px) 120px, (min-width: 1024px) 160px, (min-width: 640px) 25vw, 50vw';

function FramesFragment() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sheet border bg-border sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
      {ARRIVING.map((frame) => (
        <ArrivingFrameView key={frame.number} frame={frame} />
      ))}
    </div>
  );
}

async function ArrivingFrameView({ frame }: { frame: ArrivingFrame }) {
  const t = await getTranslations('landing.how');
  const isNew = 'isNew' in frame && frame.isNew;
  const media =
    frame.kind === 'text' ? (
      <div className={cn(MEDIA, 'flex items-end bg-card p-0.5')}>
        <p className="line-clamp-4 text-[0.8125rem] leading-[1.3] text-foreground">{t('wish')}</p>
      </div>
    ) : (
      <div className={MEDIA}>
        <Image
          src={frame.photo}
          alt={DECORATIVE}
          fill
          sizes={ARRIVING_SIZES}
          className="object-cover"
        />
        {frame.kind === 'video' && (
          <span className="absolute inset-0 grid place-items-center">
            <Play className="size-5 fill-current text-white" strokeWidth={0} />
          </span>
        )}
      </div>
    );
  return (
    <figure className={cn(FRAME, isNew && ARRIVE)}>
      {media}
      <figcaption className={CAPTION}>
        <span translate="no" className="relative text-foreground">
          {formatFrameNumber(frame.number)}
          {isNew && <PencilUnderline />}
        </span>
        {isNew ? (
          <span className="font-sans text-[0.8125rem] leading-none text-pencil">{t('new')}</span>
        ) : (
          <span translate="no">{frame.meta}</span>
        )}
      </figcaption>
    </figure>
  );
}
