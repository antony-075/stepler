const MAILPIT = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
}

async function search(to: string): Promise<MailpitSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()) as { messages: MailpitSummary[] }).messages;
}

/** Waits until `count` messages to `to` exist (mail is sent after the 202 response). */
export async function waitForMessages(
  to: string,
  count = 1,
  timeoutMs = 5000,
): Promise<MailpitSummary[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const messages = await search(to);
    if (messages.length >= count || Date.now() > deadline) return messages;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Resolves after `ms` with the current messages, to assert that nothing (more) arrived. */
export async function messagesAfter(to: string, ms: number): Promise<MailpitSummary[]> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return search(to);
}

/** The plain-text body of a message. */
export async function messageText(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return ((await res.json()) as { Text: string }).Text;
}

/** The `token` query value of an account mail's link (verification or reset) in the text. */
export async function mailedToken(id: string): Promise<string> {
  const text = await messageText(id);
  const token = /\/(?:auth\/verify|reset-password|delete-account)\?token=([A-Za-z0-9_-]{43})/.exec(
    text,
  )?.[1];
  if (token === undefined) throw new Error('no account link in the message');
  return token;
}
