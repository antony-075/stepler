import { describe, expect, test } from 'vitest';
import { renderAppealReceivedEmail } from './appeal-received.js';

describe('the operator’s «нова апеляція» mail', () => {
  test('the target type and the console link, never the admin’s text', () => {
    // Over-filled on purpose: the renderer takes only what it needs.
    const input = {
      targetType: 'CONTENT' as const,
      url: 'https://stepler.app/ops/appeals/0199',
      text: 'Це помилка, це моє фото',
      title: 'Весілля Олени',
    };
    const mail = renderAppealReceivedEmail(input);
    expect(mail.subject).toBe('Stepler: нова апеляція (кадр)');
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain('https://stepler.app/ops/appeals/0199');
      expect(part).toContain('Щодо: кадр');
      expect(part).not.toContain('Це помилка');
      expect(part).not.toContain('Весілля Олени');
    }
    expect(mail.text).toContain('Адміністратор колекції подав апеляцію.');
    expect(renderAppealReceivedEmail({ targetType: 'COLLECTION', url: 'x' }).subject).toBe(
      'Stepler: нова апеляція (колекція)',
    );
  });
});
