import type { MailMessage, Mailer } from '../../mail/mailer.js';

/**
 * A failed send, without the SMTP server's text: that text can name the recipient (e.g. `550
 * <r@example.com>: no such user`), and the job runner logs the error. Only the SMTP code stays.
 */
export class MailSendError extends Error {
  constructor(readonly smtpCode: number | string | null) {
    super(`mail send failed (smtp ${smtpCode ?? 'unknown'})`);
    this.name = 'MailSendError';
  }
}

/** Sends one message; a failure becomes a `MailSendError` (pg-boss retries the job). */
export async function sendWithoutLeaking(mailer: Mailer, message: MailMessage): Promise<void> {
  try {
    await mailer.send(message);
  } catch (error) {
    const details = error as { responseCode?: unknown; code?: unknown };
    const code =
      typeof details.responseCode === 'number'
        ? details.responseCode
        : typeof details.code === 'string'
          ? details.code
          : null;
    throw new MailSendError(code);
  }
}
