import { escapeHtml, type RenderedEmail, simpleEmailHtml } from './html.js';
import { BILLING_DELETION_WARNING_COPY, formatMailDate, type MailLocale } from './messages.js';

export interface BillingDeletionWarningEmailInput {
  locale: MailLocale;
  /** The collection's title: the owner's own text, escaped in HTML, never logged. */
  title: string;
  deleteAfter: Date;
  /** «Тариф і оплата» in the web app. */
  url: string;
}

/** The 30- and 7-day warnings before a read-only collection is deleted (ADR 0018 [P6]). */
export function renderBillingDeletionWarningEmail(
  input: BillingDeletionWarningEmailInput,
): RenderedEmail {
  const copy = BILLING_DELETION_WARNING_COPY[input.locale];
  const date = formatMailDate(input.locale, input.deleteAfter);
  const fill = (text: string) => text.replace('{title}', input.title).replace('{date}', date);
  const [before = '', after = ''] = copy.keep.split('{url}');
  const link = `<a href="${escapeHtml(input.url)}" style="color:#111">${escapeHtml(input.url)}</a>`;
  return {
    // One line: a title cannot add headers (CR/LF are not allowed in titles, and are stripped).
    subject: fill(copy.subject).replace(/[\r\n]+/g, ' '),
    text: [fill(copy.text), copy.keep.replace('{url}', input.url), copy.download, ''].join('\n\n'),
    html: simpleEmailHtml(input.locale, copy.heading, [
      escapeHtml(fill(copy.text)),
      `${escapeHtml(before)}${link}${escapeHtml(after)}`,
      escapeHtml(copy.download),
    ]),
  };
}
