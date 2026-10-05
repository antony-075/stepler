'use client';

import type { GuestPageVersion } from '@stepler/contracts';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { bestTextOn, resolveTheme, themeTokens } from '@stepler/templates/core';
import { ExternalLink, Monitor, Smartphone, Tablet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { isPreviewReady, previewMessage } from '@/guest-page/preview-protocol';
import { DEFAULT_PREVIEW_STATE, type PreviewState } from '@/guest-page/preview-state';
import { DeviceFrame, type PreviewDevice, viewportOf } from './device-frame';
import { PreviewStateControls } from './preview-state-controls';

export type { PreviewDevice } from './device-frame';

/** The system bars take the page's background, like Safari tinting its bar to the page. */
function useBarColors(page: GuestPageVersion) {
  return useMemo(() => {
    const { def, settings } = resolveTheme(page.templateId, page.templateVersion, page.settings);
    const background = themeTokens(def, settings)['--tpl-bg'] ?? '#ffffff';
    return { background, foreground: bestTextOn(background) };
  }, [page.settings, page.templateId, page.templateVersion]);
}

/**
 * The live preview (plan Task 14, ADR 0017): the same-origin route in an iframe at the device's
 * real viewport, scaled to fit, inside its device frame (`DeviceFrame`). The working copy and the
 * page state go in by postMessage whenever they change, once the frame said it is ready. Nothing
 * in it can be clicked (it is inert).
 */
export function PreviewFrame({
  collectionId,
  page,
  state = DEFAULT_PREVIEW_STATE,
  device,
  maxScale,
  className,
}: {
  collectionId: string;
  page: GuestPageVersion;
  state?: PreviewState;
  device: PreviewDevice;
  /** Caps the scale (the phone card on small screens). */
  maxScale?: number;
  className?: string;
}) {
  const t = useTranslations('guestPage.preview');
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const barColors = useBarColors(page);
  const viewport = viewportOf(device);

  // The latest page and state, for a «ready» that arrives after they changed (a reload).
  const latest = useRef({ page, state });
  useEffect(() => {
    latest.current = { page, state };
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const target = frame.current?.contentWindow ?? null;
      if (!isPreviewReady(event, target)) return;
      setReady(true);
      target?.postMessage(
        previewMessage(latest.current.page, latest.current.state),
        window.location.origin,
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (ready) {
      frame.current?.contentWindow?.postMessage(
        previewMessage(page, state),
        window.location.origin,
      );
    }
  }, [page, ready, state]);

  return (
    <DeviceFrame
      device={device}
      barColors={barColors}
      {...(maxScale === undefined ? {} : { maxScale })}
      {...(className === undefined ? {} : { className })}
    >
      {(scale) => (
        <iframe
          ref={frame}
          title={t('frameTitle')}
          src={`/preview/collections/${encodeURIComponent(collectionId)}`}
          className="absolute top-0 left-0 origin-top-left border-0 bg-background"
          style={{
            width: viewport.width,
            height: viewport.height,
            transform: `scale(${scale})`,
          }}
          data-slot="preview-iframe"
        />
      )}
    </DeviceFrame>
  );
}

const DEVICES = [
  { value: 'phone', Icon: Smartphone },
  { value: 'tablet', Icon: Tablet },
  { value: 'desktop', Icon: Monitor },
] as const;

/**
 * The desktop preview pane (owner remarks 66, 67, 70, 71, 77). Its header is the editor's fixed
 * place for what matters at any moment: the draft status, «Скинути зміни» and «Зберегти»
 * (`actions`, the save bar), in view whatever the settings panel scrolls to. Under it, on the
 * light table, one quiet toolbar: the page state (access and content), the device toggle (Телефон / Планшет /
 * Комп’ютер) and «Відкрити як гість»; then the device, as large as the pane allows. The pane never
 * scrolls; on a narrow pane the toggle shows its icons only (the names stay accessible names).
 */
export function PreviewPane({
  collectionId,
  page,
  templateName,
  guestUrl,
  actions,
}: {
  collectionId: string;
  page: GuestPageVersion;
  templateName: string;
  guestUrl: string | null;
  actions: ReactNode;
}) {
  const t = useTranslations('guestPage.preview');
  const deviceLabelId = useId();
  const [device, setDevice] = useState<PreviewDevice>('phone');
  const [state, setState] = useState<PreviewState>(DEFAULT_PREVIEW_STATE);
  return (
    <div
      data-slot="preview-pane"
      className="@container/pane grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-muted"
    >
      {actions}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        {/* The template's name is in the panel's first row; here only for screen readers. */}
        <h2 className="sr-only">{t('title')}</h2>
        <p className="sr-only">{t('subtitle', { name: templateName })}</p>
        <PreviewStateControls value={state} onChange={setState} />
        <div className="flex flex-wrap items-center gap-2">
          <span id={deviceLabelId} className="sr-only">
            {t('device')}
          </span>
          <ToggleGroup
            aria-labelledby={deviceLabelId}
            value={device}
            onValueChange={(next) => setDevice(next as PreviewDevice)}
            className="rounded-control bg-background p-1"
          >
            {DEVICES.map(({ value, Icon }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                icon={<Icon />}
                className="@max-[46rem]/pane:px-2.5"
              >
                <span className="@max-[46rem]/pane:sr-only">{t(value)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {guestUrl === null ? null : (
            <a
              href={guestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-sm font-semibold text-link underline underline-offset-4 hover:text-link-hover',
                focusRing,
              )}
            >
              <span className="@max-[34rem]/pane:sr-only">{t('openAsGuest')}</span>
              <span className="sr-only">{t('newTab')}</span>
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
        </div>
      </div>
      <PreviewFrame
        collectionId={collectionId}
        page={page}
        state={state}
        device={device}
        className="px-5 pt-4 pb-5"
      />
    </div>
  );
}
