import { z } from 'zod';

/** A keyset position over `(createdAt, id)`, newest first (ADR 0004). */
export interface CursorPosition {
  createdAt: Date;
  id: string;
}

const cursorPayloadSchema = z.object({ c: z.iso.datetime(), i: z.uuid() }).strict();

/** Opaque to clients: base64url JSON. Not signed, since it only narrows an owner-scoped query. */
export function encodeCursor(position: CursorPosition): string {
  const payload = { c: position.createdAt.toISOString(), i: position.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** `null` for anything that is not a cursor this API issued. */
export function decodeCursor(cursor: string): CursorPosition | null {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = cursorPayloadSchema.safeParse(json);
  return parsed.success ? { createdAt: new Date(parsed.data.c), id: parsed.data.i } : null;
}
