'use client';

import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Play } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { SCREEN_QUALITY, type ScreenLocale } from './screens';

/** The rendered walkthrough (`pnpm landing:media`): 1920×1080, about half a minute, no sound. */
const VIDEO = { width: 1920, height: 1080 } as const;
/** Its length as the poster shows it («0:31»). */
const DURATION = '0:45';
/** The poster is decorative: the button's name says what it plays. */
const DECORATIVE = '';

function videoPath(locale: ScreenLocale, ext: string): string {
  return `/landing/video/walkthrough-${locale}${ext}`;
}

/**
 * The real product walkthrough, recorded from the app. Nothing heavy loads until the visitor
 * asks: the poster (an image) and one large play button are all the page carries. Pressing it
 * swaps in a `<video>` with the browser's controls (WebM, then MP4), playing inline, and focus
 * moves to it. Captions are off by default: the video has no sound and its scene titles are part
 * of the picture (owner 2026-10-16); the track stays available from the player's menu. It never autoplays, so reduced motion needs no special case beyond the
 * button's still ring; the steps below show the same flow as still screens.
 * The frame: a dark rounded window with a hairline and a blue glow under it, on the dark section.
 */
export function WalkthroughVideo({ locale }: { locale: ScreenLocale }) {
  const t = useTranslations('home.demo.video');
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  // The button that started it is gone: keep keyboard focus on the player that replaced it.
  useEffect(() => {
    if (playing) video.current?.focus();
  }, [playing]);
  return (
    <div
      className="relative overflow-hidden rounded-[1.25rem] bg-black shadow-[0_40px_120px_-40px_rgb(54_87_255/0.6)] ring-1 ring-white/12 sm:rounded-[1.75rem]"
      style={{ aspectRatio: `${VIDEO.width} / ${VIDEO.height}` }}
    >
      {playing ? (
        <video
          ref={video}
          className="size-full outline-none"
          controls
          autoPlay
          playsInline
          preload="metadata"
          poster={videoPath(locale, '-poster.webp')}
          aria-label={t('title')}
        >
          <source src={videoPath(locale, '.webm')} type="video/webm" />
          <source src={videoPath(locale, '.mp4')} type="video/mp4" />
          {/* Off by default (the scene titles are in the picture); available from the player's menu. */}
          <track
            kind="captions"
            src={videoPath(locale, '.vtt')}
            srcLang={locale}
            label={t('captions')}
          />
          {t('unavailable')}
        </video>
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={t('play')}
          className={cn('group relative block size-full cursor-pointer', focusRing)}
        >
          <Image
            src={videoPath(locale, '-poster.webp')}
            alt={DECORATIVE}
            fill
            quality={SCREEN_QUALITY}
            sizes="(min-width: 1024px) 960px, 100vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02] motion-reduce:transition-none"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-black/25 transition-colors duration-300 group-hover:bg-black/15"
          />
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 grid size-18 -translate-x-1/2 -translate-y-1/2 place-items-center sm:size-24"
          >
            <span className="absolute inset-0 rounded-full bg-white/25 motion-safe:animate-ping motion-safe:[animation-duration:2.4s]" />
            <span className="relative grid size-full place-items-center rounded-full bg-white text-(--brand-blue) shadow-[0_12px_40px_rgb(0_0_0/0.35)] transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transition-none">
              <Play className="size-7 translate-x-0.5 fill-current sm:size-9" />
            </span>
          </span>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-linear-to-t from-black/70 to-transparent p-4 pt-16 text-left text-white sm:p-6 sm:pt-24"
          >
            <span className="text-base font-semibold sm:text-xl">{t('title')}</span>
            <span className="rounded-full bg-white/15 px-2.5 py-1 font-mono text-xs tabular-nums backdrop-blur-sm sm:text-sm">
              {DURATION}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
