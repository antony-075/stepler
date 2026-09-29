import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { SmtpMailer } from '../src/mail/smtp-mailer.js';
import { testEnv } from './support/env.js';

const MAILPIT = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:8025';

interface MailpitSearch {
  messages: { To: { Address: string }[]; Subject: string }[];
}

describe('SmtpMailer (Mailpit)', () => {
  test('delivers a message that Mailpit finds by recipient', async () => {
    const mailer = new SmtpMailer(testEnv());
    const to = `mail-${randomUUID()}@stepler.test`;
    await mailer.send({ to, subject: 'Hello', text: 'Plain body', html: '<p>HTML body</p>' });
    mailer.onModuleDestroy();

    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const found = (await res.json()) as MailpitSearch;
    expect(found.messages).toHaveLength(1);
    expect(found.messages[0]?.Subject).toBe('Hello');
    expect(found.messages[0]?.To[0]?.Address).toBe(to);
  });
});
