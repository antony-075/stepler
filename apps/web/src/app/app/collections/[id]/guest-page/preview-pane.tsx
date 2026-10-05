'use client';

import type { GuestPageVersion } from '@stepler/contracts';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ExternalLink, Monitor, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { isPreviewReady, previewMessage } from '@/guest-page/preview-protocol';

export type PreviewDevice = 'phone' | 'desktop';

/** The previewed page's own viewport: a real 390 or 1440 px wide page, scaled to fit. */
const DEVICES: Record<PreviewDevice, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};
/** The phone frame never grows past 0.7 (E-editor). */
const PHONE_MAX_SCALE = 0.7;
const BEZEL = 8;

/**
 * The live preview (plan Task 14, ADR 0017): the same-origin route in an iframe at a real 390×844
 * or 1440×900 viewport, scaled by `min(width, height)` fit. The working copy goes in by
 * postMessage whenever it changes, once the frame said it is ready. The phone sits in an 8px ink
 * bezel; the computer in a 1px edge. Nothing in it can be clicked (it is inert).
 */
export function PreviewFrame({
  collectionId,
  page,
  device,
  maxScale,
  className,
}: {
  collectionId: string;
  page: GuestPageVersion;
  device: PreviewDevice;
  /** Caps the scale (the phone card on small screens). */
  maxScale?: number;
  className?: string;
}) {
  const t = useTranslations('guestPage.preview');
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(0.5);
  const { width, height } = DEVICES[device];
  const bezel = device === 'phone' ? BEZEL : 1;

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const fit = () => {
      const available = element.getBoundingClientRect();
      const next = Math.min(
        (available.width - 2 * bezel) / width,
        available.height > 0 ? (available.height - 2 * bezel) / height : Infinity,
        maxScale ?? (device === 'phone' ? PHONE_MAX_SCALE : 1),
      );
      setScale(Math.max(0.1, next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bezel, device, height, maxScale, width]);

  // The latest page, for a «ready» that arrives after it changed (a reload of the frame).
  const latest = useRef(page);
  useEffect(() => {
    latest.current = page;
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const target = frame.current?.contentWindow ?? null;
      if (!isPreviewReady(event, target)) return;
      setReady(true);
      target?.postMessage(previewMessage(latest.current), window.location.origin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (ready) {
      frame.current?.contentWindow?.postMessage(previewMessage(page), window.location.origin);
    }
  }, [page, ready]);

  return (
    <div ref={box} className={cn('grid min-h-0 min-w-0 place-items-center', className)}>
      <div
        data-slot="preview-device"
        data-device={device}
        className={cn(
          'overflow-hidden bg-background',
          device === 'phone' ? 'rounded-[42px] bg-[#141614] shadow-lg' : 'rounded-xl border',
        )}
        style={{
          width: width * scale + 2 * bezel,
          height: height * scale + 2 * bezel,
          padding: bezel,
        }}
      >
        <div
          className={cn('overflow-hidden', device === 'phone' && 'rounded-[34px]')}
          style={{ width: width * scale, height: height * scale }}
        >
          <iframe
            ref={frame}
            title={t('frameTitle')}
            src={`/preview/collections/${encodeURIComponent(collectionId)}`}
            className="origin-top-left border-0 bg-background"
            style={{ width, height, transform: `scale(${scale})` }}
            data-slot="preview-iframe"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The desktop preview pane: the heading «Попередній перегляд» with the template's name, the
 * device toggle, «Відкрити як гість» (the default guest link, a new tab, the saved version) and
 * the caption, around the frame. It stays in view while the panel scrolls.
 */
export function PreviewPane({
  collectionId,
  page,
  templateName,
  guestUrl,
}: {
  collectionId: string;
  page: GuestPageVersion;
  templateName: string;
  guestUrl: string | null;
}) {
  const t = useTranslations('guestPage.preview');
  const deviceLabelId = useId();
  const [device, setDevice] = useState<PreviewDevice>('phone');
  return (
    <div
      data-slot="preview-pane"
      className="sticky top-14 grid h-[calc(100svh-3.5rem)] min-h-[32rem] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 bg-muted px-6 py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid gap-0.5">
          <h2 className="text-base font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('subtitle', { name: templateName })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span id={deviceLabelId} className="sr-only">
            {t('device')}
          </span>
          <ToggleGroup
            aria-labelledby={deviceLabelId}
            value={device}
            onValueChange={(next) => setDevice(next as PreviewDevice)}
            className="rounded-control bg-background p-1"
          >
            <ToggleGroupItem value="phone" icon={<Smartphone />}>
              {t('phone')}
            </ToggleGroupItem>
            <ToggleGroupItem value="desktop" icon={<Monitor />}>
              {t('desktop')}
            </ToggleGroupItem>
          </ToggleGroup>
          {guestUrl === null ? null : (
            <a
              href={guestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm font-semibold text-link underline underline-offset-4 hover:text-link-hover',
                focusRing,
              )}
            >
              {t('openAsGuest')}
              <span className="sr-only">{t('newTab')}</span>
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
        </div>
      </div>
      <PreviewFrame collectionId={collectionId} page={page} device={device} />
      <p className="text-center type-caption text-muted-foreground">{t('caption')}</p>
    </div>
  );
}
