import { escapeHtml, type RenderedEmail, simpleEmailHtml } from './html.js';
import { REPORT_REASON_LABELS, REPORT_RECEIVED_COPY } from './messages.js';

export interface ReportReceivedEmailInput {
  reason: keyof (typeof REPORT_REASON_LABELS)['uk'];
  /** The report in the operator console (`opsUrl`). */
  url: string;
}

/**
 * To each `OPERATOR_EMAILS` address, once per report (R6): the reason and the console link only.
 * No title, description, text or address of anyone: the operator reads those signed in.
 */
export function renderReportReceivedEmail({
  reason,
  url,
}: ReportReceivedEmailInput): RenderedEmail {
  const copy = REPORT_RECEIVED_COPY;
  const label = REPORT_REASON_LABELS.uk[reason];
  const reasonLine = copy.reason.replace('{label}', label);
  const text = [copy.intro, reasonLine, copy.open.replace('{url}', url), ''].join('\n');
  const link = `<a href="${escapeHtml(url)}" style="color:#111">${escapeHtml(url)}</a>`;
  const [openBefore = '', openAfter = ''] = copy.open.split('{url}');
  return {
    subject: copy.subject.replace('{label}', label),
    text,
    html: simpleEmailHtml('uk', copy.heading, [
      escapeHtml(copy.intro),
      escapeHtml(reasonLine),
      `${escapeHtml(openBefore)}${link}${escapeHtml(openAfter)}`,
    ]),
  };
}
