import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import type { MailMessage, Mailer } from './mailer.js';

/** SMTP adapter (Mailpit locally). Message bodies contain sign-in links: never log them. */
@Injectable()
export class SmtpMailer implements Mailer, OnModuleDestroy {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.transport = createTransport(env.SMTP_URL);
    this.from = env.MAIL_FROM;
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
