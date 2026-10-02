import type { Decorator, Preview } from '@storybook/react-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import '../src/fonts/fonts.css';
import '../src/styles/globals.css';

type Theme = 'light' | 'dark';

/**
 * Applies the `theme` global to <html data-theme>, as the app does, and restores the previous
 * value on cleanup so one story's theme cannot leak into the next.
 */
function ThemeRoot({ theme, children }: { theme: Theme; children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = theme;
    return () => {
      if (previous === undefined) delete root.dataset.theme;
      else root.dataset.theme = previous;
    };
  }, [theme]);
  return children;
}

const withTheme: Decorator = (Story, context) => (
  <ThemeRoot theme={context.globals.theme as Theme}>
    <Story />
  </ThemeRoot>
);

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' satisfies Theme },
  parameters: {
    // Accessibility violations fail story tests.
    a11y: { test: 'error' },
    // Stories are checked at these widths (mobile-first).
    viewport: {
      options: {
        phone: { name: 'Phone 360', styles: { width: '360px', height: '780px' }, type: 'mobile' },
        tablet: {
          name: 'Tablet 768',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
        laptop: {
          name: 'Laptop 1280',
          styles: { width: '1280px', height: '800px' },
          type: 'desktop',
        },
      },
    },
  },
};

export default preview;
