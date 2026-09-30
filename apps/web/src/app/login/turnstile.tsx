'use client';

import Script from 'next/script';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      language?: string;
      size?: 'normal' | 'flexible' | 'compact';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  /** Tokens are single-use: reset after every submit so the next one gets a fresh token. */
  reset(): void;
}

interface TurnstileProps {
  siteKey: string;
  locale: string;
  onToken: (token: string | null) => void;
  /** The challenge could not run (script blocked, offline, failed challenge). */
  onError: () => void;
  ref?: Ref<TurnstileHandle>;
}

/**
 * Cloudflare Turnstile, loaded only on this page (ADR 0012). The API verifies the token.
 *
 * The widget is rendered once per mount and only a new site key re-renders it: re-rendering
 * drops a solved token, so a language switch (`router.refresh()` with a new `locale`) must not.
 * The trade-off: the widget keeps the language it was rendered in until the page is reloaded.
 */
export function Turnstile({ siteKey, locale, onToken, onError, ref }: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Read at render time and from the widget's callbacks, without re-rendering the widget.
  const latest = useRef({ locale, onToken, onError });
  useEffect(() => {
    latest.current = { locale, onToken, onError };
  });

  const render = useCallback(() => {
    const api = window.turnstile;
    if (api === undefined || container.current === null || widgetId.current !== null) return;
    widgetId.current = api.render(container.current, {
      sitekey: siteKey,
      language: latest.current.locale,
      size: 'flexible',
      callback: (token) => latest.current.onToken(token),
      'expired-callback': () => latest.current.onToken(null),
      'error-callback': () => {
        latest.current.onToken(null);
        latest.current.onError();
      },
    });
  }, [siteKey]);

  useEffect(() => {
    if (loaded || window.turnstile !== undefined) render();
    return () => {
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [loaded, render]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
      latest.current.onToken(null);
    },
  }));

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
        onError={() => latest.current.onError()}
      />
      <div ref={container} className="min-h-[65px]" />
    </>
  );
}
