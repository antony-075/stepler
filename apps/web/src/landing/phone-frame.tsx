import { cn } from '@stepler/ui/lib/utils';
import Image from 'next/image';
import { SCREEN_QUALITY, type Screen } from './screens';

type ScreenFrameProps = {
  screen: Screen;
  alt: string;
  /** Above the fold: load at once instead of lazily. */
  eager?: boolean;
  className?: string;
};

/** Device chrome, not copy: the clock every product shot shows. */
const CLOCK = '9:41';

/**
 * The phone's proportions, in the editor preview's px (DeviceFrame, device-frame.tsx): a 390 wide
 * screen with a 54px status bar over the 844px page and a 34px home-indicator area, inside an
 * 11px graphite bezel. Everything below is drawn in `cqw` (hundredths of the phone's width), so
 * one picture scales to any size.
 */
const PHONE = { width: 412, height: 954 } as const;
const BAR_TEXT = { dark: 'text-black', light: 'text-white' } as const;

/**
 * A real phone screen in the same device as the guest page editor's preview (owner 2026-10-16:
 * «рамка телефона как внутри приложения»): a graphite body with a thin light edge and its side
 * buttons, the status bar with the clock, the Dynamic Island, signal and battery, tinted to the
 * page's own top colour like Safari, and the home indicator under the page. The page itself is
 * the still from `pnpm landing:media`, served as it is. The box keeps the device's ratio, so
 * nothing shifts while the still loads. Sized by its width by default; `fit="height"` fills the
 * height it is given and takes the width that follows. Decorative chrome: only the still has
 * `alt`.
 */
export function PhoneFrame({
  screen,
  alt,
  eager = false,
  className,
  fit = 'width',
}: ScreenFrameProps & { fit?: 'width' | 'height' }) {
  const bar = screen.bar ?? { background: '#ffffff', foreground: 'dark' as const };
  return (
    <div
      style={{ aspectRatio: `${PHONE.width} / ${PHONE.height}` }}
      className={cn(
        '@container relative',
        fit === 'height' ? 'h-full w-auto' : 'h-auto',
        className,
      )}
    >
      <div className="absolute inset-0 rounded-[14.3cqw] bg-(--device) p-[2.67cqw] shadow-[inset_0_0_0_1.5px_var(--device-edge),0_30px_60px_-28px_rgb(0_0_0/0.55)]">
        <span aria-hidden="true">
          <span className="absolute top-[17%] -left-[0.75cqw] h-[4%] w-[0.75cqw] rounded-[2px] bg-(--device-button)" />
          <span className="absolute top-[24%] -left-[0.75cqw] h-[7.5%] w-[0.75cqw] rounded-[2px] bg-(--device-button)" />
          <span className="absolute top-[33%] -left-[0.75cqw] h-[7.5%] w-[0.75cqw] rounded-[2px] bg-(--device-button)" />
          <span className="absolute top-[27%] -right-[0.75cqw] h-[12%] w-[0.75cqw] rounded-[2px] bg-(--device-button)" />
        </span>
        <div
          className="flex size-full flex-col overflow-hidden rounded-[11.65cqw]"
          style={{ backgroundColor: bar.background }}
        >
          <div
            aria-hidden="true"
            className={cn(
              'relative flex h-[13.1cqw] shrink-0 items-center justify-between px-[8.25cqw] pt-[1.4cqw] text-[4.1cqw] font-semibold tabular-nums',
              BAR_TEXT[bar.foreground],
            )}
          >
            <span>{CLOCK}</span>
            <span className="absolute top-[2.67cqw] left-1/2 h-[8.5cqw] w-[29.6cqw] -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-[1.2cqw]">
              <svg viewBox="0 0 18 12" className="h-[3.1cqw] w-[4.5cqw]" fill="currentColor">
                <rect x="0" y="8" width="3" height="4" rx="1" />
                <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                <rect x="10" y="3" width="3" height="9" rx="1" />
                <rect x="15" y="0" width="3" height="12" rx="1" />
              </svg>
              <svg viewBox="0 0 27 13" className="h-[3.2cqw] w-[6.6cqw]" fill="none">
                <rect
                  x="0.5"
                  y="0.5"
                  width="23"
                  height="12"
                  rx="3.5"
                  stroke="currentColor"
                  opacity="0.4"
                />
                <rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor" />
                <path
                  d="M25 4.5v4c.8-.3 1.5-1 1.5-2s-.7-1.7-1.5-2Z"
                  fill="currentColor"
                  opacity="0.4"
                />
              </svg>
            </span>
          </div>
          <Image
            src={screen.src}
            width={screen.width}
            height={screen.height}
            alt={alt}
            quality={SCREEN_QUALITY}
            sizes="(min-width: 640px) 320px, 72vw"
            loading={eager ? 'eager' : 'lazy'}
            // The hero's phone is the first screen's largest picture (its LCP on phones).
            fetchPriority={eager ? 'high' : 'auto'}
            className="block min-h-0 w-full flex-1 object-cover object-top"
          />
          <div aria-hidden="true" className="relative h-[8.25cqw] shrink-0">
            <span
              className={cn(
                'absolute bottom-[1.95cqw] left-1/2 h-[1.2cqw] w-[32.5cqw] -translate-x-1/2 rounded-full opacity-85',
                bar.foreground === 'dark' ? 'bg-black' : 'bg-white',
              )}
            />
          </div>
        </div>
      </div>
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
        quality={SCREEN_QUALITY}
        sizes="(min-width: 1280px) 760px, (min-width: 1024px) 60vw, 94vw"
        loading={eager ? 'eager' : 'lazy'}
        className="block h-auto w-full"
      />
    </div>
  );
}
