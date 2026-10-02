'use client';

import { useEffect } from 'react';

/** The messages of the forms that hold unsaved changes right now, newest last. */
const active: string[] = [];

function onBeforeUnload(event: BeforeUnloadEvent) {
  // Browsers show their own wording; preventDefault is what asks.
  event.preventDefault();
}

/**
 * A click on a same-site link (Next's `<Link>` included: this runs in the capture phase, before
 * React) asks first. Links that open elsewhere (new tab, download, modifier keys) are left alone:
 * the page stays.
 */
function onClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return;
  if (anchor.target !== '' && anchor.target !== '_self') return;
  if (anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;
  const message = active.at(-1);
  if (message !== undefined && !window.confirm(message)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/**
 * While `when` is true, leaving the page asks first: closing or reloading the tab (the
 * browser's own dialog) and following an in-app link (`message`). The browser's Back button
 * inside the app is not covered (the App Router has no cancellable route event).
 */
export function useLeaveGuard(when: boolean, message: string): void {
  useEffect(() => {
    if (!when) return;
    if (active.length === 0) {
      window.addEventListener('beforeunload', onBeforeUnload);
      document.addEventListener('click', onClick, true);
    }
    active.push(message);
    return () => {
      active.splice(active.lastIndexOf(message), 1);
      if (active.length === 0) {
        window.removeEventListener('beforeunload', onBeforeUnload);
        document.removeEventListener('click', onClick, true);
      }
    };
  }, [when, message]);
}
