import { describe, expect, test } from 'vitest';
import { smtpOptions } from './smtp-mailer.js';

describe('smtpOptions', () => {
  test('plain SMTP without auth', () => {
    expect(smtpOptions('smtp://127.0.0.1:1025')).toMatchObject({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      connectionTimeout: 10_000,
    });
    expect(smtpOptions('smtp://127.0.0.1:1025')).not.toHaveProperty('auth');
  });

  test('smtps with encoded credentials and default port', () => {
    expect(smtpOptions('smtps://us%40er:p%3Ass@smtp.example.com')).toMatchObject({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'us@er', pass: 'p:ss' },
    });
  });
});
