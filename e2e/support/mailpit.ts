const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
}

async function search(to: string): Promise<MailpitSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()) as { messages: MailpitSummary[] }).messages;
}

/** Polls Mailpit for the newest sign-in link sent to `to` and returns its URL. */
export async function latestMagicLink(to: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [newest] = await search(to);
    if (newest !== undefined) {
      const res = await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`);
      const text = ((await res.json()) as { Text: string }).Text;
      const link = /(https?:\/\/\S+\/auth\/verify\?token=[A-Za-z0-9_-]+)/.exec(text)?.[1];
      if (link !== undefined) return link;
    }
    if (Date.now() > deadline) throw new Error(`no sign-in email for ${to}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Subjects of the emails sent to `to`, newest first. */
export async function mailSubjects(to: string): Promise<string[]> {
  return (await search(to)).map((message) => message.Subject);
}
