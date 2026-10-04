import { formatMinutes, MAGIC_LINK_COPY, type MailLocale } from './messages.js';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface MagicLinkEmailInput {
  url: string;
  /** The web app's origin, for absolute links to the legal documents. */
  appOrigin: string;
  locale: MailLocale;
  expiresInMinutes: number;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function renderMagicLinkEmail(input: MagicLinkEmailInput): RenderedEmail {
  const copy = MAGIC_LINK_COPY[input.locale];
  const expiry = copy.expiry.replace(
    '{minutes}',
    formatMinutes(input.locale, input.expiresInMinutes),
  );
  const url = escapeHtml(input.url);
  const { legal } = copy;
  const termsUrl = `${input.appOrigin}/legal/terms`;
  const privacyUrl = `${input.appOrigin}/legal/privacy`;
  const legalText = `${legal.before}${legal.terms} (${termsUrl})${legal.and}${legal.privacy} (${privacyUrl})${legal.after}`;
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:#444">${escapeHtml(label)}</a>`;
  const legalHtml = `${escapeHtml(legal.before)}${link(termsUrl, legal.terms)}${escapeHtml(legal.and)}${link(privacyUrl, legal.privacy)}${escapeHtml(legal.after)}`;

  const text = [
    copy.heading,
    '',
    copy.intro,
    '',
    input.url,
    '',
    legalText,
    '',
    expiry,
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
<p style="margin:0 0 24px;color:#444">${legalHtml}</p>
<p style="margin:0 0 8px;color:#444">${escapeHtml(expiry)}</p>
<p style="margin:0 0 24px;color:#444">${escapeHtml(copy.ignore)}</p>
<p style="margin:0;color:#666;font-size:13px">${escapeHtml(copy.fallback)}<br><span style="word-break:break-all">${url}</span></p>
</body>
</html>
`;

  return { subject: copy.subject, text, html };
}
