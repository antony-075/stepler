'use client';

import type { GuestPageVersion } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@stepler/ui/components/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@stepler/ui/components/tooltip';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { bestTextOn, resolveTheme, themeTokens } from '@stepler/templates/core';
import { ExternalLink, Monitor, MoreHorizontal, Smartphone, Tablet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { isPreviewReady, previewMessage } from '@/guest-page/preview-protocol';
import { DEFAULT_PREVIEW_STATE, type PreviewState } from '@/guest-page/preview-state';
import { DeviceFrame, type PreviewDevice, viewportOf } from './device-frame';
import { PreviewStateControls, PreviewStateMenuItems } from './preview-state-controls';

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

/** A tooltip on a control whose visible name may be hidden in a narrow pane. */
function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type ToolbarProps = {
  state: PreviewState;
  onState: (state: PreviewState) => void;
  device: PreviewDevice;
  onDevice: (device: PreviewDevice) => void;
  guestUrl: string | null;
  /** Beside the narrow pane's «⋯»: icons only, the names in tooltips and for screen readers. */
  compact?: boolean;
};

/** The device toggle and «Відкрити як гість». */
function DeviceControls({ device, onDevice, guestUrl, compact = false }: ToolbarProps) {
  const t = useTranslations('guestPage.preview');
  const deviceLabelId = useId();
  // The names give way to icons as the pane narrows (always icons when compact).
  const name = cn({ 'sr-only': compact, '@max-[64rem]/pane:sr-only': !compact });
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span id={deviceLabelId} className="sr-only">
        {t('device')}
      </span>
      <ToggleGroup
        aria-labelledby={deviceLabelId}
        value={device}
        onValueChange={(next) => onDevice(next as PreviewDevice)}
        className="rounded-control bg-muted p-1"
      >
        {DEVICES.map(({ value, Icon }) => (
          <Tip key={value} label={t(value)}>
            <ToggleGroupItem
              value={value}
              icon={<Icon />}
              className={cn({ 'px-2.5': compact, '@max-[64rem]/pane:px-2.5': !compact })}
            >
              <span className={name}>{t(value)}</span>
            </ToggleGroupItem>
          </Tip>
        ))}
      </ToggleGroup>
      {guestUrl === null ? null : (
        <Tip label={t('openAsGuest')}>
          <a
            href={guestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-1 text-sm font-semibold text-link underline underline-offset-4 hover:text-link-hover',
              focusRing,
            )}
          >
            <span className={cn({ 'sr-only': compact, '@max-[50rem]/pane:sr-only': !compact })}>
              {t('openAsGuest')}
            </span>
            <span className="sr-only">{t('newTab')}</span>
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        </Tip>
      )}
    </div>
  );
}

/**
 * The desktop preview pane (owner remarks 66, 67, 70, 77, 104–107). One header row on the sheet:
 * the page state (access and content), the device toggle (Телефон / Планшет / Комп’ютер) and
 * «Відкрити як гість»; then the device, as large as the pane allows (the frame is scaled to the
 * pane's width and height, never cut). The save bar is the settings panel's own top bar. As the
 * pane narrows the toggle shows icons (~64rem) and «Відкрити як гість» an icon (~50rem), each with
 * a tooltip and its accessible name; below ~30rem the device icons and «Відкрити як гість» stay and
 * the page state folds into a «⋯» menu of radio groups.
 * The pane never scrolls.
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
  const [device, setDevice] = useState<PreviewDevice>('phone');
  const [state, setState] = useState<PreviewState>(DEFAULT_PREVIEW_STATE);
  const toolbar: ToolbarProps = {
    state,
    onState: setState,
    device,
    onDevice: setDevice,
    guestUrl,
  };
  return (
    <div
      data-slot="preview-pane"
      // One column as wide as the pane (never its content's min-content width: owner remark 179,
      // the English toolbar pushed the pane's content past the window), so the selects shrink and
      // the container queries below fold the toolbar.
      className="@container/pane grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-muted"
    >
      <TooltipProvider>
        <div
          data-slot="preview-toolbar"
          className="flex min-h-15 items-center justify-between gap-2 border-b bg-card px-3 py-2.5"
        >
          {/* The template's name is in the panel's first row; here only for screen readers. */}
          <h2 className="sr-only">{t('title')}</h2>
          <p className="sr-only">{t('subtitle', { name: templateName })}</p>
          <div className="contents @max-[30rem]/pane:hidden">
            <PreviewStateControls value={state} onChange={setState} className="flex-nowrap" />
            <DeviceControls {...toolbar} />
          </div>
          {/* A very narrow pane (remark 107; owner 2026-10-06): the device icons and «Відкрити як
              гість» stay in the row, the page state moves into the «⋯» menu as two radio groups. */}
          <div className="hidden w-full items-center justify-end gap-1.5 @max-[30rem]/pane:flex">
            <DeviceControls {...toolbar} compact />
            <DropdownMenu>
              <Tip label={t('more')}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t('more')}>
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
                <PreviewStateMenuItems value={state} onChange={setState} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </TooltipProvider>
      <PreviewFrame
        collectionId={collectionId}
        page={page}
        state={state}
        device={device}
        // 12px beside the device (owner remark 178), on the toolbar's column; 16px above and below.
        className="px-3 py-4"
      />
    </div>
  );
}
