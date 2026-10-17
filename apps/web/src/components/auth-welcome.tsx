import { cn } from '@stepler/ui/lib/utils';
import { Check, Play, Quote } from 'lucide-react';
import Image, { type StaticImageData } from 'next/image';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';
import { PhoneFrame } from '@/landing/phone-frame';
import { PHOTO_QUALITY, WELCOME_FRAMES } from '@/landing/photos';
import { phoneScreen, screenLocale } from '@/landing/screens';

export type WelcomeFor = 'login' | 'register';

const POINTS = ['noApp', 'quality', 'control'] as const;
/** Every picture here is decorative: the heading says what the panel is about. */
const DECORATIVE = '';
const UPLOAD = { done: 3, total: 4 } as const;
const VIDEO_LENGTH = '0:12';
const SHADOW = 'shadow-[0_24px_50px_-18px_rgb(0_0_0/0.65)]';

/**
 * The welcome half beside the sign-in or registration form, from 1024px (owner's pick
 * 2026-10-16: «Продукт»): the whole height of the window (sticky while the form scrolls) and the
 * whole half of its width, on the landing's dark ground. The real guest page of the demo
 * birthday («Вечірка», dark like the panel) in a phone with a visible titanium edge, and what
 * guests add around it, each kind once: photos, a video, a wish, a document, an upload in
 * progress. They drift in once after load (CSS, not under reduced motion). Under them the page's
 * own words and three short promises. The pictures are decorative; the heading names the panel.
 */
export function AuthWelcome({
  page,
  locale,
  className,
}: {
  page: WelcomeFor;
  locale: string;
  className?: string;
}) {
  const t = useTranslations('authPage');
  const id = `welcome-${page}`;
  const phone = (
    <PhoneFrame
      screen={phoneScreen(screenLocale(locale), 'guest-party')}
      alt={DECORATIVE}
      eager
      fit="height"
      className="landing-phone-rise relative z-1"
    />
  );
  return (
    <aside
      aria-labelledby={id}
      className={cn(
        'landing-dark-ground sticky top-0 hidden h-dvh overflow-hidden text-white lg:block',
        className,
      )}
    >
      <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-8 px-10 pt-10 pb-12 xl:px-14 xl:pb-14">
        <div aria-hidden="true" className="relative grid min-h-0 place-items-center">
          <Collage phone={phone} />
        </div>
        <div className="landing-rise grid gap-4">
          <h2
            id={id}
            className="max-w-[18ch] text-[clamp(2rem,1.1rem+2vw,3rem)] leading-[1.04] font-[700] tracking-[-0.035em] text-balance"
          >
            {t(`${page}.title`)}
          </h2>
          <p className="max-w-[44ch] text-lg leading-relaxed text-pretty text-white/80">
            {t(`${page}.text`)}
          </p>
          <ul className="flex flex-wrap gap-2 pt-1">
            {POINTS.map((key) => (
              <li
                key={key}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 text-sm text-white/90"
              >
                <Check aria-hidden="true" className="size-4 text-(--inverse-ring)" />
                {t(`points.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

/**
 * «Колаж» (owner's pick 2026-10-16): the guests' photos fanned behind the phone, the wish and the
 * video tucked at its sides, the upload in progress at its foot, one scene.
 */
function Collage({ phone }: { phone: ReactNode }) {
  const t = useTranslations('authPage.demo');
  const upload = <UploadCard label={t('uploading', UPLOAD)} />;
  const fan = [
    '-rotate-[14deg] -translate-x-[62%]',
    '-rotate-[5deg] -translate-x-[24%] -translate-y-3',
    'rotate-[5deg] translate-x-[24%] -translate-y-3',
    'rotate-[14deg] translate-x-[62%]',
  ];
  return (
    <div className="relative h-[min(62dvh,44rem)] pt-10">
      <div className="absolute top-0 left-1/2 z-0 w-40 -translate-x-1/2">
        {WELCOME_FRAMES.photos.map((photo, i) => (
          <Drift key={photo.src} i={i} className={cn('absolute inset-x-0 top-0', fan[i])}>
            <Polaroid photo={photo} />
          </Drift>
        ))}
      </div>
      <div className="relative h-full">{phone}</div>
      <Drift i={4} className="absolute bottom-[14%] -left-[42%] z-2 w-48 -rotate-[3deg]">
        <WishCard text={t('wishText')} by={t('wishBy')} />
      </Drift>
      <Drift i={5} className="absolute bottom-[30%] -right-[40%] z-2 w-44 rotate-[3deg]">
        <VideoCard label={t('video')} />
      </Drift>
      <Drift i={6} className="absolute -bottom-2 left-1/2 z-2 w-64 -translate-x-1/2">
        {upload}
      </Drift>
    </div>
  );
}

/** A piece drifting in after the phone (`--i` orders them). */
function Drift({ i, className, children }: { i: number; className?: string; children: ReactNode }) {
  return (
    <div className={cn('landing-gather', className)} style={{ '--i': i + 2 } as CSSProperties}>
      {children}
    </div>
  );
}

function Polaroid({ photo }: { photo: StaticImageData }) {
  return (
    <div className={cn('rounded-xl bg-white p-1.5 pb-5', SHADOW)}>
      <div className="relative aspect-square overflow-hidden rounded-md">
        <Image
          src={photo}
          alt={DECORATIVE}
          fill
          quality={PHOTO_QUALITY}
          sizes="160px"
          className="object-cover"
        />
      </div>
    </div>
  );
}

function VideoCard({ label }: { label: string }) {
  return (
    <div
      className={cn(
        'relative aspect-[4/3] overflow-hidden rounded-2xl border-4 border-white',
        SHADOW,
      )}
    >
      <Image
        src={WELCOME_FRAMES.video}
        alt={DECORATIVE}
        fill
        quality={PHOTO_QUALITY}
        sizes="180px"
        className="object-cover"
      />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-10 place-items-center rounded-full bg-white/90 text-(--brand-ink)">
          <Play className="size-4 translate-x-px fill-current" />
        </span>
      </span>
      <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-px font-mono text-[0.6875rem] text-white tabular-nums">
        <span className="sr-only">{label}</span>
        <Play className="size-2.5 fill-current" />
        {VIDEO_LENGTH}
      </span>
    </div>
  );
}

function WishCard({ text, by }: { text: string; by: string }) {
  return (
    <div className={cn('grid gap-2 rounded-2xl bg-tint-sand p-4 text-tint-sand-ink', SHADOW)}>
      <Quote className="size-4 opacity-60" />
      <p className="text-[0.9375rem] leading-snug font-medium">{text}</p>
      <p className="text-xs opacity-75">{by}</p>
    </div>
  );
}

function UploadCard({ label }: { label: string }) {
  return (
    <div className={cn('grid gap-3 rounded-2xl bg-white p-3.5 text-(--brand-ink)', SHADOW)}>
      <div className="flex gap-1.5">
        {WELCOME_FRAMES.upload.map((photo, i) => (
          <span key={photo.src} className="relative size-11 overflow-hidden rounded-lg">
            <Image
              src={photo}
              alt={DECORATIVE}
              fill
              quality={PHOTO_QUALITY}
              sizes="44px"
              className="object-cover"
            />
            {i < UPLOAD.done ? (
              <span className="absolute right-0.5 bottom-0.5 grid size-4 place-items-center rounded-full bg-success text-white">
                <Check className="size-2.5" strokeWidth={3} />
              </span>
            ) : null}
          </span>
        ))}
        <span className="grid size-11 place-items-center rounded-lg border border-dashed border-(--brand-ink)/25 text-(--brand-ink)/55">
          <span className="size-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />
        </span>
      </div>
      <div className="grid gap-1.5">
        <span className="text-[0.8125rem] font-semibold">{label}</span>
        <span className="h-1.5 overflow-hidden rounded-full bg-(--brand-ink)/10">
          <span className="block h-full w-3/4 rounded-full bg-(--brand-blue)" />
        </span>
      </div>
    </div>
  );
}
