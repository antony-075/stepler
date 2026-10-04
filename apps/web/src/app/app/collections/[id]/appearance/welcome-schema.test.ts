import { describe, expect, test } from 'vitest';
import { oneParagraph, toWelcomeRequest, WELCOME_MAX, welcomeFormSchema } from './welcome-schema';

describe('welcome form', () => {
  test('takes 160 emoji (code points), refuses 161', () => {
    expect(WELCOME_MAX).toBe(160);
    expect(welcomeFormSchema.safeParse({ welcomeMessage: '🎉'.repeat(160) }).success).toBe(true);
    expect(welcomeFormSchema.safeParse({ welcomeMessage: '🎉'.repeat(161) }).success).toBe(false);
  });

  test('refuses a line break', () => {
    expect(welcomeFormSchema.safeParse({ welcomeMessage: 'Привіт\nусім' }).success).toBe(false);
  });

  test('a blank field clears the message; text is trimmed', () => {
    expect(toWelcomeRequest(welcomeFormSchema.parse({ welcomeMessage: '  ' }))).toEqual({
      welcomeMessage: null,
    });
    expect(toWelcomeRequest(welcomeFormSchema.parse({ welcomeMessage: ' Вітаємо! ' }))).toEqual({
      welcomeMessage: 'Вітаємо!',
    });
  });

  test('pasted lines become one paragraph', () => {
    expect(oneParagraph('Дякуємо,\r\nщо ви\tз нами')).toBe('Дякуємо, що ви з нами');
  });
});
