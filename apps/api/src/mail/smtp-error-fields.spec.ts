import { describe, expect, test } from 'vitest';
import { smtpErrorFields } from './smtp-error-fields.js';

describe('smtpErrorFields', () => {
  test('keeps diagnosable fields and drops the message that quotes the recipient', () => {
    const error = Object.assign(
      new Error(
        "Can't send mail - all recipients were rejected: 550 5.1.1 <anton@example.com>: Recipient address rejected",
      ),
      { code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' },
    );
    const fields = smtpErrorFields(error);
    expect(fields).toEqual({
      error: 'Error',
      code: 'EENVELOPE',
      responseCode: 550,
      command: 'RCPT TO',
    });
    expect(JSON.stringify(fields)).not.toContain('anton@example.com');
  });

  test('non-errors are summarised without their content', () => {
    expect(smtpErrorFields('anton@example.com')).toEqual({ error: 'non-error' });
  });
});
