import { guestPageVersionSchema, type GuestPageVersion } from '@stepler/contracts';
import { z } from 'zod';
import { DEFAULT_PREVIEW_STATE, type PreviewState, previewStateSchema } from './preview-state';

// The editor ↔ preview protocol (plan Task 12, ADR 0017). The editor's iframe is the same-origin
// route /preview/collections/{id}; the editor posts the working copy as one guest page version,
// the preview answers once that it is ready to receive. Both sides check the origin, the window
// the message came from and the shape, so no other page or frame can drive the preview. The
// message also says which guest page state to show (owner remarks 77, 92; `preview-state.ts`):
// what the link allows, and what is on the page.

export const PREVIEW_MESSAGE = 'stepler:guest-page-preview';
export const PREVIEW_READY = 'stepler:guest-page-preview-ready';

export const previewMessageSchema = z
  .object({
    type: z.literal(PREVIEW_MESSAGE),
    version: z.literal(1),
    page: guestPageVersionSchema,
    state: previewStateSchema,
  })
  .strict();
export type PreviewMessage = z.infer<typeof previewMessageSchema>;
export type PreviewView = Pick<PreviewMessage, 'page' | 'state'>;

const readySchema = z.object({ type: z.literal(PREVIEW_READY) }).strict();

type Envelope = Pick<MessageEvent, 'origin' | 'source' | 'data'>;

/**
 * The page and state in a message from `expectedSource` on this origin, or `null` for anything
 * else.
 */
export function acceptPreviewMessage(
  event: Envelope,
  expectedSource: MessageEventSource | null,
  origin: string = globalThis.location.origin,
): PreviewView | null {
  if (event.origin !== origin || expectedSource === null || event.source !== expectedSource) {
    return null;
  }
  const parsed = previewMessageSchema.safeParse(event.data);
  return parsed.success ? { page: parsed.data.page, state: parsed.data.state } : null;
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

export function previewMessage(
  page: GuestPageVersion,
  state: PreviewState = DEFAULT_PREVIEW_STATE,
): PreviewMessage {
  return { type: PREVIEW_MESSAGE, version: 1, page, state };
}

export const previewReadyMessage = { type: PREVIEW_READY } as const;
