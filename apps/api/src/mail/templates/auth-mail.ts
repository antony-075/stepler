import { escapeHtml, type RenderedEmail } from './html.js';
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
  const html = `<!doctype html>
<html lang="${input.locale}">
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;background:#fff">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(copy.heading)}</h1>
<p style="margin:0 0 24px">${escapeHtml(copy.intro)}</p>
<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px">${escapeHtml(copy.button)}</a></p>
${expiry === null ? '' : `<p style="margin:0 0 8px;color:#444">${escapeHtml(expiry)}</p>\n`}<p style="margin:0 0 24px;color:#444">${escapeHtml(copy.ignore)}</p>
<p style="margin:0;color:#666;font-size:13px">${escapeHtml(locale.fallback)}<br><span style="word-break:break-all">${url}</span></p>
</body>
</html>
`;

  return { subject: copy.subject, text, html };
}
