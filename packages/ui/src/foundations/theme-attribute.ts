import { useSyncExternalStore } from 'react';

/** Re-renders whenever <html data-theme> changes (the toolbar toggle or a story's globals). */
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** The current `data-theme` of <html>; Foundations stories use it to re-read live token values. */
export function useThemeAttribute(): string | undefined {
  return useSyncExternalStore(subscribeToTheme, () => document.documentElement.dataset.theme);
}
