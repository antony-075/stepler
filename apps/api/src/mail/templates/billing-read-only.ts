import { escapeHtml, mailLink, type RenderedEmail, simpleEmailHtml } from './html.js';
import { BILLING_READ_ONLY_COPY, formatMailDate, type MailLocale } from './messages.js';

export interface BillingReadOnlyEmailInput {
  locale: MailLocale;
  reason: 'trial' | 'plan';
  /** When the account's read-only content is due for deletion. */
  deleteAfter: Date;
  /** «Тариф і оплата» in the web app. */
  url: string;
}

/** To the account's own address (ADR 0018 [B8]): why, what still works, until when, what to do. */
export function renderBillingReadOnlyEmail(input: BillingReadOnlyEmailInput): RenderedEmail {
  const copy = BILLING_READ_ONLY_COPY[input.locale];
  const reason = copy.reasons[input.reason];
  const keep = copy.keep.replace('{date}', formatMailDate(input.locale, input.deleteAfter));
  const [before = '', after = ''] = copy.choose.split('{url}');
  const link = mailLink(escapeHtml(input.url), escapeHtml(input.url));
  return {
    subject: copy.subject,
    text: [reason, copy.effect, keep, copy.choose.replace('{url}', input.url), ''].join('\n\n'),
    html: simpleEmailHtml(input.locale, copy.heading, [
      escapeHtml(reason),
      escapeHtml(copy.effect),
      escapeHtml(keep),
      `${escapeHtml(before)}${link}${escapeHtml(after)}`,
    ]),
  };
}
