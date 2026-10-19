const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Every value interpolated into an e-mail's HTML goes through this. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** The brand's colours (apps/web globals.css: --brand-ink, --brand-blue) and the mail's greys. */
export const MAIL_COLOR = {
  ink: '#171a21',
  blue: '#3657ff',
  soft: '#4b5060',
  muted: '#71717a',
  ground: '#f4f4f5',
  card: '#ffffff',
  border: '#e4e4e7',
} as const;

const FONT = "Golos Text,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** An inline link in the brand's blue (the value is already escaped HTML). */
export function mailLink(href: string, label: string): string {
  return `<a href="${href}" style="color:${MAIL_COLOR.blue};text-decoration:underline">${label}</a>`;
}

/** The one action of a mail: a dark button (href and label already escaped). */
export function mailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td style="border-radius:10px;background:${MAIL_COLOR.ink}"><a href="${href}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px">${label}</a></td></tr></table>`;
}

/** A paragraph (already escaped HTML); `tone` greys the secondary lines. */
export function mailParagraph(html: string, tone: 'body' | 'soft' | 'small' = 'body'): string {
  const style =
    tone === 'small'
      ? `color:${MAIL_COLOR.muted};font-size:13px;line-height:1.5`
      : `color:${tone === 'soft' ? MAIL_COLOR.soft : MAIL_COLOR.ink};font-size:15px;line-height:1.6`;
  return `<p style="margin:0 0 16px;${style}">${html}</p>`;
}

/**
 * The brand's mail frame: the lowercase «stepler» wordmark as text (images are often blocked),
 * one white card on a light grey ground, at most 560px wide. Tables and inline styles only, so
 * Gmail, Outlook and Apple Mail draw it alike. `heading` is plain text; `content` is escaped HTML.
 */
export function brandedEmailHtml(lang: string, heading: string, content: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${MAIL_COLOR.ground};font-family:${FONT};color:${MAIL_COLOR.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MAIL_COLOR.ground}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td translate="no" style="padding:0 4px 20px;font-family:Geologica,${FONT};font-size:24px;font-weight:600;letter-spacing:-0.02em;color:${MAIL_COLOR.ink}">stepler</td></tr>
<tr><td style="background:${MAIL_COLOR.card};border:1px solid ${MAIL_COLOR.border};border-radius:16px;padding:32px 28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${MAIL_COLOR.ink}">${escapeHtml(heading)}</h1>
${content}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

/** A plain one-column e-mail: a heading and paragraphs (each already escaped HTML). */
export function simpleEmailHtml(lang: string, heading: string, paragraphs: string[]): string {
  return brandedEmailHtml(lang, heading, paragraphs.map((p) => mailParagraph(p)).join('\n'));
}
