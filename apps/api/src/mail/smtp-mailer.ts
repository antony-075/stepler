import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createTransport, type SMTPTransportOptions, type Transporter } from 'nodemailer';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import type { MailMessage, Mailer } from './mailer.js';

/** nodemailer defaults are 2 min to connect and 10 min idle; sign-in requests await sending. */
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

/** Transport options from an `smtp://` / `smtps://` URL, with explicit timeouts. */
export function smtpOptions(smtpUrl: string): SMTPTransportOptions {
  const url = new URL(smtpUrl);
  const secure = url.protocol === 'smtps:';
  return {
    host: url.hostname,
    port: url.port === '' ? (secure ? 465 : 587) : Number(url.port),
    secure,
    ...(url.username === ''
      ? {}
      : {
          auth: {
            user: decodeURIComponent(url.username),
            pass: decodeURIComponent(url.password),
          },
        }),
    ...TIMEOUTS,
  };
}

/**
 * SMTP adapter (Mailpit locally). Message bodies contain confirmation and reset links and addresses: never log
 * them.
 */
@Injectable()
export class SmtpMailer implements Mailer, OnModuleDestroy {
  private readonly transport: Transporter;
  private readonly from: string;

  /** The API's env, or the worker's (it shares the mail variables). */
  constructor(@Inject(API_ENV) env: Pick<ApiEnv, 'SMTP_URL' | 'MAIL_FROM'>) {
    this.transport = createTransport(smtpOptions(env.SMTP_URL));
    this.from = env.MAIL_FROM;
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
