import { guestPageVersionSchema, type GuestPageVersion } from '@stepler/contracts';
import { z } from 'zod';

// The editor ↔ preview protocol (plan Task 12, ADR 0017). The editor's iframe is the same-origin
// route /preview/collections/{id}; the editor posts the working copy as one guest page version,
// the preview answers once that it is ready to receive. Both sides check the origin, the window
// the message came from and the shape, so no other page or frame can drive the preview.

export const PREVIEW_MESSAGE = 'stepler:guest-page-preview';
export const PREVIEW_READY = 'stepler:guest-page-preview-ready';

export const previewMessageSchema = z
  .object({ type: z.literal(PREVIEW_MESSAGE), version: z.literal(1), page: guestPageVersionSchema })
  .strict();
export type PreviewMessage = z.infer<typeof previewMessageSchema>;

const readySchema = z.object({ type: z.literal(PREVIEW_READY) }).strict();

type Envelope = Pick<MessageEvent, 'origin' | 'source' | 'data'>;

/** The page in a message from `expectedSource` on this origin, or `null` for anything else. */
export function acceptPreviewMessage(
  event: Envelope,
  expectedSource: MessageEventSource | null,
  origin: string = globalThis.location.origin,
): GuestPageVersion | null {
  if (event.origin !== origin || expectedSource === null || event.source !== expectedSource) {
    return null;
  }
  const parsed = previewMessageSchema.safeParse(event.data);
  return parsed.success ? parsed.data.page : null;
}

/** True for the preview's «ready» from `expectedSource` (the iframe's window) on this origin. */
export function isPreviewReady(
  event: Envelope,
  expectedSource: MessageEventSource | null,
  origin: string = globalThis.location.origin,
): boolean {
  return (
    event.origin === origin &&
    expectedSource !== null &&
    event.source === expectedSource &&
    readySchema.safeParse(event.data).success
  );
}

export function previewMessage(page: GuestPageVersion): PreviewMessage {
  return { type: PREVIEW_MESSAGE, version: 1, page };
}

export const previewReadyMessage = { type: PREVIEW_READY } as const;
