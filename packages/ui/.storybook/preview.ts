import type { Preview } from '@storybook/react-vite';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    // Accessibility violations fail story tests.
    a11y: { test: 'error' },
  },
};

export default preview;
