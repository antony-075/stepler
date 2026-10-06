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

/** A plain one-column e-mail: a heading and paragraphs (each already escaped HTML). */
export function simpleEmailHtml(lang: string, heading: string, paragraphs: string[]): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('\n');
  return `<!doctype html>
<html lang="${lang}">
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;background:#fff">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
${body}
</body>
</html>
`;
}
