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
  ref?: Ref<TurnstileHandle>;
}

/** Cloudflare Turnstile, loaded only on this page (ADR 0012). The API verifies the token. */
export function Turnstile({ siteKey, locale, onToken, ref }: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const render = useCallback(() => {
    const api = window.turnstile;
    if (api === undefined || container.current === null || widgetId.current !== null) return;
    widgetId.current = api.render(container.current, {
      sitekey: siteKey,
      language: locale,
      size: 'flexible',
      callback: (token) => onToken(token),
      'expired-callback': () => onToken(null),
      'error-callback': () => onToken(null),
    });
  }, [siteKey, locale, onToken]);

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
      onToken(null);
    },
  }));

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <div ref={container} className="min-h-[65px]" />
    </>
  );
}
