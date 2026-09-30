'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { type ThemePreference, themeAttribute, themeCookie } from './theme';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Holds the preference the server read from the cookie, so every switch (header, account menu)
 * starts from the same value and stays in sync. The server already rendered `<html data-theme>`;
 * this only changes it when the user picks another theme.
 */
export function ThemeProvider({
  initialPreference,
  children,
}: {
  initialPreference: ThemePreference;
  children: ReactNode;
}) {
  const [preference, setPreferenceState] = useState(initialPreference);
  // `router.refresh()` re-renders the layout with the cookie as it is now, which another tab may
  // have changed: follow it (adjusting state on a prop change, not in an effect).
  const [syncedPreference, setSyncedPreference] = useState(initialPreference);
  if (initialPreference !== syncedPreference) {
    setSyncedPreference(initialPreference);
    setPreferenceState(initialPreference);
  }

  const setPreference = useCallback((next: ThemePreference) => {
    document.cookie = themeCookie(next, { secure: window.location.protocol === 'https:' });
    const attribute = themeAttribute(next);
    if (attribute === undefined) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = attribute;
    setPreferenceState(next);
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useThemePreference(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useThemePreference must be used inside ThemeProvider');
  return value;
}
