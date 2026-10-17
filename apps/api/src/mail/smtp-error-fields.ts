/**
 * Diagnosable SMTP failure fields without the message: nodemailer appends the server's reply
 * to it, and replies usually quote the recipient address (rule 09).
 */
export function smtpErrorFields(error: unknown): Record<string, string | number> {
  if (!(error instanceof Error)) return { error: 'non-error' };
  const { code, responseCode, command } = error as {
    code?: unknown;
    responseCode?: unknown;
    command?: unknown;
  };
  return {
    error: error.name,
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof responseCode === 'number' ? { responseCode } : {}),
    ...(typeof command === 'string' ? { command } : {}),
  };
}
