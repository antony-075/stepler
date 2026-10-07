import { escapeHtml, type RenderedEmail, simpleEmailHtml } from './html.js';
import { ACCOUNT_BLOCKED_COPY, type MailLocale } from './messages.js';

/**
 * A blocked account asked for a sign-in link ([Q3]): it learns why none comes. The answer to the
 * request stays the same `202` as for everyone, so nothing is disclosed to whoever asked.
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
    html.push(
      `${escapeHtml(before)}<a href="mailto:${address}" style="color:#111">${address}</a>${escapeHtml(after)}`,
    );
  }
  return {
    subject: copy.subject,
    text: [copy.heading, '', ...lines, ''].join('\n'),
    html: simpleEmailHtml(locale, copy.heading, html),
  };
}
