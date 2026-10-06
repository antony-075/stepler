import { useSyncExternalStore } from 'react';

/**
 * Whether `query` matches, following changes. `serverValue` is what the server and the
 * hydrating render assume; the browser's answer replaces it right after. Use it only for parts
 * that render on the client (behind data that loads in the browser), so nothing jumps.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
