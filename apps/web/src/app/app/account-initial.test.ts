import { describe, expect, it } from 'vitest';
import { accountInitial } from './account-initial';

describe('accountInitial', () => {
  it('takes the name first, upper-cased', () => {
    expect(accountInitial('оля коваль', 'olia@stepler.test')).toBe('О');
  });

  it('falls back to the email without a name', () => {
    expect(accountInitial(null, 'anton@stepler.test')).toBe('A');
    expect(accountInitial('   ', 'anton@stepler.test')).toBe('A');
  });
});
