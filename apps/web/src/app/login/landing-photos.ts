import type { StaticImageData } from 'next/image';
import p01 from '@/assets/landing/p01.jpg';
import p02 from '@/assets/landing/p02.jpg';
import p03 from '@/assets/landing/p03.jpg';
import p04 from '@/assets/landing/p04.jpg';
import p05 from '@/assets/landing/p05.jpg';
import p06 from '@/assets/landing/p06.jpg';
import p09 from '@/assets/landing/p09.jpg';
import p10 from '@/assets/landing/p10.jpg';
import p11 from '@/assets/landing/p11.jpg';
import p12 from '@/assets/landing/p12.jpg';

/**
 * The landing's photos (Unsplash License, credits in `src/assets/landing/CREDITS.md`), imported
 * statically so `next/image` knows their size (no layout shift) and serves AVIF/WebP variants.
 */
export const LANDING_PHOTOS = { p01, p02, p03, p04, p05, p06, p09, p10, p11, p12 } satisfies Record<
  string,
  StaticImageData
>;

export type LandingPhoto = keyof typeof LANDING_PHOTOS;
