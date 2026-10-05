import type { Decorator, Preview } from '@storybook/react-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import '../fonts/fonts.css';
import './preview.css';

type Theme = 'light' | 'dark';

/**
 * Applies the `theme` global to <html data-theme>, as the app does, and restores the previous
 * value on cleanup so one story's theme cannot leak into the next. Only templates that follow
 * the visitor's setting (classic in PR H) change with it.
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
    // Full pages, edge to edge, as guests see them.
    layout: 'fullscreen',
    // Accessibility violations fail story tests.
    a11y: { test: 'error' },
    // The widths every template is checked at (plan Task 3; artboards at 390 and 1440).
    viewport: {
      options: {
        phone360: {
          name: 'Phone 360',
          styles: { width: '360px', height: '780px' },
          type: 'mobile',
        },
        phone390: {
          name: 'Phone 390',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
        tablet768: {
          name: 'Tablet 768',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
        desktop1440: {
          name: 'Desktop 1440',
          styles: { width: '1440px', height: '900px' },
          type: 'desktop',
        },
      },
    },
  },
};

export default preview;
