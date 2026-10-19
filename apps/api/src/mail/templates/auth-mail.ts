import {
  brandedEmailHtml,
  escapeHtml,
  mailButton,
  mailParagraph,
  type RenderedEmail,
} from './html.js';
import { AUTH_MAIL_COPY, type AuthMailKind, type MailLocale } from './messages.js';

export interface AuthMailInput {
  kind: AuthMailKind;
  /** The one action: the verification or reset page, or `/login` for the account-exists notice. */
  url: string;
  locale: MailLocale;
  /** How long the link works, already worded («1 годину», «60 хвилин»); `null` without an expiry. */
  duration: string | null;
}

/** The account mails (ADR 0019): one heading, one sentence, one button, the link as text below. */
export function renderAuthMail(input: AuthMailInput): RenderedEmail {
  const locale = AUTH_MAIL_COPY[input.locale];
  const copy = locale[input.kind];
  const expiry =
    copy.expiry === null || input.duration === null
      ? null
      : copy.expiry.replace('{duration}', input.duration);
  const url = escapeHtml(input.url);

  const text = [
    copy.heading,
    '',
    copy.intro,
    '',
    input.url,
    '',
    ...(expiry === null ? [] : [expiry]),
    copy.ignore,
    '',
  ].join('\n');

  // The fallback shows the URL as text (not a second link), so the link appears once.
  const content = [
    mailParagraph(escapeHtml(copy.intro)),
    mailButton(url, escapeHtml(copy.button)),
    ...(expiry === null ? [] : [mailParagraph(escapeHtml(expiry), 'soft')]),
    mailParagraph(escapeHtml(copy.ignore), 'soft'),
    mailParagraph(
      `${escapeHtml(locale.fallback)}<br><span style="word-break:break-all">${url}</span>`,
      'small',
    ),
  ].join('\n');
  const html = brandedEmailHtml(input.locale, copy.heading, content);

  return { subject: copy.subject, text, html };
}
