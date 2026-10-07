import { escapeHtml, type RenderedEmail, simpleEmailHtml } from './html.js';
import { type MailLocale, REPORT_DECISION_COPY } from './messages.js';

export interface ReportDecisionEmailInput {
  status: 'ACTIONED' | 'DISMISSED';
  locale: MailLocale;
  /** `LEGAL_CONTACT_EMAIL`, for a reporter who disagrees; the line is left out without it. */
  contactEmail?: string | undefined;
}

/**
 * To a reporter who left an address (R6): the decision only, never the content, the collection
 * or the operator's note. The address may belong to someone else, so the mail says nothing more.
 */
export function renderReportDecisionEmail({
  status,
  locale,
  contactEmail,
}: ReportDecisionEmailInput): RenderedEmail {
  const copy = REPORT_DECISION_COPY[locale];
  const lines = [copy[status]];
  const html = [escapeHtml(copy[status])];
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
