import { describe, expect, it } from 'vitest';
import { currentSection } from './admin-nav';

describe('currentSection', () => {
  it('marks the account only on the account page', () => {
    expect(currentSection('/app/account')).toBe('account');
  });

  it('keeps every collection page, its own settings too, under the collections', () => {
    for (const path of [
      '/app',
      '/app/collections/0198f0b0-0000-7000-8000-000000000000',
      '/app/collections/0198f0b0-0000-7000-8000-000000000000/settings',
      '/app/collections/0198f0b0-0000-7000-8000-000000000000/links',
    ]) {
      expect(currentSection(path)).toBe('collections');
    }
  });
});
