import { escapeHtml, type RenderedEmail, simpleEmailHtml } from './html.js';
import { APPEAL_RECEIVED_COPY } from './messages.js';

export interface AppealReceivedEmailInput {
  targetType: keyof typeof APPEAL_RECEIVED_COPY.targets;
  /** The appeal in the operator console (`opsUrl`). */
  url: string;
}

/**
 * To each `OPERATOR_EMAILS` address, once per appeal (slice 9b): what it is about and the console
 * link only. Never the admin's text, a title or anyone's address.
 */
export function renderAppealReceivedEmail({
  targetType,
  url,
}: AppealReceivedEmailInput): RenderedEmail {
  const copy = APPEAL_RECEIVED_COPY;
  const label = copy.targets[targetType];
  const targetLine = copy.target.replace('{label}', label);
  const text = [copy.intro, targetLine, copy.open.replace('{url}', url), ''].join('\n');
  const link = `<a href="${escapeHtml(url)}" style="color:#111">${escapeHtml(url)}</a>`;
  const [openBefore = '', openAfter = ''] = copy.open.split('{url}');
  return {
    subject: copy.subject.replace('{label}', label),
    text,
    html: simpleEmailHtml('uk', copy.heading, [
      escapeHtml(copy.intro),
      escapeHtml(targetLine),
      `${escapeHtml(openBefore)}${link}${escapeHtml(openAfter)}`,
    ]),
  };
}
