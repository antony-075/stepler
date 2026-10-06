import { expect, test } from 'vitest';
import { opsUrl } from './ops-url.js';

test('console links live under /ops on the app origin', () => {
  expect(opsUrl({ APP_ORIGIN: 'https://stepler.app' }, '/reports/x')).toBe(
    'https://stepler.app/ops/reports/x',
  );
});
