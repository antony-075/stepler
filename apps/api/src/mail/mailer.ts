/** Injection token for the `Mailer` port. */
export const MAILER = Symbol('MAILER');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Outgoing email behind a port; the production provider is chosen later (spec §21). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
