import { escapeHtml, type RenderedEmail, simpleEmailHtml } from './html.js';
import { BILLING_RENEWAL_FAILED_COPY, formatMailDate, type MailLocale } from './messages.js';

export interface BillingRenewalFailedEmailInput {
  locale: MailLocale;
  /** The plan's name in the reader's language. */
  plan: string;
  /** When the grace period ends and the account becomes read-only. */
  graceEndsAt: Date;
  /** «Тариф і оплата» in the web app. */
  url: string;
}

/** To the account's own address (ADR 0018 [P12]): what failed, until when it works, what to do. */
export function renderBillingRenewalFailedEmail(
  input: BillingRenewalFailedEmailInput,
): RenderedEmail {
  const copy = BILLING_RENEWAL_FAILED_COPY[input.locale];
  const text = copy.text.replace('{plan}', input.plan);
  const grace = copy.grace.replace('{date}', formatMailDate(input.locale, input.graceEndsAt));
  const [before = '', after = ''] = copy.act.split('{url}');
  const link = `<a href="${escapeHtml(input.url)}" style="color:#111">${escapeHtml(input.url)}</a>`;
  return {
    subject: copy.subject,
    text: [text, grace, copy.act.replace('{url}', input.url), ''].join('\n\n'),
    html: simpleEmailHtml(input.locale, copy.heading, [
      escapeHtml(text),
      escapeHtml(grace),
      `${escapeHtml(before)}${link}${escapeHtml(after)}`,
    ]),
  };
}
