import type { ObjectStorage } from '../../src/storage/object-storage.js';

/** Stores a small object through a presigned PUT, as a browser would. */
export async function putObject(
  storage: ObjectStorage,
  key: string,
  body: string = 'x',
): Promise<void> {
  const data = new TextEncoder().encode(body);
  const url = await storage.presignPut(key, {
    contentType: 'application/octet-stream',
    contentLength: data.length,
    expiresInSeconds: 60,
  });
  const res = await fetch(url, {
    method: 'PUT',
    body: data,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`test PUT failed with ${res.status}`);
}

/** Every key under `prefix`, across pages. */
export async function allKeys(storage: ObjectStorage, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await storage.listKeys(prefix, token === undefined ? {} : { token });
    keys.push(...page.keys);
    token = page.nextToken;
  } while (token !== undefined);
  return keys;
}
