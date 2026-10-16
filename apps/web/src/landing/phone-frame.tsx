import { cn } from '@stepler/ui/lib/utils';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { Screen } from './screens';

type ScreenFrameProps = {
  screen: Screen;
  alt: string;
  /** Above the fold: load at once instead of lazily. */
  eager?: boolean;
  className?: string;
};

// The screens are already sized WebP at 2× (phones) or 1440px (the admin) from
// `pnpm landing:media`: served as they are (`unoptimized`), since another lossy pass through the
// image optimizer blurs their small interface text.

/**
 * A real phone screen in a plain device outline: an ink bezel and rounded corners, no notch, no
 * reflections; the screen is the point. The box keeps the screen's own ratio, so nothing shifts
 * while it loads. Sized by its width by default; `fit="height"` fills the height it is given
 * (a stage of a fixed size) and takes the width that follows.
 */
export function PhoneFrame({
  screen,
  alt,
  eager = false,
  className,
  fit = 'width',
}: ScreenFrameProps & { fit?: 'width' | 'height' }) {
  const ratio = { aspectRatio: `${screen.width} / ${screen.height}` } as CSSProperties;
  return (
    <div
      style={ratio}
      className={cn(
        'relative overflow-hidden rounded-[11%/5.2%] border-[clamp(4px,1.4vw,7px)] border-(--device) bg-(--device) shadow-dialog',
        fit === 'height' ? 'h-full w-auto' : 'h-auto',
        className,
      )}
    >
      <Image
        src={screen.src}
        width={screen.width}
        height={screen.height}
        alt={alt}
        unoptimized
        loading={eager ? 'eager' : 'lazy'}
        className="block size-full rounded-[9%/4.2%] object-cover object-top"
      />
    </div>
  );
}

/**
 * A real admin screen in a quiet browser window: a 28px bar with three dots, a hairline, the
 * screen under it. No address bar: the demo's local address is not the product's.
 */
export function WindowFrame({ screen, alt, eager = false, className }: ScreenFrameProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-card',
        className,
      )}
    >
      <div aria-hidden="true" className="flex h-7 items-center gap-1.5 border-b border-border px-3">
        <span className="size-2.5 rounded-full bg-border-strong" />
        <span className="size-2.5 rounded-full bg-border-strong" />
        <span className="size-2.5 rounded-full bg-border-strong" />
      </div>
      <Image
        src={screen.src}
        width={screen.width}
        height={screen.height}
        alt={alt}
        unoptimized
        loading={eager ? 'eager' : 'lazy'}
        className="block h-auto w-full"
      />
    </div>
  );
}
