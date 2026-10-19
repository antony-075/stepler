import { escapeHtml, mailLink, type RenderedEmail, simpleEmailHtml } from './html.js';
import { ACCOUNT_BLOCKED_COPY, type MailLocale } from './messages.js';

/**
 * A blocked account's address was used to register, resend the confirmation or reset the
 * password ([Q3], ADR 0019): its mailbox learns why no link comes. The answer to the request stays
 * the same `202` as for everyone, so nothing is disclosed to whoever asked.
 */
export function renderAccountBlockedEmail({
  locale,
  contactEmail,
}: {
  locale: MailLocale;
  contactEmail?: string | undefined;
}): RenderedEmail {
  const copy = ACCOUNT_BLOCKED_COPY[locale];
  const lines = [copy.text];
  const html = [escapeHtml(copy.text)];
  if (contactEmail !== undefined) {
    lines.push(copy.contact.replace('{email}', contactEmail));
    const [before = '', after = ''] = copy.contact.split('{email}');
    const address = escapeHtml(contactEmail);
    html.push(`${escapeHtml(before)}${mailLink(`mailto:${address}`, address)}${escapeHtml(after)}`);
  }
  return {
    subject: copy.subject,
    text: [copy.heading, '', ...lines, ''].join('\n'),
    html: simpleEmailHtml(locale, copy.heading, html),
  };
}
