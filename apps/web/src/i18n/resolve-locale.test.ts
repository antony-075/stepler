import { describe, expect, test } from 'vitest';
import en from '../../messages/en.json';
import uk from '../../messages/uk.json';
import { resolveLocale } from './resolve-locale';

describe('resolveLocale', () => {
  test.each([
    [{}, 'uk'],
    [{ acceptLanguage: 'en-US,en;q=0.9' }, 'en'],
    [{ acceptLanguage: 'ru-RU,ru;q=0.9' }, 'uk'],
    [{ acceptLanguage: 'de;q=0.9,en;q=0.8,uk;q=0.7' }, 'en'],
    [{ acceptLanguage: 'fr,uk;q=0.9,en;q=0.95' }, 'en'],
    [{ acceptLanguage: 'en;q=0' }, 'uk'],
    [{ acceptLanguage: ';;;garbage' }, 'uk'],
    [{ acceptLanguage: 'EN-gb' }, 'en'],
    [{ acceptLanguage: 'en;Q=0.5,uk;q=0.9' }, 'uk'],
    [{ cookieLocale: 'en', acceptLanguage: 'uk' }, 'en'],
    [{ cookieLocale: 'de', acceptLanguage: 'en' }, 'en'],
  ] as const)('resolveLocale(%j) → %s', (input, expected) => {
    expect(resolveLocale(input)).toBe(expected);
  });
});

function flattenKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj)
    .flatMap(([k, v]) =>
      typeof v === 'object' && v !== null
        ? flattenKeys(v as object, `${prefix}${k}.`)
        : [`${prefix}${k}`],
    )
    .sort();
}

test('message catalogs have identical keys', () => {
  expect(flattenKeys(uk)).toEqual(flattenKeys(en));
});
