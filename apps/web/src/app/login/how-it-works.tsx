import { FRAME_TINT_CLASSES, type FrameTint } from '@stepler/ui/lib/frame-tints';
import { cn } from '@stepler/ui/lib/utils';
import { Copy } from 'lucide-react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import guestPhone from '@/assets/landing/guest-phone.webp';
import { collectionInitials } from '../app/collection-initials';
import { caveat } from './hand-font';
import { PencilArrow } from './pencil';
import { QR_MODULES, qrIllustrationPath } from './qr-pattern';

type Step = 'create' | 'share' | 'collect';

// The same tints as the steps of the empty dashboard: the numbers pass 4.5:1 on them.
const STEP_TINTS: Record<Step, FrameTint> = { create: 'lavender', share: 'sky', collect: 'sage' };

// The arrows draw one after another once on load (the page's one orchestrated moment).
const ARROW_DELAY: Record<Step, number> = { create: 300, share: 620, collect: 940 };

const QR_PATH = qrIllustrationPath();

// Everything inside the composition is sized in container units (`cqi` of `@container/how`), so
// it is one illustration that scales as a whole from a 320px phone to a 1600px page. Words keep
// a floor in rem, so they never shrink below a readable size.
const HAND =
  'font-[family-name:var(--font-hand)] text-[max(1.125rem,5cqi)] leading-[1.05] text-foreground';

/**
 * «Як це працює» beside the promise (owner reference, 2026-10-02): three numbered handwritten
 * labels joined by pencil arrows to small fragments of the product, a collection card, the QR
 * card with the guest link, and the owner's picture of the guest page on a phone. The labels are the step text
 * (an ordered list); each coded fragment is one `role="img"` with its own label and `inert`
 * inside, so its button-like parts are never focusable: they illustrate, they do not work.
 */
export async function HowItWorks({ className }: { className?: string }) {
  const t = await getTranslations('landing.how');
  return (
    <section aria-labelledby="how-title" className={cn('@container/how', className)}>
      <h2 id="how-title" className="sr-only">
        {t('title')}
      </h2>
      <ol className={cn(caveat.variable, 'grid grid-cols-12 items-start gap-y-[3cqi]')}>
        <li className="relative col-span-12 grid pl-[16cqi]">
          <StepLabel step="create" index={1} className="ml-[10cqi]" />
          <PencilArrow
            shape="down"
            delay={ARROW_DELAY.create}
            className="absolute top-[2cqi] left-[6cqi] w-[9cqi]"
          />
          <Fragment label={t('steps.create.image')} className="mt-[3cqi] mr-[6cqi]">
            <CollectionCard />
          </Fragment>
        </li>

        <li className="relative z-20 col-span-5 row-start-2 grid gap-[4cqi] pt-[8cqi]">
          <Fragment label={t('steps.share.image')}>
            <QrCard />
          </Fragment>
          <div className="relative grid gap-[1.5cqi]">
            <StepLabel step="share" index={2} className="pr-[8cqi]" />
            <PencilArrow
              shape="upLeft"
              delay={ARROW_DELAY.share}
              className="absolute -top-[8cqi] right-[1cqi] w-[8cqi]"
            />
          </div>
        </li>

        {/* The owner's picture of the guest page, already tilted; it rises over the end of the
            first card. */}
        <li className="relative z-10 col-span-7 col-start-6 row-start-2 -mt-[5cqi] grid gap-[3cqi] pl-[2cqi]">
          <Image
            src={guestPhone}
            alt={t('steps.collect.image')}
            sizes="(min-width: 1280px) 300px, (min-width: 768px) 330px, 58vw"
            className="h-auto w-full"
          />
          <div className="relative -ml-[30cqi] grid gap-[1.5cqi] pl-[11cqi]">
            <PencilArrow
              shape="up"
              delay={ARROW_DELAY.collect}
              className="absolute -top-[9cqi] left-0 w-[10cqi]"
            />
            <StepLabel step="collect" index={3} />
          </div>
        </li>
      </ol>
    </section>
  );
}

async function StepLabel({
  step,
  index,
  className,
}: {
  step: Step;
  index: number;
  className?: string;
}) {
  const t = await getTranslations('landing.how');
  return (
    <p className={cn('flex items-center gap-[2.5cqi]', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full border font-mono text-sm font-medium tabular-nums',
          FRAME_TINT_CLASSES[STEP_TINTS[step]],
        )}
      >
        {index}
      </span>
      <span className={cn(HAND, 'max-w-[15ch] text-balance')}>{t(`steps.${step}.label`)}</span>
    </p>
  );
}

/** One fragment of the product: an image for assistive technology, inert inside. */
function Fragment({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="img" aria-label={label} className={cn('min-w-0', className)}>
      <div inert className="min-w-0">
        {children}
      </div>
    </div>
  );
}

const CARD = 'rounded-sheet border bg-card';

async function CollectionCard() {
  const t = await getTranslations('landing.how');
  return (
    <div className={cn(CARD, 'grid gap-[3.5cqi] p-[3.5cqi]')}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[3cqi]">
        <Initials className="size-[12cqi] text-[max(0.875rem,4.4cqi)]">
          {collectionInitials(t('sampleTitle'))}
        </Initials>
        <div className="grid min-w-0 gap-[1.6cqi]">
          <p className="truncate text-[max(0.8125rem,3.6cqi)] leading-tight font-semibold">
            {t('sampleTitle')}
          </p>
          {/* The description, not written yet: two quiet bars. */}
          <span className="h-[1.6cqi] w-[85%] rounded-full bg-muted" />
          <span className="h-[1.6cqi] w-[55%] rounded-full bg-muted" />
        </div>
      </div>
      <span className="grid h-[max(2.25rem,9cqi)] place-items-center rounded-control bg-primary text-[max(0.75rem,3.3cqi)] font-semibold text-primary-foreground">
        {t('create')}
      </span>
    </div>
  );
}

async function QrCard() {
  const t = await getTranslations('landing.how');
  return (
    <div className={cn(CARD, 'grid gap-[2.5cqi] p-[3cqi]')}>
      {/* QR codes stay a light island in both themes (DESIGN-SYSTEM.md §5.15). It encodes
          nothing (`qr-pattern.ts`). */}
      <div className="rounded-frame border bg-white p-[2cqi]">
        <svg
          viewBox={`-1 -1 ${QR_MODULES + 2} ${QR_MODULES + 2}`}
          className="block w-full"
          shapeRendering="crispEdges"
        >
          <path d={QR_PATH} fill="#141614" />
        </svg>
      </div>
      <p className="flex min-w-0 items-center gap-[1.5cqi] text-[max(0.6875rem,2.9cqi)] text-muted-foreground">
        <span className="min-w-0 truncate">{t('linkValue')}</span>
        <Copy aria-hidden="true" className="size-[max(0.75rem,3.2cqi)] shrink-0" />
      </p>
    </div>
  );
}

function Initials({ className, children }: { className?: string; children: string }) {
  return (
    <span
      translate="no"
      className={cn(
        "grid shrink-0 place-items-center rounded-frame border leading-none font-semibold [font-variation-settings:'SHRP'_60]",
        FRAME_TINT_CLASSES.sand,
        className,
      )}
    >
      {children}
    </span>
  );
}
