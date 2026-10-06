'use client';

// The preview's device frames (owner remarks 69, 70): a phone like a recent iPhone, a tablet like
// an iPad and a laptop with a lid and a base, drawn in CSS. No library: devices.css (MIT) was last
// released in 2022, ships ~4 MB of fixed-size frames and no current tablet; react-device-frameset
// stops at React 18 and was last released in 2023 (rule 14).
// - The screen is a real viewport (390×844, 820×1180, 1440×900 CSS px) scaled to fit the pane.
//   The system bars are part of the screen, as on the device: the phone's status bar with the
//   Dynamic Island and the home indicator's safe area, the tablet's status bar and home
//   indicator, the laptop's browser bar. The page gets what is left (owner, item 96), so its
//   header and its fixed bottom bars are never hidden under them.
// - The bars take the template's background (`--tpl-bg`) with the text colour that reads on it,
//   like Safari tinting the status bar to the page.
// - The hardware itself is dark graphite in both themes (it is a picture of a device) with a thin
//   light edge, so it stays visible on the dark theme's table too. Decorative: `aria-hidden`
//   everywhere except the screen's content.

import { cn } from '@stepler/ui/lib/utils';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

export type PreviewDevice = 'phone' | 'tablet' | 'desktop';

/** Device chrome, not copy: the clock every product shot shows, and the address bar's host. */
const CLOCK = '9:41';
const BROWSER_HOST = 'stepler.app';

type Geometry = {
  /** The device's screen in CSS px. */
  screen: { width: number; height: number };
  /** The system bars on the screen, in the same px: the page's viewport is what is left. */
  bars: { top: number; bottom: number };
  /** Hardware around the screen, in pane px (not scaled): fixed thickness looks right at any size. */
  bezel: { x: number; top: number; bottom: number };
  /** Extra room for buttons sticking out, the laptop base's overhang (a share of the lid). */
  extra: { x: number; y: number; widthFactor: number };
  maxScale: number;
};

const GEOMETRY: Record<PreviewDevice, Geometry> = {
  phone: {
    screen: { width: 390, height: 844 },
    bars: { top: 54, bottom: 34 },
    bezel: { x: 11, top: 11, bottom: 11 },
    extra: { x: 6, y: 0, widthFactor: 1 },
    // About 10% larger than before (owner remark 116); the fit to the pane still caps it.
    maxScale: 0.85,
  },
  tablet: {
    screen: { width: 820, height: 1180 },
    bars: { top: 28, bottom: 20 },
    bezel: { x: 16, top: 16, bottom: 16 },
    extra: { x: 4, y: 4, widthFactor: 1 },
    maxScale: 0.75,
  },
  desktop: {
    screen: { width: 1440, height: 900 },
    bars: { top: 44, bottom: 0 },
    bezel: { x: 10, top: 18, bottom: 12 },
    extra: { x: 0, y: 14, widthFactor: 1.12 },
    maxScale: 1,
  },
};

/** The page's own viewport inside the frame (CSS px). */
export const viewportOf = (device: PreviewDevice) => {
  const { screen, bars } = GEOMETRY[device];
  return { width: screen.width, height: screen.height - bars.top - bars.bottom };
};

function fitScale(
  device: PreviewDevice,
  box: { width: number; height: number },
  maxScale?: number,
): number {
  const { screen, bezel, extra, maxScale: deviceMax } = GEOMETRY[device];
  const width = (box.width / extra.widthFactor - 2 * bezel.x - extra.x) / screen.width;
  const height =
    box.height > 0
      ? (box.height - bezel.top - bezel.bottom - extra.y) / screen.height
      : Number.POSITIVE_INFINITY;
  return Math.max(0.1, Math.min(width, height, maxScale ?? deviceMax));
}

/**
 * Fits the device into its box and draws it around `children` (the page's iframe, given the
 * scale and the viewport size). The box must have a height (the pane's grid row) or a width.
 */
export function DeviceFrame({
  device,
  barColors,
  maxScale,
  className,
  children,
}: {
  device: PreviewDevice;
  /** The page's background and the text colour that reads on it, for the system bars. */
  barColors: { background: string; foreground: string };
  maxScale?: number;
  className?: string;
  children: (scale: number) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const fit = () => {
      // The content box: the box's own padding is room around the device.
      const style = getComputedStyle(element);
      const px = (value: string) => Number.parseFloat(value) || 0;
      const width = element.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
      const height = element.clientHeight - px(style.paddingTop) - px(style.paddingBottom);
      setScale(fitScale(device, { width, height }, maxScale));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [device, maxScale]);

  const { screen, bars, bezel } = GEOMETRY[device];
  const width = screen.width * scale;
  const height = screen.height * scale;
  const bar = (
    <StatusBar device={device} scale={scale} height={bars.top * scale} colors={barColors} />
  );
  const screenBox = (
    <div
      data-slot="preview-screen"
      className="relative flex flex-col overflow-hidden"
      style={{
        width,
        height,
        borderRadius: device === 'phone' ? 48 * scale : device === 'tablet' ? 18 * scale : 0,
        backgroundColor: barColors.background,
      }}
    >
      {bar}
      <div className="relative min-h-0 flex-1 overflow-hidden">{children(scale)}</div>
      {bars.bottom > 0 ? (
        // The home indicator's safe area (owner, item 96): as on the device, the page's own
        // bars end above it, so a fixed action bar in the preview sits where it would really.
        <div
          aria-hidden="true"
          className="relative shrink-0"
          style={{ height: bars.bottom * scale, backgroundColor: barColors.background }}
        >
          <span
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              bottom: 8 * scale,
              width: (device === 'phone' ? 134 : 200) * scale,
              height: Math.max(2, 5 * scale),
              backgroundColor: barColors.foreground,
              opacity: 0.85,
            }}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div ref={box} className={cn('grid min-h-0 min-w-0 place-items-center', className)}>
      <div data-slot="preview-device" data-device={device} className="relative">
        {device === 'desktop' ? (
          <div className="grid justify-items-center">
            <div
              className="relative rounded-t-[14px] rounded-b-[4px] bg-[#0e0f10] shadow-[inset_0_0_0_1px_#3a3c3f]"
              style={{
                paddingTop: bezel.top,
                paddingBottom: bezel.bottom,
                paddingInline: bezel.x,
              }}
            >
              <span
                aria-hidden="true"
                className="absolute top-[7px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-[#2c2e31]"
              />
              {screenBox}
            </div>
            <div
              aria-hidden="true"
              className="relative h-3.5 rounded-t-[2px] rounded-b-[10px] bg-[linear-gradient(to_bottom,#e4e5e7,#b4b6ba)] shadow-[0_10px_20px_-12px_rgb(0_0_0/0.5)] dark:bg-[linear-gradient(to_bottom,#a9abaf,#6e7175)]"
              style={{ width: (width + 2 * bezel.x) * GEOMETRY.desktop.extra.widthFactor }}
            >
              <span className="absolute top-0 left-1/2 h-1 w-[16%] -translate-x-1/2 rounded-b-md bg-black/15" />
            </div>
          </div>
        ) : (
          <div
            className="relative bg-[#1c1d1f] shadow-[inset_0_0_0_1.5px_#45474b,0_24px_48px_-24px_rgb(0_0_0/0.55)]"
            style={{
              padding: bezel.x,
              borderRadius:
                (device === 'phone' ? 48 * scale : 18 * scale) +
                (device === 'phone' ? bezel.x : bezel.x - 4),
            }}
          >
            <Buttons device={device} />
            {device === 'tablet' ? (
              <span
                aria-hidden="true"
                className="absolute top-[6px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-[#34363a]"
              />
            ) : null}
            {screenBox}
          </div>
        )}
      </div>
    </div>
  );
}

/** The side buttons, just outside the body's edge. */
function Buttons({ device }: { device: 'phone' | 'tablet' }) {
  const button = 'absolute rounded-[2px] bg-[#2b2c2f] shadow-[inset_0_0_0_1px_#45474b]';
  if (device === 'phone') {
    return (
      <span aria-hidden="true">
        <span className={cn(button, '-left-[3px] top-[17%] h-[4%] w-[3px]')} />
        <span className={cn(button, '-left-[3px] top-[24%] h-[7.5%] w-[3px]')} />
        <span className={cn(button, '-left-[3px] top-[33%] h-[7.5%] w-[3px]')} />
        <span className={cn(button, '-right-[3px] top-[27%] h-[12%] w-[3px]')} />
      </span>
    );
  }
  return (
    <span aria-hidden="true">
      <span className={cn(button, '-top-[3px] right-[9%] h-[3px] w-[7%]')} />
      <span className={cn(button, '-right-[3px] top-[8%] h-[5%] w-[3px]')} />
      <span className={cn(button, '-right-[3px] top-[14%] h-[5%] w-[3px]')} />
    </span>
  );
}

/** The system bar at the top of the screen: status bar, or the laptop's browser bar. */
function StatusBar({
  device,
  scale,
  height,
  colors,
}: {
  device: PreviewDevice;
  scale: number;
  height: number;
  colors: { background: string; foreground: string };
}) {
  if (device === 'desktop') {
    return (
      <div
        aria-hidden="true"
        className="flex shrink-0 items-center border-b border-black/10 bg-[#ececee] text-[#5b5e63]"
        style={{ height, gap: 14 * scale, paddingInline: 16 * scale }}
      >
        <span className="flex" style={{ gap: 8 * scale }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((color) => (
            <span
              key={color}
              className="rounded-full"
              style={{ width: 12 * scale, height: 12 * scale, backgroundColor: color }}
            />
          ))}
        </span>
        <span
          className="mx-auto flex items-center justify-center rounded-md bg-white/90"
          style={{ height: 26 * scale, width: '46%', fontSize: 13 * scale }}
        >
          {BROWSER_HOST}
        </span>
      </div>
    );
  }
  const phone = device === 'phone';
  const text = (phone ? 17 : 13) * scale;
  return (
    <div
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-between font-semibold tabular-nums"
      style={{
        height,
        paddingInline: (phone ? 34 : 20) * scale,
        paddingTop: phone ? 6 * scale : 0,
        fontSize: text,
        color: colors.foreground,
        backgroundColor: colors.background,
      }}
    >
      <span>{CLOCK}</span>
      {phone ? (
        <span
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black"
          style={{ top: 11 * scale, width: 122 * scale, height: 35 * scale }}
        />
      ) : null}
      <span className="flex items-center" style={{ gap: 5 * scale }}>
        <Signal size={text} />
        <Battery size={text} />
      </span>
    </div>
  );
}

function Signal({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 18 12" width={size * 1.1} height={size * 0.75} fill="currentColor">
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
      <rect x="10" y="3" width="3" height="9" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}

function Battery({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 27 13" width={size * 1.6} height={size * 0.78} fill="none">
      <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" opacity="0.4" />
      <rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor" />
      <path d="M25 4.5v4c.8-.3 1.5-1 1.5-2s-.7-1.7-1.5-2Z" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
