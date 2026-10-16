const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
}

async function search(to: string): Promise<MailpitSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()) as { messages: MailpitSummary[] }).messages;
}

/**
 * Polls Mailpit for the newest account link sent to `to` (ADR 0019: «Підтвердіть пошту» or
 * «Новий пароль») and returns its URL. Other mail to the same address (the operator's «нова
 * скарга», slice 9) has no such link and is skipped.
 */
export async function latestAuthLink(
  to: string,
  kind: 'verify' | 'reset' = 'verify',
  timeoutMs = 15_000,
  /** Messages already there before the request (a reused address): never one of them. */
  seen: ReadonlySet<string> = new Set(),
): Promise<string> {
  const path = kind === 'verify' ? '/auth/verify' : '/reset-password';
  const pattern = new RegExp(`(https?://\\S+${path}\\?token=[A-Za-z0-9_-]+)`);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const message of (await search(to)).filter((m) => !seen.has(m.ID))) {
      const res = await fetch(`${MAILPIT}/api/v1/message/${message.ID}`);
      const text = ((await res.json()) as { Text: string }).Text;
      const link = pattern.exec(text)?.[1];
      if (link !== undefined) return link;
    }
    if (Date.now() > deadline) throw new Error(`no ${kind} email for ${to}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Subjects of the emails sent to `to`, newest first. */
export async function mailSubjects(to: string): Promise<string[]> {
  return (await search(to)).map((message) => message.Subject);
}

/**
 * Polls Mailpit for a message to `to` whose subject contains `subjectPart` (and whose text
 * contains `bodyPart`, when given: many report mails share one operator inbox) and returns its
 * subject and plain text. Mail is sent by the worker, so this waits.
 */
export async function waitForMail(
  to: string,
  subjectPart: string,
  bodyPart?: string,
  timeoutMs = 30_000,
): Promise<{ subject: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const message of (await search(to)).filter((m) => m.Subject.includes(subjectPart))) {
      const res = await fetch(`${MAILPIT}/api/v1/message/${message.ID}`);
      const text = ((await res.json()) as { Text: string }).Text;
      if (bodyPart === undefined || text.includes(bodyPart)) {
        return { subject: message.Subject, text };
      }
    }
    if (Date.now() > deadline) throw new Error(`no «${subjectPart}» email for ${to}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/** The ids of every message to `to` now, to wait for a newer one on a reused address. */
export async function messageIds(to: string): Promise<Set<string>> {
  return new Set((await search(to)).map((message) => message.ID));
}
