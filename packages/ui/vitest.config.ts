import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const configDir = `${dirname}.storybook`;

/** Stories tagged with this run only in the `storybook-reduced-motion` project. */
const REDUCED_MOTION_TAG = 'reduced-motion';

// Story tests: play functions + axe checks run in a real browser. Stories tagged
// `reduced-motion` run in a second project whose browser context emulates
// `prefers-reduced-motion: reduce` (Playwright `contextOptions.reducedMotion`), since a play
// function cannot change media features itself.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [storybookTest({ configDir, tags: { exclude: [REDUCED_MOTION_TAG] } })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        plugins: [storybookTest({ configDir, tags: { include: [REDUCED_MOTION_TAG] } })],
        test: {
          name: 'storybook-reduced-motion',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ contextOptions: { reducedMotion: 'reduce' } }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
