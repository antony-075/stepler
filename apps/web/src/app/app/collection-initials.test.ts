import { describe, expect, it } from 'vitest';
import { collectionInitials } from './collection-initials';

describe('collectionInitials', () => {
  it('takes the first letters of the first two words', () => {
    expect(collectionInitials('Ювілей бабусі Галини')).toBe('ЮБ');
    expect(collectionInitials('  anna & max wedding ')).toBe('AM');
  });

  it('takes one letter from a one-word title', () => {
    expect(collectionInitials('Хрестини')).toBe('Х');
  });

  it('prefers letters over digits', () => {
    expect(collectionInitials('Випускний 2025')).toBe('В');
    expect(collectionInitials('2025 рік')).toBe('Р');
    expect(collectionInitials('2025')).toBe('2');
  });

  it('skips leading punctuation inside a word', () => {
    expect(collectionInitials('«Ялинка» в школі')).toBe('ЯВ');
  });

  it('keeps a composed letter whole', () => {
    expect(collectionInitials('йога'.normalize('NFD'))).toBe('Й');
  });

  it('falls back to the first character', () => {
    expect(collectionInitials('🎉')).toBe('🎉');
  });
});
